import { RegionAttributes, TransitionAttributes } from './xmlJsonModels';
import StreamProtocol from '@signageos/front-applet/es6/FrontApplet/Stream/StreamProtocol';

export type PoPAttributes = {
	popName?: string;
	popCustomId?: string;
	popType?: 'video' | 'image' | 'html' | 'custom';
	popTags?: string;
	popFileName?: string;
};

export type SMILVideo = {
	id?: string;
	expr?: string;
	src: string;
	fit?: string;
	dur?: string;
	syncIndex: number;
	fullVideoDuration?: number;
	isStream?: string;
	protocol?: string;
	region: string;
	lastModified?: number;
	localFilePath: string;
	playing?: boolean;
	regionInfo: RegionAttributes;
	media?: string;
	triggerValue?: string;
	dynamicValue?: string;
	syncGroupName?: string;
} & PoPAttributes;

export type SMILAudio = {
	id?: string;
	expr?: string;
	src: string;
	dur: string;
	syncIndex: number;
	fit?: string;
	preload?: boolean;
	lastModified?: number;
	regionInfo: RegionAttributes;
	localFilePath: string;
	playing?: boolean;
	triggerValue?: string;
	dynamicValue?: string;
	syncGroupName?: string;
	'z-index': string;
} & PoPAttributes;

export type SMILImage = {
	id?: string;
	expr?: string;
	src: string;
	region: string;
	dur: string;
	syncIndex: number;
	fit?: string;
	preload?: boolean;
	lastModified?: number;
	regionInfo: RegionAttributes;
	transitionInfo?: TransitionAttributes;
	localFilePath: string;
	playing?: boolean;
	triggerValue?: string;
	dynamicValue?: string;
	syncGroupName?: string;
	'z-index': string;
} & PoPAttributes;

export type SMILWidget = {
	id?: string;
	expr?: string;
	src: string;
	region: string;
	dur: string;
	syncIndex: number;
	fit?: string;
	preload?: boolean;
	lastModified?: number;
	regionInfo: RegionAttributes;
	transitionInfo?: TransitionAttributes;
	localFilePath: string;
	playing?: boolean;
	triggerValue?: string;
	dynamicValue?: string;
	syncGroupName?: string;
	'z-index': string;
} & PoPAttributes;

export type SMILTicker = {
	id?: string;
	expr?: string;
	src: string;
	text: string[] | string;
	fontName?: string;
	fontSize?: string;
	fontColor?: string;
	preload?: boolean;
	backgroundColor?: string;
	linearGradientAngle?: string;
	linearGradient?: string;
	velocity?: string;
	indentation?: string;
	region: string;
	dur: string;
	syncIndex: number;
	lastModified?: number;
	localFilePath: string;
	regionInfo: RegionAttributes;
	transitionInfo?: TransitionAttributes;
	playing?: boolean;
	triggerValue?: string;
	dynamicValue?: string;
	syncGroupName?: string;
	'z-index': string;
	timeoutReference?: ReturnType<typeof setTimeout>;
} & PoPAttributes;

export type SosHtmlElement = {
	expr?: string;
	src: string;
	id: string;
	syncIndex?: number;
	dur?: string;
	media?: string;
	playing?: boolean;
	isTrigger?: boolean;
	triggerValue?: string;
	dynamicValue?: string;
	syncGroupName?: string;
	regionInfo: RegionAttributes;
	localFilePath: string;
} & PoPAttributes;

export type SMILIntro = {
	expr?: string;
	video?: SMILVideo;
	img?: SMILImage;
	regionInfo: RegionAttributes;
	[key: string]: string | SMILImage | SMILVideo | undefined | RegionAttributes;
};

export type VideoParams = [string, number, number, number, number, keyof typeof StreamProtocol];

export type SMILMedia = SMILImage | SMILWidget | SMILVideo | SMILTicker;

export type SMILMediaSingle = SMILImage | SMILWidget | SMILAudio | SMILVideo | SMILTicker | SMILIntro;
export type SMILMediaNoVideo = SMILImage | SMILWidget | SMILTicker;
