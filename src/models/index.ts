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
    etag: string,
}

export type SMILPlaylist = {
    videos: SMILVideo[],
}

export type SMILFileObject = SMILPlaylist & RegionsObject;

