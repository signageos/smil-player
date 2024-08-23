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

export enum mapObject {
	smil = 'smil',
	images = 'image',
	videos = 'video',
	widgets = 'ref',
	audios = 'audio',
}

export enum smilLogging {
	standard = 'standard',
	proofOfPlay = 'manual',
	proofOfPlayPrefix = 'pop',
}

export const WidgetExtensions = ['.ipk', '.apk', '.wgt', '.zip'];
export const WidgetFullPath = 'internal/smil/widgets/';
