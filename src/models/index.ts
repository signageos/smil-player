export type RegionsObject = {
	region: object,
	rootLayout?: RootLayout;
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
	[key: string]: string | number | undefined,
};

export type SMILVideo = {
	src: string,
	id: string,
	fit: string,
	region: string,
	etag?: string,
	localFilePath: string,
	arguments?: any[],
	playing?: boolean,
	regionInfo: RegionAttributes,
};

export type SMILAudio = {
	src: string,
	dur: string,
	etag?: string,
	regionInfo: RegionAttributes,
	localFilePath: string,
	playing?: boolean,
};

export type SMILImage = {
	src: string,
	region: string,
	dur: string,
	etag?: string,
	regionInfo: RegionAttributes,
	localFilePath: string,
	playing?: boolean,
};

export type SMILWidget = {
	src: string,
	region: string,
	dur: string,
	etag?: string,
	regionInfo: RegionAttributes,
	localFilePath: string,
	playing?: boolean,
};

export type SMILIntro = {
	video: SMILVideo[],
};

export type DownloadsList = {
	video: SMILVideo[],
	img: SMILImage[],
	ref: SMILWidget[],
	audio: SMILAudio[],
	intro: SMILIntro[],
};

export type CheckETagFunctions = {
	fileEtagPromisesMedia: any[],
	fileEtagPromisesSMIL: any[],
};

export type SMILPlaylist = {
	playlist: { [key: string]: SMILWidget | SMILImage | SMILAudio | SMILVideo },
};

export type SMILFile = {
	src: string,
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
