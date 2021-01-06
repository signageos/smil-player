import Debug from 'debug';
import get = require('lodash/get');
import isNil = require('lodash/isNil');
import cloneDeep = require('lodash/cloneDeep');
import {
	RegionAttributes,
	RegionsObject,
	InfiniteLoopObject,
	PrefetchObject,
	SmilScheduleObject,
	SMILVideo,
	SMILImage,
	SMILAudio,
	SMILWidget, PlaylistElement,
	PriorityObject, CurrentlyPlayingRegion,
} from '../../../models';
import { ObjectFitEnum, SMILScheduleEnum, XmlTags, SMILEnums, DeviceModels } from '../../../enums';
import moment from 'moment';
import { getFileName, getRandomInt } from '../../files/tools';
import { parseNestedRegions }  from '../../xmlParser/tools';

export const debug = Debug('@signageos/smil-player:playlistModule');

function checkPrefetchObject(obj: PrefetchObject, path: string): boolean {
	return get(obj, path, 'notFound') === 'notFound';
}

/**
 * used for detection infinite loops in SMIL file
 * these are seq or par section which does not contain any media files:
 * 	example:
 * 		seq: [{
 * 			dur: "60s"
 * 			}, {
 * 			prefetch: [{
 * 				src: "http://butikstv.centrumkanalen.com/play/render/widgets/ebbapettersson/top/top.wgt"
 * 					}, {
 * 				src: "http://butikstv.centrumkanalen.com/play/render/widgets/ebbapettersson/vasttrafik/vasttrafik_news.wgt"
 * 					}, {
 * 				src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbalunch.png"
 * 					}, {
 * 				src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbaical.png"
 * 					}]
 * 				}]
 * @param obj
 */
export function isNotPrefetchLoop(obj: InfiniteLoopObject | PlaylistElement): boolean {
	let result = true;
	if (Array.isArray(get(obj, 'seq', 'notFound'))) {
		(<PrefetchObject[]> get(obj, 'seq', 'notFound')).forEach((elem: PrefetchObject) => {
			result = checkPrefetchObject(elem, 'prefetch');
		});
	}

	if (Array.isArray(get(obj, 'par', 'notFound'))) {
		(<PrefetchObject[]> get(obj, 'par', 'notFound')).forEach((elem: PrefetchObject) => {
			result = checkPrefetchObject(elem, 'prefetch');
		});
	}
	if (get(obj, 'seq.prefetch', 'notFound') !== 'notFound') {
		result = false;
	}

	if (get(obj, 'par.prefetch', 'notFound') !== 'notFound') {
		result = false;
	}

	// black screen check, will be removed in future versions
	if (get(obj, 'seq.ref.src', 'notFound') === 'adapi:blankScreen') {
		result = false;
	}

	// black screen check, will be removed in future versions
	if (get(obj, 'par.ref.src', 'notFound') === 'adapi:blankScreen') {
		result = false;
	}

	return result;
}

export async function sleep(ms: number): Promise<object> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

/**
 * function to set defaultAwait in case of no active element in wallclock schedule to avoid infinite loop
 * @param elementsArray - array of SMIL media playlists ( seq, or par tags )
 */
export function setDefaultAwait(elementsArray: PlaylistElement[]): number {
	const nowMillis: number = moment().valueOf();
	// found element which can be player right now
	for (const loopElem of elementsArray) {
		const { timeToStart, timeToEnd } = parseSmilSchedule(loopElem.begin!, loopElem.end);
		if (timeToStart <= 0 && timeToEnd > nowMillis) {
			return 0;
		}
	}

	return SMILScheduleEnum.defaultAwait;
}

/**
 * set correct dimensions to work on all displays correctly, changes values from % to fix numbers ( 50% -> 800px )
 * @param regionInfo - represents object with information about dimensions of region specified in smil file
 */
export function fixVideoDimension(regionInfo: RegionAttributes): RegionAttributes {
	const resultObject: any = cloneDeep(regionInfo);

	Object.keys(resultObject).forEach((attr: string) => {
		// sos video does not support values in %
		if (XmlTags.cssElementsPosition.includes(attr) && resultObject[attr].indexOf('%') > 0) {
			switch (attr) {
				case 'width':
					resultObject.width = Math.floor(document.documentElement.clientWidth * parseInt(resultObject.width) / 100);
					break;
				case 'height':
					resultObject.height = Math.floor(document.documentElement.clientHeight * parseInt(resultObject.height) / 100);
					break;
				case 'left':
					resultObject.left = Math.floor(document.documentElement.clientWidth * parseInt(resultObject.left) / 100);
					break;
				case 'top':
					resultObject.top = Math.floor(document.documentElement.clientHeight * parseInt(resultObject.top) / 100);
					break;
				default:
				// unhandled attribute
			}
		}
	});

	return resultObject;
}

export function getRegionInfo(regionObject: RegionsObject, regionName: string): RegionAttributes {
	let regionInfo = <RegionAttributes> get(regionObject.region, regionName, regionObject.rootLayout);
	// unify regionName for further uses in code ( xml:id -> regionName )
	if (regionInfo.hasOwnProperty(XmlTags.regionNameAlias)) {
		regionInfo.regionName = <string> regionInfo[XmlTags.regionNameAlias];
		delete regionInfo[XmlTags.regionNameAlias];
	}

	regionInfo = fixVideoDimension(regionInfo);
	// fix nested regions and its values for dynamic use
	if (regionInfo.hasOwnProperty(SMILEnums.region)) {
		regionInfo = parseNestedRegions(regionInfo);
	}
	debug('Getting region info: %O for region name: %s', regionInfo, regionName);
	regionInfo = {
		...regionInfo,
		...(!isNil(regionInfo.top) && { top: parseInt(String(regionInfo.top))}),
		...(!isNil(regionInfo.left) && { left: parseInt(String(regionInfo.left))}),
		width: parseInt(String(regionInfo.width)),
		height: parseInt(String(regionInfo.height)),
	};
	return regionInfo;
}

/**
 * responsible for computing if and how long should player wait before playing certain content
 * default endTime for infinite duration when there is no endTime specified, example string wallclock(R/2100-01-01T00:00:00/P1D)
 * @param startTime - when to start play media, defined in smil file
 * @param endTime - when to end playback, defined in smil file
 */
export function parseSmilSchedule(startTime: string, endTime: string = SMILScheduleEnum.endDateAndTimeFuture): SmilScheduleObject {
	debug('Received startTime: %s and endTime: %s strings', startTime, endTime);

	// remove extra characters, wallclock, ( and )
	let dateStringStart = startTime.replace(/wallclock|\(|\)/g, '');
	let dateStringEnd = endTime.replace(/wallclock|\(|\)/g, '');

	// normalize date string in case its only date and time 2100-01-01T00:00:00 -> Q/2100-01-01T00:00:00/NoRepeat
	// purpose is to have same format for all strings, but preserve repeating rules of strings like 2100-01-01T00:00:00
	dateStringStart = dateStringStart.indexOf('/') !== -1 ? dateStringStart : `W/${dateStringStart}/NoRepeat`;
	dateStringEnd = dateStringEnd.indexOf('/') !== -1 ? dateStringEnd : `W/${dateStringEnd}/NoRepeat`;

	const splitStringStart = dateStringStart.split('/');
	const splitStringEnd = dateStringEnd.split('/');

	// helper constants
	const nowMillis: number = moment().valueOf();
	const nowTime: string = moment().format("HH:mm:ss");
	const nowDay: string = moment().format('YYYY-MM-DD');
	const today: number = moment().isoWeekday();

	// remove dayInfo from string
	const normSplitStringStart = extractDayInfo(splitStringStart[1]);
	const normSplitStringEnd = extractDayInfo(splitStringEnd[1]);

	// timeRecord without dayInfo
	splitStringStart[1] = normSplitStringStart.timeRecord;
	const dayInfoStart: string = normSplitStringStart.dayInfo;

	splitStringEnd[1] = normSplitStringEnd.timeRecord;

	// check how long to start from now
	let timeToStart: number = moment(splitStringStart[1]).valueOf() - nowMillis;
	let timeToEnd: number;

	// split date and time to array
	const [ dateStart, timeStart ] = splitStringStart[1].split('T');
	const [ dateEnd, timeEnd ] = splitStringEnd[1].split('T');

	let datePart: string = nowDay;

	// scheduled time to start is in the past
	if (timeToStart < 0) {
		// startTime is in the past, endTime in the future and scheduled week day is same as todays week day ( or no weekday specified )
		if (((timeStart <= nowTime || dateStart < nowDay)
			&& ((nowTime <= timeEnd) || (dateStart < dateEnd)))
			&& (dayInfoStart === '' || parseInt(dayInfoStart[2]) === today)) {
			timeToStart = 0;
			timeToEnd = moment(`${datePart}T${timeEnd}`).valueOf();
			// when endTime is in future and content should be played without stop overnight for several days
			if (dateStart < dateEnd) {
				timeToEnd = moment(`${dateEnd}T${timeEnd}`).valueOf();
			}

			// repeat once every day, startTime in future, dayTime in past
			if (timeStart >= nowTime && dateStart < nowDay && splitStringEnd[2] === 'P1D') {
				// startTime and endTime both in the past, or its scheduled for different weekDay
				datePart = computeScheduledDate(moment(), nowTime, timeStart, dateStart, dayInfoStart);
				timeToStart = moment(`${datePart}T${timeStart}`).valueOf() - nowMillis;

				datePart = computeScheduledDate(moment(nowDay), nowTime, timeEnd, dateStart, dayInfoStart);
				timeToEnd = moment(`${datePart}T${timeEnd}`).valueOf();

				debug('schedule for tomorrow');
				debug('Wait before start: %s and play until: %s', timeToStart, timeToEnd);
				return {
					timeToStart,
					timeToEnd,
				};
			}

			// either end date is in past ( date format YYYY-MM-DD ) or the date is same as today, but time format is already in past ( HH:mm:ss )
			// and time is specified without repeating attributes, so it should be played only once when begin tag <= now <= end tag
			if ((dateEnd < nowDay || (dateEnd === nowDay && moment(splitStringEnd[1]).valueOf() < Date.now())) && splitStringEnd[2] !== 'P1D') {
				timeToStart = 0;
				timeToEnd = SMILScheduleEnum.neverPlay;
				debug('wallclock completely in the past, will not be played');
				debug('Wait before start: %s and play until: %s', timeToStart, timeToEnd);
				return {
					timeToStart,
					timeToEnd,
				};
			}

			debug('play immediately');
			debug('Wait before start: %s and play until: %s', timeToStart, timeToEnd);
			return {
				timeToStart,
				timeToEnd,
			};
		}

		// startTime and endTime both in the past, or its scheduled for different weekDay
		datePart = computeScheduledDate(moment(), nowTime, timeStart, dateStart, dayInfoStart);
		timeToStart = moment(`${datePart}T${timeStart}`).valueOf() - nowMillis;

		datePart = computeScheduledDate(moment(nowDay), nowTime, timeEnd, dateStart, dayInfoStart);
		timeToEnd = moment(`${datePart}T${timeEnd}`).valueOf();

		// no endTime specified, SMIL element has only begin tag
		if (endTime === SMILScheduleEnum.endDateAndTimeFuture) {
			timeToEnd = moment(`${dateEnd}T${timeEnd}`).valueOf();
		}

		if ((dateEnd < nowDay || timeEnd < nowTime) && splitStringEnd[2] !== 'P1D') {
			timeToStart = 0;
			timeToEnd = SMILScheduleEnum.neverPlay;
			debug('wallclock completely in the past, will not be played');
			debug('Wait before start: %s and play until: %s', timeToStart, timeToEnd);
			return {
				timeToStart,
				timeToEnd,
			};
		}

		debug('schedule for tomorrow');
		debug('Wait before start: %s and play until: %s', timeToStart, timeToEnd);
		return {
			timeToStart,
			timeToEnd,
		};

	}

	// startTime and endTime both in the future, pick correct weekday if specified
	datePart = computeScheduledDate(moment(dateStart), nowTime, timeStart, dateStart, dayInfoStart);
	timeToStart = moment(`${datePart}T${timeStart}`).valueOf() - nowMillis;

	datePart = computeScheduledDate(moment(dateEnd), nowTime, timeEnd, dateEnd, dayInfoStart);
	timeToEnd = moment(`${datePart}T${timeEnd}`).valueOf();

	debug('all in future');
	debug('Wait before start: %s and play until: %s', timeToStart, timeToEnd);
	return {
		timeToStart,
		timeToEnd,
	};
}

export function computeScheduledDate(
	startDate: moment.Moment, nowTime: string, scheduledTime: string, scheduledDate: string, dayInfo: string) {
	// day of the week when will playing stop
	const terminalDay = startDate.isoWeekday();
	const scheduledDay = parseInt(dayInfo[2]);
	if (dayInfo.startsWith('+')) {
		if ((terminalDay < scheduledDay) || (terminalDay === scheduledDay && nowTime <= scheduledTime)) {
			return startDate.isoWeekday(scheduledDay).format('YYYY-MM-DD');
		} else {
			return startDate.add(1, 'weeks').isoWeekday(scheduledDay).format('YYYY-MM-DD');
		}
	}

	if (dayInfo.startsWith('-')) {
		if ((terminalDay < scheduledDay) || (terminalDay === scheduledDay && nowTime <= scheduledTime)) {
			const returnDate = moment().isoWeekday(scheduledDay).format('YYYY-MM-DD');
			// return default date in the past if scheduledDate from SMIL is already in the past
			return returnDate < scheduledDate ? returnDate : SMILScheduleEnum.endDatePast;
		} else {
			const returnDate =  moment().add(1, 'weeks').isoWeekday(scheduledDay).format('YYYY-MM-DD');
			// return default date in the past if scheduledDate from SMIL is already in the past
			return returnDate < scheduledDate ? returnDate : SMILScheduleEnum.endDatePast;
		}
	}
	// dont schedule for another day, if it still can be played on given day
	if (nowTime <= scheduledTime || startDate.isAfter(moment())) {
		return startDate.format('YYYY-MM-DD');
	}

	return startDate.add(1, 'day').format('YYYY-MM-DD');
}

export function extractDayInfo(timeRecord: string): any {
	let dayInfo: string = '';

	if (timeRecord.indexOf('+') > 0) {
		// extract +w3 from 2100-01-01+w3T00:00:00
		dayInfo = timeRecord.substring(timeRecord.lastIndexOf('+'), timeRecord.lastIndexOf('+') + 3);
		// 2100-01-01+w3T00:00:00 ==> 2100-01-01T00:00:00
		timeRecord = timeRecord.replace(dayInfo, '');
		return {
			timeRecord,
			dayInfo,
		};
	}

	if (timeRecord.indexOf('-') > 0 && timeRecord.toLowerCase().indexOf('w') > 0) {
		// extract -w3 from 2100-01-01-w3T00:00:00
		dayInfo = timeRecord.substring(timeRecord.lastIndexOf('-'), timeRecord.lastIndexOf('-') + 3);
		// 2100-01-01+w3T00:00:00 ==> 2100-01-01T00:00:00
		timeRecord = timeRecord.replace(dayInfo, '');
		return {
			timeRecord,
			dayInfo,
		};
	}

	return {
		timeRecord,
		dayInfo,
	};
}

/**
 * how long should image, audio, widget stay on the screen
 * @param dur - duration of element specified in smil file
 */
export function setElementDuration(dur: string): number {
	if (dur === 'indefinite') {
		return SMILScheduleEnum.infiniteDuration;
	}

	// if duration is undefined
	if (isNil(dur)) {
		return SMILScheduleEnum.defaultDuration;
	}

	// leave only digits in duration string ( can contain s character )
	dur = dur.replace(/[^0-9]/g, "");
	// empty string or NaN
	if (isNaN(Number(dur)) || dur.length === 0) {
		return SMILScheduleEnum.defaultDuration;
	}

	return parseInt(dur, 10);
}

/**
 * extracts additional css tag which are stored directly in video, image etc.. and not in regionInfo
 * @param value - represents SMIL media file object
 */
export function extractAdditionalInfo(value: SMILVideo | SMILAudio | SMILWidget | SMILImage):
	SMILVideo | SMILAudio | SMILWidget | SMILImage {
	// extract additional css info which are not specified in region tag.
	Object.keys(value).forEach((attr: string) => {
		if (XmlTags.additionalCssExtract.includes(attr)) {
			value.regionInfo[attr] = get(value, attr);
		}
	});

	return value;
}

export function generateElementId(filepath: string, regionName: string): string {
	return `${getFileName(filepath)}-${regionName}`;
}

export function createHtmlElement(
	htmlElement: string, filepath: string, regionInfo: RegionAttributes, isTrigger: boolean = false,
): HTMLElement {
	const element: HTMLElement = document.createElement(htmlElement);

	element.id = generateElementId(filepath, regionInfo.regionName);
	Object.keys(regionInfo).forEach((attr: any) => {
		if (XmlTags.cssElementsPosition.includes(attr)) {
			element.style[attr] = `${regionInfo[attr]}px`;
		}
		if (XmlTags.cssElements.includes(attr)) {
			element.style[attr] = <string> regionInfo[attr];
		}
		if (XmlTags.additionalCssExtract.includes(attr)) {
			element.style[<any> ObjectFitEnum.objectFit] = get(ObjectFitEnum, `${regionInfo[attr]}`, 'fill');
		}
	});
	element.style.position = 'absolute';
	element.style.backgroundColor = 'transparent';
	element.style.borderWidth = '0px';
	element.style.display = 'none';

	// set filePAth for trigger images immediately
	if (isTrigger) {
		element.setAttribute('src', filepath);
	}

	return element;
}

export function createPriorityObject(priorityClass: object, priorityLevel: number): PriorityObject {
	return {
		priorityLevel,
		lower: get(priorityClass, 'lower', 'defer'),
		peer: get(priorityClass, 'peer', 'stop'),
		higher: get(priorityClass, 'higher', 'pause'),
		pauseDisplay: get(priorityClass, 'pauseDisplay', 'show'),
	};
}

/**
 * Creates DOM elements for all images and widgets in playlist ( without src, just placeholders )
 * @param value - Smil image or Smil widget
 * @param htmlElement - which htmlElement should be created in DOM ( img or iframe )
 * @param isTrigger
 */
export function createDomElement(value: SMILImage | SMILWidget, htmlElement: string, isTrigger: boolean = false) {
	debug('creating element: %s' + generateElementId(value.localFilePath, value.regionInfo.regionName));
	if ( document.getElementById(generateElementId(value.localFilePath, value.regionInfo.regionName))) {
		debug('element already exists: %s' + generateElementId(value.localFilePath, value.regionInfo.regionName));
		return;
	}

	const localFilePath = value.localFilePath !== ''  ? value.localFilePath : value.src;
	const element = createHtmlElement(htmlElement, localFilePath, value.regionInfo, isTrigger);
	document.body.appendChild(element);
}

export function resetBodyContent() {
	try {
		for (let i = document.images.length; i-- > 0;) {
			debug('Removing images');
			if (!isNil(document.images[i])) {
				document.images[i].parentNode!.removeChild(document.images[i]);
			}
		}
	} catch (err) {
		debug('Error: %O during removing image: %O', err , document.images[document.images.length]);
	}

	// reset body
	document.body.innerHTML = '';
	document.body.style.backgroundColor = 'transparent';
	document.body.style.margin = '0px';
}

export function getStringToIntDefault(value: string): number {
	return parseInt(value) || 0;
}

export function errorVisibility(visible: boolean) {
	const display = visible ? 'block' : 'none';

	(<HTMLElement> document.getElementById('error')).style.display = display;
	(<HTMLElement> document.getElementById('errorText')).style.display = display;
}

export function shouldContinuePlayback(endTime: number, timesPlayed: number): boolean {
	if (endTime >= 1000 && Date.now() <= endTime) {
		return true;
	}
	return endTime < 1000 && timesPlayed < endTime;
}

export function checkSlowDevice(deviceType: string): boolean {
	for (const type of DeviceModels.slowerDevices) {
		if (deviceType.startsWith(type)) {
			return true;
		}
	}
	return false;
}

export function getLastArrayItem(array: any[]): any {
	return array[array.length - 1];
}

// seq-98665
export function generateParentId(tagName: string): string {
	return `${tagName}-${getRandomInt(100000)}`;
}

export function getIndexOfPlayingMedia(currentlyPlaying: CurrentlyPlayingRegion[]): number {
	return currentlyPlaying.findIndex((element) => {
		return (get(element, 'player.playing', false) === true);
	});
}
