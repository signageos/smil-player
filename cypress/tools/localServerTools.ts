import { Moment } from 'moment';

const moment = require('moment');

import { SMILUrls } from '../enums/enums';

export function formatDate(date: Moment): string {
	return date.format('YYYY-MM-DDTHH:mm:ss');
}

export function formatTime(date: Moment): string {
	return date.format('HH:mm:ss');
}

export function fillWallclock(fileString: string, fileName: string): string {
	let parsedFileString = fileString;
	switch (fileName) {
		case SMILUrls.priorityDefer.split('/').pop():
			parsedFileString = parsedFileString.replace(
				'PRIORITY_1_BEGIN',
				`wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'PRIORITY_1_END',
				`wallclock(R/${formatDate(moment().add(15, 'seconds'))}/P1D)`,
			);

			parsedFileString = parsedFileString.replace(
				'PRIORITY_2_BEGIN',
				`wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'PRIORITY_2_END',
				`wallclock(R/${formatDate(moment().add(25, 'seconds'))}/P1D)`,
			);

			parsedFileString = parsedFileString.replace(
				'PRIORITY_3_BEGIN',
				`wallclock(R/${formatDate(moment().subtract(0, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'PRIORITY_3_END',
				`wallclock(R/${formatDate(moment().add(45, 'seconds'))}/P1D)`,
			);
			break;
		case SMILUrls.wallclockFuture.split('/').pop():
			parsedFileString = parsedFileString.replace(
				'PRIORITY_1_BEGIN',
				`wallclock(R/${formatDate(moment().add(20, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'PRIORITY_1_END',
				`wallclock(R/${formatDate(moment().add(35, 'seconds'))}/P1D)`,
			);
			break;
		case SMILUrls.conditionalTimePriority.split('/').pop():
			parsedFileString = parsedFileString.replace(
				'TIME_BEGIN',
				`${formatTime(moment().subtract(60, 'seconds'))}`,
			);
			parsedFileString = parsedFileString.replace('TIME_END', `${formatTime(moment().add(10, 'seconds'))}`);
			break;
		default:
			parsedFileString = parsedFileString.replace(
				'PRIORITY_1_BEGIN',
				`wallclock(R/${formatDate(moment().add(40, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'PRIORITY_1_END',
				`wallclock(R/${formatDate(moment().add(60, 'seconds'))}/P1D)`,
			);

			parsedFileString = parsedFileString.replace(
				'PRIORITY_2_BEGIN',
				`wallclock(R/${formatDate(moment().add(20, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'PRIORITY_2_END',
				`wallclock(R/${formatDate(moment().add(80, 'seconds'))}/P1D)`,
			);

			parsedFileString = parsedFileString.replace(
				'PRIORITY_3_BEGIN',
				`wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'PRIORITY_3_END',
				`wallclock(R/${formatDate(moment().add(10, 'minute'))}/P1D)`,
			);
	}
	return parsedFileString;
}
