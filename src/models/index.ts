export type RegionsObject = {
	region: { [regionName: string]: RegionAttributes },
	rootLayout?: RootLayout;
};

export type RootLayout = {
	width: number,
	height: number,
};

export type RegionAttributes = {
	regionName: string,
	left: number,
	top: number,
	width: number,
	height: number,
	"z-index"?: number,
}

export type SMILVideo = {
	src: string,
	id: string,
	fit: string,
	region: string,
	etag?: string,
	localFilePath?: string,
	arguments?: [],
	playing: boolean,
	regionInfo?: RegionAttributes,
}

export type SMILAudio = {
	src: string,
	dur: string,
	etag?: string,
	regionInfo?: object,
}

export type SMILImage = {
	src: string,
	region: string,
	dur: string,
	etag?: string,
	regionInfo?: object,
}

export type SMILWidget = {
	src: string,
	region: string,
	dur: string,
	etag?: string,
	regionInfo?: object,
}

export type DownloadsList = {
	video: SMILVideo[],
	img: SMILImage[],
	ref: SMILWidget[],
	audio: SMILAudio[],
}

export type CheckETagFunctions = {
	fileEtagPromisesMedia: any[],
	fileEtagPromisesSMIL: any[],
}

export type SMILPlaylist = {
	playlist: { [key: string]: SMILWidget | SMILImage | SMILAudio | SMILVideo },
}

export type SMILFile = {
	src: string,
}

export type SMILFileObject = SMILPlaylist & RegionsObject & DownloadsList;

