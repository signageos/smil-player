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
	endTimeFuture = 'wallclock(R/2100-01-01T00:00:00/P1D)',
	endTimePast = '1970-01-01',
}
