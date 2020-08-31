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
			meta: {
				content: string,
			}
			layout: RegionsObject,
		},
		body: object,
	},
};

export type RegionAttributes = {
	regionName: string,
	left: number,
	top: number,
	width: number,
	height: number,
	"z-index"?: number,
	fit?: string,
	[key: string]: string | number | undefined,
};

export type SMILVideo = {
	src: string,
	id: string,
	fit?: string,
	region: string,
	lastModified?: number,
	localFilePath: string,
	arguments?: any[],
	playing?: boolean,
	regionInfo: RegionAttributes,
};

export type SMILAudio = {
	src: string,
	dur?: string,
	fit?: string,
	lastModified?: number,
	regionInfo: RegionAttributes,
	localFilePath: string,
	playing?: boolean,
};

export type SMILImage = {
	src: string,
	region: string,
	dur?: string,
	fit?: string,
	lastModified?: number,
	regionInfo: RegionAttributes,
	localFilePath: string,
	playing?: boolean,
};

export type SMILWidget = {
	src: string,
	region: string,
	dur?: string,
	fit?: string,
	lastModified?: number,
	regionInfo: RegionAttributes,
	localFilePath: string,
	playing?: boolean,
};

export type SMILIntro = {
	video?: SMILVideo[],
	img?: SMILImage[],
	[key: string]: string | SMILImage[] | undefined,
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

export type CheckETagFunctions = {
	fileEtagPromisesMedia: any[],
	fileEtagPromisesSMIL: any[],
};

export type SMILPlaylist = {
	playlist: { [key: string]: SMILMedia },
};

export type SMILFile = {
	src: string,
	lastModified?: number,
};

export type SosModule = {
	fileSystem: any,
	video: any,

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

export type CurrentlyPlaying = {
	[regionName: string]: SMILWidget | SMILImage | SMILAudio | SMILVideo,
};

export type SMILFileObject = SMILPlaylist & RegionsObject & DownloadsList;

export type SMILMedia = SMILWidget | SMILImage | SMILAudio | SMILVideo;
