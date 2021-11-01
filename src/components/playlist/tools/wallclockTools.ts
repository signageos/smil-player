import moment from "moment";

import { SMILScheduleEnum } from '../../../enums/scheduleEnums';
import { SmilScheduleObject } from '../../../models/scheduleModels';
import { debug } from './generalTools';

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
	let [dateStart, timeStart] = splitStringStart[1].split('T');
	let [dateEnd, timeEnd] = splitStringEnd[1].split('T');

	// in case wallclock string does not have exact time specified (2021-11-01), add default time
	timeStart = timeStart ?  timeStart : SMILScheduleEnum.defaultTime;
	timeEnd = timeEnd ?  timeEnd : SMILScheduleEnum.defaultTime;

	let datePart: string = nowDay;

	// scheduled time to start is in the past
	if (timeToStart < 0) {
		// startTime is in the past, endTime in the future and scheduled week day is same as todays week day ( or no weekday specified )
		if ((((timeStart <= nowTime && dateStart <= nowDay)
			&& ((nowTime <= timeEnd) && (dateStart <= dateEnd)))
			|| ((timeStart <= nowTime || dateStart <= nowDay) && splitStringStart[2] !== 'P1D'))
			&& (dayInfoStart === '' || parseInt(dayInfoStart[2]) === today)) {
			timeToStart = 0;
			timeToEnd = moment(`${datePart}T${timeEnd}`).valueOf();
			// when endTime is in future and content should be played without stop overnight for several days
			if (dateStart < dateEnd && splitStringEnd[2] !== 'P1D' && splitStringStart[2] !== 'P1D') {
				timeToEnd = moment(`${dateEnd}T${timeEnd}`).valueOf();
			}

			// if wallclock is specified like P1D without endTime, set endtTime as end of the day
			if (dateStart < dateEnd && splitStringStart[2] === 'P1D') {
				timeToEnd = moment(`${nowDay}T${timeEnd}`).valueOf();
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

	// if wallclock is specified like P1D without endTime, set endtTime as end of the day
	if (dateStart < dateEnd && splitStringStart[2] === 'P1D') {
		timeToEnd = moment(`${dateStart}T${timeEnd}`).valueOf();
	} else {
		datePart = computeScheduledDate(moment(dateEnd), nowTime, timeEnd, dateEnd, dayInfoStart);
		timeToEnd = moment(`${datePart}T${timeEnd}`).valueOf();
	}

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
			const returnDate = moment().add(1, 'weeks').isoWeekday(scheduledDay).format('YYYY-MM-DD');
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
