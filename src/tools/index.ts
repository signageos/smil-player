import sos from '@signageos/front-applet';

import { SMILFileObject, RegionAttributes } from '../models';
import { FileStructure } from '../enums';
import {IStorageUnit} from "@signageos/front-applet/es6/FrontApplet/FileSystem/types";

export async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}


export async function playTimedMedia(htmlElement, filepath: string, duration: number): Promise<void> {
    htmlElement.src = filepath;
    await sleep(duration);
    htmlElement.src = '';
}

export function getRegionInfo(smilObject: SMILFileObject, regionName: string): RegionAttributes {
    return smilObject.region[regionName];
}

export async function createFileStructure(internalStorageUnit: IStorageUnit) {
    for ( const path of Object.values(FileStructure) ) {
        console.log(path);
        // You can create directory in root directory of internal storage (not rescursive)
        // First clean path if exists
        if (await sos.fileSystem.exists({
            storageUnit: internalStorageUnit,
            filePath: path
        })) {
            await sos.fileSystem.deleteFile({
                storageUnit: internalStorageUnit,
                filePath: path
            }, true);
        } else {
            // create directory for smil files
            await sos.fileSystem.createDirectory({
                storageUnit: internalStorageUnit,
                filePath: path
            });
        }

    }
}
