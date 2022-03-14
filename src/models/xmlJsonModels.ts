import { SMILSensors, SMILTriggers } from './triggerModels';

export type RegionsObject = {
	region: {
		[key: string]: RegionAttributes,
	},
	rootLayout?: RootLayout,
	refresh: {
		refreshInterval: number,
		expr?: string,
	},
	onlySmilFileUpdate: boolean,
	log: boolean,
	[key: string]: any,
};

export type TransitionsObject = {
	transition: {
		[key: string]: TransitionAttributes,
	},
	[key: string]: any,
};

export type RootLayout = {
	width: string,
	height: string,
	left: string,
	top: string,
	backgroundColor: string,
	regionName: string,
};

export type XmlSmilObject = {
	smil: {
		head: {
			meta: [{
				content: string,
				log: string,
				onlySmilUpdate: string,
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
	log: string,
	onlySmilUpdate: string,
	expr?: string,
};

export type RegionAttributes = {
	regionName: string,
	left: number,
	top: number,
	width: number,
	height: number,
	bottom?: number,
	right?: number,
	"z-index"?: number,
	fit?: string,
	region: RegionAttributes | RegionAttributes[],
	[key: string]: any,
};

export type TransitionAttributes = {
	transitionName: string,
	type: string,
	subType: string,
	dur: string,
};
