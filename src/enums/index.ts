export enum SMILEnums {
	region = 'region',
	rootLayout = 'root-layout',
	img = 'img',
	defaultRefresh = 20,
	defaultDownloadRetry = 60,
	videoDurationOffset = 1000,
	defaultVideoDuration = 0,
}

export enum SMILTriggersEnum {
	triggerFormat = 'trigger',
	triggerValue = 'triggerValue',
	metaContent = 'content',
	sensorRfid = 'rfid',
	sensorNexmo = 'nexmosphere',
	nexmoDevice = '/dev/ttyUSB0',
	nexmoBaudRate = 115200,
}

export enum FileStructure {
	rootFolder = 'smil',
	smilMediaInfo = 'smil/info',
	smilMediaInfoFileName = 'mediaInfo.smilMeta',
	videos = 'smil/videos',
	audios = 'smil/audios',
	images = 'smil/images',
	widgets = 'smil/widgets',
	extracted = 'smil/widgets/extracted',
}

export enum HtmlEnum {
	img = 'img',
	ref = 'iframe',
	top = 'top',
	width = 'width',
	height = 'height',
	left = 'left',
	widgetRoot = '/index.html',
	video = 'video',
}

export enum SMILScheduleEnum {
	endDateAndTimeFuture = 'wallclock(R/2100-01-01T00:00:00/P1D)',
	endDateAndTimePast = '1970-01-01T00:00:00',
	endDatePast = '1970-01-01',
	neverPlay = -3600000,
	defaultAwait = 20000,
	defaultDuration = 5,
	infiniteDuration = 999999,
}

export enum ObjectFitEnum {
	fill = 'fill',
	meet = 'contain',
	meetBest = 'contain',
	cover = 'cover',
	objectFit = 'object-fit',
}

export const XmlTags = {
	extractedElements: ['video', 'audio', 'img', 'ref'],
	cssElementsPosition: ['left', 'top', 'bottom', 'width', 'height'],
	cssElements: ['z-index'],
	additionalCssExtract: ['fit'],
	regionNameAlias: 'xml:id',
};

export const DeviceModels = {
	slowerDevices: ['Raspberry'],
};

export enum DeviceInfo {
	brightsign = 'brightsign',
}
