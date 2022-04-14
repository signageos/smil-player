import { RegionAttributes, TransitionAttributes } from './xmlJsonModels';
import StreamProtocol from "@signageos/front-applet/es6/FrontApplet/Stream/StreamProtocol";

export type SMILVideo = {
	id?: string,
	expr?: string,
	src: string,
	fit?: string,
	dur?: string,
	syncIndex: number,
	fullVideoDuration?: number,
	isStream?: string,
	protocol?: string,
	region: string,
	lastModified?: number,
	localFilePath: string,
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
	syncIndex: number,
	fit?: string,
	preload?: boolean,
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
	syncIndex: number,
	fit?: string,
	preload?: boolean,
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
	syncIndex: number,
	fit?: string,
	preload?: boolean,
	lastModified?: number,
	regionInfo: RegionAttributes,
	transitionInfo?: TransitionAttributes,
	localFilePath: string,
	playing?: boolean,
	triggerValue?: string,
	"z-index": string,
};

export type SosHtmlElement = {
	expr?: string,
	src: string,
	id: string,
	dur?: string,
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
	regionInfo: RegionAttributes,
	[key: string]: string | SMILImage | SMILVideo | undefined | RegionAttributes,
};

export type VideoParams = [string, number, number, number, number, keyof typeof StreamProtocol];

export type SMILMedia =
	SMILImage | SMILWidget | SMILVideo;

export type SMILMediaSingle = SMILImage | SMILWidget | SMILAudio | SMILVideo | SMILIntro;
export type SMILMediaNoVideo = SMILImage | SMILWidget;
