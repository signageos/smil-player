import { RegionAttributes, TransitionAttributes } from './xmlJsonModels';

export type SMILVideo = {
	expr?: string,
	src: string,
	fit?: string,
	dur?: string,
	fullVideoDuration?: number,
	isStream?: string,
	protocol?: string,
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
	id?: string,
	expr?: string,
	src: string,
	dur: string,
	fit?: string,
	lastModified?: number,
	regionInfo: RegionAttributes,
	localFilePath: string,
	playing?: boolean,
	triggerValue?: string,
	"z-index": string,
};

export type SMILImage = {
	id?: string,
	expr?: string,
	src: string,
	region: string,
	dur: string,
	fit?: string,
	lastModified?: number,
	regionInfo: RegionAttributes,
	transitionInfo?: TransitionAttributes,
	localFilePath: string,
	playing?: boolean,
	triggerValue?: string,
	"z-index": string,
};

export type SMILWidget = {
	id?: string,
	expr?: string,
	src: string,
	region: string,
	dur: string,
	fit?: string,
	lastModified?: number,
	regionInfo: RegionAttributes,
	localFilePath: string,
	playing?: boolean,
	triggerValue?: string,
	"z-index": string,
};

export type SosHtmlElement = {
	expr?: string,
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
	expr?: string,
	video?: SMILVideo,
	img?: SMILImage,
	[key: string]: string | SMILImage | SMILVideo | undefined,
};

export type SMILMedia =
	SMILImage | SMILWidget | SMILAudio | SMILVideo | SMILIntro;

export type SMILMediaSingle = SMILImage | SMILWidget | SMILAudio | SMILVideo | SMILIntro;
export type SMILMediaNoVideo = SMILImage | SMILWidget | SMILAudio;
