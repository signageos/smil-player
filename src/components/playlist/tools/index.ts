import Debug from 'debug';
import get = require('lodash/get');
import isNil = require('lodash/isNil');
import cloneDeep = require('lodash/cloneDeep');
import { RegionAttributes, RegionsObject, InfiniteLoopObject, PrefetchObject, SmilScheduleObject } from '../../../models';
import { defaults as config } from '../../../config';
import { SMILScheduleEnum } from '../../../enums';
import moment from 'moment';

export const debug = Debug('@signageos/smil-player:playlistModule');

let cancelFunction = false;

export function disableLoop(value: boolean) {
	cancelFunction = value;
}
// checks if given object contains prefetch element
function checkPrefetchObject(obj: PrefetchObject, path: string): boolean {
	return get(obj, path, 'notFound') === 'notFound';
}
/*	used for detection infinite loops in SMIL file
	these are seq or par section which does not contain any media files:
	example:
	seq: [{
		dur: "60s"
	}, {
		prefetch: [{
			src: "http://butikstv.centrumkanalen.com/play/render/widgets/ebbapettersson/top/top.wgt"
		}, {
			src: "http://butikstv.centrumkanalen.com/play/render/widgets/ebbapettersson/vasttrafik/vasttrafik_news.wgt"
		}, {
			src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbalunch.png"
		}, {
			src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbaical.png"
		}]
	}]
*/
export function detectPrefetchLoop(obj: InfiniteLoopObject): boolean {
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

	return result;
}

export async function sleep(ms: number): Promise<object> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

export async function runEndlessLoop(fn: Function) {
	while (!cancelFunction) {
		try {
			await fn();
		} catch (err) {
			debug('Error: %O occured during processing function %s', err, fn.name);
			throw err;
		}
	}
}

export function fixVideoDimension(regionInfo: RegionAttributes): RegionAttributes {
	const resultObject: any = cloneDeep(regionInfo);
	Object.keys(resultObject).forEach((attr: string) => {
		// sos video does not support values in %
		if (config.constants.cssElementsPosition.includes(attr) && resultObject[attr].indexOf('%') > 0) {
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
	let regionInfo = get(regionObject.region, regionName, regionObject.rootLayout);
	// unify regionName for further uses in code
	if (regionInfo.hasOwnProperty(config.constants.regionNameAlias)) {
		regionInfo.regionName = regionInfo[config.constants.regionNameAlias];
		delete regionInfo[config.constants.regionNameAlias];
	}

	regionInfo = fixVideoDimension(regionInfo);
	debug('Getting region info: %O for region name: %s', regionInfo, regionName);
	regionInfo = {
		...regionInfo,
		...(!isNil(regionInfo.top) && { top: parseInt(regionInfo.top)}),
		...(!isNil(regionInfo.left) && { left: parseInt(regionInfo.left)}),
		width: parseInt(regionInfo.width),
		height: parseInt(regionInfo.height),
	};
	return regionInfo;
}
// default endTime for infinite duration when there is no endTime specified, example string wallclock(R/2100-01-01T00:00:00/P1D)
export function parseSmilSchedule(startTime: string, endTime: string = SMILScheduleEnum.endTimeFuture): SmilScheduleObject {
	debug('Received startTime: %s and endTime: %s strings', startTime, endTime);

	// remove extra characters, wallclock, ( and )
	const dateStringStart = startTime.replace(/wallclock|\(|\)/g, '');
	const dateStringEnd = endTime.replace(/wallclock|\(|\)/g, '');

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
	const dateAndTimeStart = splitStringStart[1].split('T');
	const dateAndTimeEnd = splitStringEnd[1].split('T');

	let datePart: string = nowDay;
	const timePartStart = dateAndTimeStart[1];
	const timePartEnd = dateAndTimeEnd[1];

	// scheduled time to start is in the past
	if (timeToStart < 0) {
		// startTime is in the past, endTime in the future and scheduled week day is same as todays week day ( or no weekday specified )
		if ((dateAndTimeStart[1] <= nowTime) && (nowTime <= dateAndTimeEnd[1]) && (dayInfoStart === '' || parseInt(dayInfoStart[2]) === today)) {
			timeToStart = 0;
			timeToEnd = moment(`${datePart}T${timePartEnd}`).valueOf();
			debug('play immediately');
			debug('Wait before start: %s and play until: %s', timeToStart, timeToEnd);
			return {
				timeToStart,
				timeToEnd,
			};
		}

		// startTime and endTime both in the past, or its scheduled for different weekDay
		datePart = computeScheduledDate(moment(), nowTime, dateAndTimeStart[1], dateAndTimeStart[0], dayInfoStart);
		timeToStart = moment(`${datePart}T${timePartStart}`).valueOf() - nowMillis;

		datePart = computeScheduledDate(moment(nowDay), nowTime, dateAndTimeEnd[1], dateAndTimeStart[0], dayInfoStart);
		timeToEnd = moment(`${datePart}T${timePartEnd}`).valueOf();

		// no endTime specified, SMIL element has only begin tag
		if (endTime === SMILScheduleEnum.endTimeFuture) {
			timeToEnd = moment(`${dateAndTimeEnd[0]}T${timePartEnd}`).valueOf();
		}

		debug('schedule for tomorrow');
		debug('Wait before start: %s and play until: %s', timeToStart, timeToEnd);
		return {
			timeToStart,
			timeToEnd,
		};

	}

	// startTime and endTime both in the future, pick correct weekday if specified
	datePart = computeScheduledDate(moment(dateAndTimeStart[0]), nowTime, dateAndTimeStart[1], dateAndTimeStart[0], dayInfoStart);
	timeToStart = moment(`${datePart}T${timePartStart}`).valueOf() - nowMillis;

	datePart = computeScheduledDate(moment(dateAndTimeEnd[0]), nowTime, dateAndTimeEnd[1], dateAndTimeEnd[0], dayInfoStart);
	timeToEnd = moment(`${datePart}T${timePartEnd}`).valueOf();

	debug('all in future');
	debug('Wait before start: %s and play until: %s', timeToStart, timeToEnd);
	return {
		timeToStart,
		timeToEnd,
	};
}

// tslint:disable-next-line:max-line-length
export function computeScheduledDate(startDate: moment.Moment, nowTime: string, scheduledTime: string, scheduledDate: string, dayInfo: string) {
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
			return returnDate < scheduledDate ? returnDate : SMILScheduleEnum.endTimePast;
		} else {
			const returnDate =  moment().add(1, 'weeks').isoWeekday(scheduledDay).format('YYYY-MM-DD');
			// return default date in the past if scheduledDate from SMIL is already in the past
			return returnDate < scheduledDate ? returnDate : SMILScheduleEnum.endTimePast;
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
