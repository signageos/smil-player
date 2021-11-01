export enum SMILScheduleEnum {
	endDateAndTimeFuture = 'wallclock(2100-01-01T23:59:59)',
	endDateAndTimePast = '1970-01-01T00:00:00',
	defaultTime = '00:00:00',
	endDatePast = '1970-01-01',
	neverPlay = -3600000,
	playImmediately = 0,
	defaultAwait = 20000,
	defaultDuration = 5000,
	fileCheckDelay = 5000,
	triggerPlaylistVersion = 9999,
	backupImagePlaylistVersion = 0,
	infiniteDuration = 999999,
}
