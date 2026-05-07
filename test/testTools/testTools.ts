import moment from 'moment';

export function formatDate(date: moment.Moment): string {
	return date.format('YYYY-MM-DDTHH:mm:ss');
}

// combine string wallclock(R/2011-01-01T07:00:00/P1D) and +w3 to wallclock(R/2011-01-01+w3T07:00:00/P1D)
export function formatWeekDate(dateString: string, weekDay: string): string {
	const strArray = dateString.split('T');
	return `${strArray[0]}${weekDay}T${strArray[1]}`;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// compute how long it should wait between two days of week
export function computeWaitInterval(weekToday: number, weekScheduled: number): number {
	if (weekToday <= weekScheduled) {
		return (weekScheduled - weekToday) * MS_PER_DAY;
	}

	return (7 - (weekToday - weekScheduled)) * MS_PER_DAY;
}
