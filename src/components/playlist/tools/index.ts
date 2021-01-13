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
	PriorityObject, CurrentlyPlayingRegion, SMILMediaSingle, ParsedConditionalExpr,
} from '../../../models';
import { ObjectFitEnum, SMILScheduleEnum, XmlTags, SMILEnums, DeviceModels, ConditionalExprEnum } from '../../../enums';
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
export function setDefaultAwaitWallclock(elementsArray: PlaylistElement[]): number {
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
 * function to set defaultAwait in case of no active element in conditional expression schedule to avoid infinite loop
 * @param elementsArray - array of SMIL media playlists ( seq, or par tags )
 * @param playerName
 * @param playerId
 */
export function setDefaultAwaitConditional(elementsArray: PlaylistElement[], playerName: string, playerId: string): number {
	// found element which can be player right now
	for (const loopElem of elementsArray) {
		if (!isConditionalExpExpired(loopElem, playerName, playerId)) {
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
 * @param isTrigger - determines if element is trigger element or ordinary one ( trigger is played on demand )
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

export function isConditionalExpExpired(
		element: SMILMediaSingle | PlaylistElement | PlaylistElement[], playerName: string = '', playerId: string = '',
	): boolean {
	if (Array.isArray(element)) {
		return setDefaultAwaitConditional(element, playerName, playerId) !== 0;
	}
	return (element.hasOwnProperty(ConditionalExprEnum.exprTag) && !checkConditionalExp(element.expr!, playerName, playerId));
}

/**
 * Checks if conditional expression evaluates true or false
 * @param expresion - conditional expression such as adapi-compare('2030-01-01T00:00:00', adapi-date())&lt;0
 * @param playerName - name of player specified in sos timings config ( sos.config.playerName )
 * @param playerId - id of player specified in sos timings config ( sos.config.playerId )
 */
export function checkConditionalExp(expresion: string, playerName: string = '', playerId: string = ''): boolean {
	let conditionOperator = '';
	let conditionArray: string[];
	conditionArray = [expresion];
	if (expresion.indexOf(' and ') > -1) {
		conditionArray = expresion.split(' and ');
		conditionOperator = 'and';
	}

	if (expresion.indexOf(' or ') > -1) {
		conditionArray = expresion.split(' or ');
		conditionOperator = 'or';
	}

	for (const element of conditionArray) {
		const response = parseConditionalExp(element, playerName, playerId);
		if (!response && conditionOperator !== 'or') {
			return false;
		}

		if (response && conditionOperator !== 'and') {
			return true;
		}
	}
	/**
	 * if condition operator is "and" and no false condition was found, return true. Otherwise return false,
	 * because composed OR condition or single condition would return true value earlier.
	 */
	return conditionOperator === 'and';
}

/**
 * Evaluates expression comparing days in week expr="adapi-weekday()=1" or expr="adapi-gmweekday()=1"
 * week days 0 (Sunday) to 6 (Saturday)
 * @param element - conditional expression such as expr="adapi-weekday()=1"
 * @param weekDay - parameter specifying which time format to use adapi-weekday() or adapi-gmweekday()
 * @param isUtc -  if date is in UTC or not
 */
function parseWeekDayExpr(element: string, weekDay: string, isUtc: boolean): boolean {
	let firstArgument;
	let secondArgument;
	let comparator;
	if (element.indexOf(weekDay) === 0) {
		firstArgument = generateCurrentDate(isUtc).day();
		secondArgument = parseInt(element.slice(weekDay.length).slice(-1));
		comparator = element.slice(weekDay.length).slice(0, -1);
		return compareValues(firstArgument, secondArgument, comparator);
	} else {
		firstArgument = parseInt(element.slice(0, 1));
		secondArgument = generateCurrentDate(isUtc).day();
		comparator = element.slice(0, element.indexOf(weekDay[0])).slice(1);
		return compareValues(firstArgument, secondArgument, comparator);
	}
}

/**
 * Evaluates expression comparing two dates expr="adapi-compare(adapi-date(),'2010-01-01T00:00:00')&lt;0"
 * @param firstArgument - simple date expression adapi-date() or date specified 2010-01-01T00:00:00
 * @param secondArgument - simple date expression adapi-date() or date specified 2010-01-01T00:00:00
 * @param comparator - specified how to compare two dates ( &lt; , &lt;=, =, &gt;=, &gt; )
 * @param isUtc -  if date is in UTC or not
 */
function parseSimpleDateExpr(firstArgument: string, secondArgument: string, comparator: string, isUtc: boolean): boolean {
	if (firstArgument === ConditionalExprEnum.currentDate) {
		firstArgument = generateCurrentDate(isUtc).format(ConditionalExprEnum.dateFormat);
		if (isIsoDate(secondArgument)) {
			secondArgument = moment(secondArgument).format(ConditionalExprEnum.dateFormat);
		}
	}

	if (secondArgument === ConditionalExprEnum.currentDate) {
		secondArgument = generateCurrentDate(isUtc).format(ConditionalExprEnum.dateFormat);
		if (isIsoDate(firstArgument)) {
			firstArgument = moment(firstArgument).format(ConditionalExprEnum.dateFormat);
		}
	}

	return compareValues(firstArgument, secondArgument, comparator);
}

/**
 * Evaluates expression comparing playerID or playerName expr="adapi-compare(smil-playerId(),'playerId')" or
 * expr="adapi-compare(smil-playerName(),'Entrance')"
 * @param firstArgument - smil-playerName or smil-playerId or string identifier
 * @param removedFirstArgument - expression string without first argument such as 'playerId')"
 * @param playerIdentification - playerName or playedId from sos.config object
 */
function parsePlayerIdsExpr(firstArgument: string, removedFirstArgument: string, playerIdentification: string) {
	let secondArgument;
	if (firstArgument === ConditionalExprEnum.playerId || firstArgument === ConditionalExprEnum.playerName) {
		secondArgument = removedFirstArgument.indexOf(',') > -1 ? removedFirstArgument.slice(1, -1) : removedFirstArgument;
		return secondArgument === playerIdentification;
	} else {
		return firstArgument === playerIdentification;
	}
}

/**
 * Parses expression string into separate arguments adapi-compare('17:00:00', substring-after(adapi-date(), 'T')) &gt; 0"
 * @param element - conditional expression such as expr="adapi-weekday()=1"
 */
function parseCompareExpr(element: string): ParsedConditionalExpr {
	let firstArgument;
	let secondArgument;
	let comparator;
	const removedCompare = element.slice(ConditionalExprEnum.compareConst.length);
	firstArgument = removedCompare.substring(0, removedCompare.indexOf(','));
	if (removedCompare.startsWith(ConditionalExprEnum.substring)) {
		firstArgument = removedCompare.substring(0, getPosition(removedCompare, ',', 2));
	}
	const removedFirstArgument = removedCompare.slice(firstArgument.length + 1);

	if (removedFirstArgument.indexOf('&') > -1 ) {
		[ secondArgument, comparator] = removedFirstArgument.split('&');
	} else if (removedFirstArgument.indexOf('=') > -1 ) {
		secondArgument = removedFirstArgument.split('=')[0];
		comparator = '=';
	} else {
		// compare not lower, greater but for exact string matching (playerId, playerName) expr="adapi-compare(smil-playerName(),'Entrance')"
		secondArgument = removedFirstArgument;
		comparator = '';
	}

	return {
		firstArgument,
		removedFirstArgument,
		secondArgument,
		comparator,
	};
}

/**
 * Parses nested substring expression substring-after(adapi-date(), 'T')
 * @param argument part of conditional expression such as substring-after(adapi-date(), 'T')
 */
function parseSubstringExpr(argument: string): string {
	let [ innerFirst, innerSecond ] = argument.slice(ConditionalExprEnum.substringAfter.length).split(',');
	if (innerFirst === ConditionalExprEnum.currentDate) {
		argument = generateCurrentDate(false).format(ConditionalExprEnum.dateAndTimeFormat).split(innerSecond)[1];
	}
	if (innerSecond === ConditionalExprEnum.currentDate) {
		argument = generateCurrentDate(false).format(ConditionalExprEnum.dateAndTimeFormat).split(innerFirst)[1];
	}
	return argument;
}

/**
 * Evaluates unparsed expression expr="adapi-compare(adapi-date(),'2010-01-01T00:00:00')&lt;0"
 * @param elementExpr - conditional expression expr="adapi-compare(adapi-date(),'2010-01-01T00:00:00')&lt;0"
 * @param playerName - name of player specified in sos timings config ( sos.config.playerName )
 * @param playerId - id of player specified in sos timings config ( sos.config.playerId )
 */
function parseConditionalExp(elementExpr: string, playerName: string = '', playerId: string = '') {
	let element = removeUnnecessaryCharacters(elementExpr);

	if (element.indexOf(ConditionalExprEnum.weekDay) > -1) {
		return parseWeekDayExpr(element, ConditionalExprEnum.weekDay, false);
	}

	if (element.indexOf(ConditionalExprEnum.weekDayUtc) > -1) {
		return parseWeekDayExpr(element, ConditionalExprEnum.weekDayUtc, true);
	}

	if (element.indexOf(ConditionalExprEnum.compareConst) > -1) {

		let {
			firstArgument,
			removedFirstArgument,
			secondArgument,
			comparator,
		} = parseCompareExpr(element);

		if (element.indexOf(ConditionalExprEnum.playerId) > -1) {
			return parsePlayerIdsExpr(firstArgument, removedFirstArgument, playerId);
		}

		if (element.indexOf(ConditionalExprEnum.playerName) > -1) {
			return parsePlayerIdsExpr(firstArgument, removedFirstArgument, playerName);
		}

		if (firstArgument === ConditionalExprEnum.currentDate ||
			secondArgument === ConditionalExprEnum.currentDate) {
			return parseSimpleDateExpr(firstArgument, secondArgument, comparator, false);
		}

		if (firstArgument === ConditionalExprEnum.currentDateUTC ||
			secondArgument === ConditionalExprEnum.currentDateUTC) {
			return parseSimpleDateExpr(firstArgument, secondArgument, comparator, false);
		}

		if (typeof firstArgument === 'string' && firstArgument.startsWith(ConditionalExprEnum.substringAfter)) {
			firstArgument = parseSubstringExpr(firstArgument);
			return compareValues(firstArgument, secondArgument, comparator);
		}

		if (typeof secondArgument === 'string' && secondArgument.startsWith(ConditionalExprEnum.substringAfter)) {
			secondArgument = parseSubstringExpr(secondArgument);
			return compareValues(firstArgument, secondArgument, comparator);
		}

	}

	debug('Conditional expression format is not supported: %s', element);
	return false;
}

/**
 * adapi-compare(adapi-date(),'2010-01-01T00:00:00')&lt;0 => adapi-compareadapi-date,2010-01-01T00:00:00&lt;0
 * @param expr - conditional expression adapi-compare(adapi-date(),'2010-01-01T00:00:00')&lt;0
 */
function removeUnnecessaryCharacters(expr: string): string {
	let parsedExpr = expr;
	parsedExpr = parsedExpr.replace(/\s/g, '');
	parsedExpr = parsedExpr.replace(/\)/g, '');
	parsedExpr = parsedExpr.replace(/\(/g, '');
	parsedExpr = parsedExpr.replace(/\'/g, '');
	parsedExpr = parsedExpr.replace(/>/g, '&gt;');
	parsedExpr = parsedExpr.replace(/</g, '&lt;');

	return parsedExpr;
}

/**
 * check if values and specified comparator match
 * @param firstArgument - string or number to compare
 * @param secondArgument - string or number to compare
 * @param comparator - specified how to compare two dates ( &lt; , &lt;=, =, &gt;=, &gt; )
 */
function compareValues(firstArgument: string | number, secondArgument: string | number, comparator: string) {
	if ( firstArgument < secondArgument && comparator.indexOf('lt;') > -1 ) {
		return true;
	}

	if ( firstArgument > secondArgument && comparator.indexOf('gt;') > -1 ) {
		return true;
	}

	return firstArgument === secondArgument && comparator.indexOf('=') > -1;
}

function isIsoDate(dateString: string) {
	if (!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dateString)) { return false; }
	let d = moment(dateString).utc(true);
	const stringDate = d.toISOString().indexOf('Z') > -1 ? d.toISOString().substring(0, d.toISOString().length - 5) : d.toISOString();
	return stringDate === dateString;
}

function generateCurrentDate(utc: boolean) {
	if (utc) {
		return moment().utc();
	}
	return moment();
}

/**
 * finds index of nth occurrence of substring specified by count
 * @param string - t,est,
 * @param subString ,
 * @param count 2 = returns second index of ',' in string 't,est,'
 */
function getPosition(string: string, subString: string, count: number) {
	return string.split(subString, count).join(subString).length;
}
