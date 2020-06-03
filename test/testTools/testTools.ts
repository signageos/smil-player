import moment from 'moment';

export function formatDate(date: moment.Moment): string {
	return date.format().split('.')[0].split('+')[0];
}

// combine string wallclock(R/2011-01-01T07:00:00/P1D) and +w3 to wallclock(R/2011-01-01+w3T07:00:00/P1D)
export function formatWeekDate(dateString: string, weekDay: string): string {
	const strArray = dateString.split('T');
	return `${strArray[0]}${weekDay}T${strArray[1]}`;
}

export function computeWaitInteral(weekToday: number, weekScheduled: number): number {
	if (weekToday <= weekScheduled) {
		// 24 hours in ms
		return ((weekScheduled - weekToday) * 86400000);
	}

	return (7 - (weekToday - weekScheduled)) * 86400000;
}
