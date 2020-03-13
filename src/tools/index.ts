import { SMILFileObject, RegionAttributes } from '../models';

export async function sleep (ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}


export async function playTimedMedia(htmlElement, filepath: string, duration: number): Promise<void> {
    htmlElement.src = filepath;
    await sleep(duration);
    htmlElement.src = '';
}

export function getRegionInfo (smilObject: SMILFileObject, regionName: string): RegionAttributes {
    return smilObject.region[regionName];
}
