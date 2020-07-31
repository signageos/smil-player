export enum SMILEnums {
	region = 'region',
	rootLayout = 'root-layout',
}

export enum FileStructure {
	rootFolder = 'smil',
	videos = 'smil/videos',
	audios = 'smil/audios',
	images = 'smil/images',
	widgets = 'smil/widgets',
	extracted = 'smil/widgets/extracted',
}

export enum SMILScheduleEnum {
	endDateAndTimeFuture = 'wallclock(R/2100-01-01T00:00:00/P1D)',
	endDateAndTimePast = '1970-01-01T00:00:00',
	endDatePast = '1970-01-01',
	neverPlay = -3600000,
	defaultAwait = 20000,
}

export enum ObjectFitEnum {
	fill = 'fill',
	meet = 'contain',
	meetBest = 'contain',
	cover = 'cover',
	objectFit = 'object-fit',
}
