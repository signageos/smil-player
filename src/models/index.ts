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
    "z-index": number,
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
}

export type SMILAudio = {
    src: string,
    dur: number,
    etag?: string,
}

export type SMILImage = {
    src: string,
    region: string,
    dur: number,
    etag?: string,
}

export type SMILWidget = {
    src: string,
    region: string,
    dur: number,
    etag?: string,
}

export type DownloadsList = {
    video: SMILVideo[],
    img: SMILImage[],
    ref: SMILWidget[],
    audio: SMILAudio[],
}

export type SMILPlaylist = {
    playlist: { [key: string]: SMILWidget | SMILImage | SMILAudio | SMILVideo },
}

export type SMILFileObject = SMILPlaylist & RegionsObject & DownloadsList;

