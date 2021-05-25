export enum SMILScheduleEnum {
	endDateAndTimeFuture = 'wallclock(R/2100-01-01T00:00:00/P1D)',
	endDateAndTimePast = '1970-01-01T00:00:00',
	endDatePast = '1970-01-01',
	neverPlay = -3600000,
	playImmediately = 0,
	defaultAwait = 20000,
	defaultDuration = 5000,
	infiniteDuration = 999999,
}
