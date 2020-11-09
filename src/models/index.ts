export type RegionsObject = {
	region: {
		[key: string]: RegionAttributes,
	},
	rootLayout?: RootLayout,
	refresh: number,
	[key: string]: any,
};

export type RootLayout = {
	width: string,
	height: string,
	left: string,
	top: string,
	backgroundColor: string,
};

export type XmlSmilObject = {
	smil: {
		head: {
			meta: [{
				content: string,
			}],
			layout: RegionsObject,
		},
		body: object,
	},
};

export type XmlHeadObject = {
	meta: SMILMetaObject[],
	triggers?: SMILTriggers,
	sensors?: SMILSensors,
	layout: RegionsObject,
};

export type SMILMetaObject = {
	content: string,
};

export type RegionAttributes = {
	regionName: string,
	left: number,
	top: number,
	width: number,
	height: number,
	"z-index"?: number,
	fit?: string,
	region: RegionAttributes | RegionAttributes[],
	[key: string]: any,
};

export type SMILVideo = {
	src: string,
	fit?: string,
	dur?: number,
	region: string,
	lastModified?: number,
	localFilePath: string,
	arguments?: any[],
	playing?: boolean,
	regionInfo: RegionAttributes,
	media?: string,
	triggerValue?: string,
};

export type SMILAudio = {
	src: string,
	dur: string,
	fit?: string,
	lastModified?: number,
	regionInfo: RegionAttributes,
	localFilePath: string,
	playing?: boolean,
	triggerValue?: string,
};

export type SMILImage = {
	src: string,
	region: string,
	dur: string,
	fit?: string,
	lastModified?: number,
	regionInfo: RegionAttributes,
	localFilePath: string,
	playing?: boolean,
	triggerValue?: string,
};

export type SMILWidget = {
	src: string,
	region: string,
	dur: string,
	fit?: string,
	lastModified?: number,
	regionInfo: RegionAttributes,
	localFilePath: string,
	playing?: boolean,
	triggerValue?: string,
};

export type SosHtmlElement = {
	src: string,
	id: string,
	media?: string,
	playing?: boolean,
	isTrigger?: boolean,
	triggerValue?: string,
	regionInfo: RegionAttributes,
	localFilePath: string,
};

export type SMILIntro = {
	video?: SMILVideo,
	img?: SMILImage,
	[key: string]: string | SMILImage | SMILVideo | undefined,
};

export type MergedDownloadList = SMILWidget | SMILImage | SMILAudio | SMILVideo | SMILFile;

export type DownloadsList = {
	video: SMILVideo[],
	img: SMILImage[],
	ref: SMILWidget[],
	audio: SMILAudio[],
	intro: SMILIntro[],
	[key: string]: SMILVideo[] | SMILImage[] | SMILWidget[] | SMILAudio[] | SMILIntro[],
};

export type TriggerList = {
	sensors: ParsedSensor[],
	triggerSensorInfo: ParsedTriggerInfo,
	triggers: { [key: string]: TriggerObject },
};

export type TriggerObject = {
	begin: string,
	[key: string]: SMILVideo[] | SMILImage[] | SMILWidget[] | SMILAudio[] | SMILIntro[] | string,
};

export type SMILTriggers = {
	trigger: SMILTriggerInfo | SMILTriggerInfo[],
};

export type SMILTriggerInfo = {
	id: string,
	condition: SMILTriggerCondition | SMILTriggerCondition[],
};

export type SMILTriggerCondition = {
	origin: string,
	data?: string,
	action: string,
};

export type SMILSensors = {
	sensor: SMILSensor | SMILSensor[],
};

export type SMILSensor = {
	type: string,
	id: string,
	driver: string,
	option: SMILSensorOption | SMILSensorOption[],
};

export type SMILSensorOption = {
	_: string,
	name: string,
};

export type ParsedSensor = {
	type: string,
	id: string,
	driver: string,
	address?: string,
	[key: string]: string | undefined,
};

export type ParsedTriggerInfo = {
	[key: string]: {
		condition: ParsedTriggerCondition[],
		stringCondition: string,
		trigger: string,
	},
};

export type ParsedTriggerCondition = {
	action: string,
};

export type CheckETagFunctions = {
	fileEtagPromisesMedia: Promise<any>[],
	fileEtagPromisesSMIL: Promise<any>[],
};

export type SMILPlaylist = {
	playlist: { [key: string]: PlaylistElement | PlaylistElement[] },
};

export type SMILFile = {
	src: string,
	lastModified?: number,
};

export type PrefetchObject = {
	prefetch: {
		src: string,
	},
};

export type InfiniteLoopObject = {
	[key in 'seq' | 'par']: PrefetchObject[];
};

export type SmilScheduleObject = {
	timeToStart: number,
	timeToEnd: number,
};

export type PlaylistElement = {
	begin?: string,
	end?: string,
	repeatCount?: number | string,
	seq?: PlaylistElement,
	par?: PlaylistElement,
	excl?: PlaylistElement,
	priorityClass?: PlaylistElement,
};

export type CurrentlyPlaying = {
	[regionName: string]: PlayingInfo,
};

export type PlayingInfo = {
	player?: string,
} & SosHtmlElement & SMILVideo;

export type MediaInfoObject = {
	[fileName: string]: string | null | number,
};

export type SMILFileObject = SMILPlaylist & RegionsObject & DownloadsList;

export type SMILMedia = SMILImage | SMILImage [] | SMILWidget | SMILWidget[] | SMILAudio | SMILAudio[] | SMILVideo | SMILVideo[];
export type SMILMediaSingle = SMILImage  | SMILWidget | SMILAudio | SMILVideo | SMILIntro;
export type SMILMediaArray = SMILImage[]  | SMILWidget[] | SMILAudio[] | SMILVideo[];
export type SMILMediaNoVideo = SMILImage | SMILImage [] | SMILWidget | SMILWidget[] | SMILAudio | SMILAudio[];
