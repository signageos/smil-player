import sos from '@signageos/front-applet';

import { SMILFileObject, RegionAttributes, SMILVideo, SMILAudio, SMILImage, SMILWidget } from '../models';
import { FileStructure } from '../enums';
import { IStorageUnit } from '@signageos/front-applet/es6/FrontApplet/FileSystem/types';
import { getFileName } from '../xmlParse';

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

export function parallelDownloadAllFiles(internalStorageUnit: IStorageUnit, filesList: any[], localFilePath: string): any[] {
    const promises = [];
    for(let i = 0; i< filesList.length; i += 1) {
        promises.push((async() => {
             console.log('downloading');
            await sos.fileSystem.downloadFile({
                    storageUnit: internalStorageUnit,
                    filePath: `${localFilePath}/${getFileName(filesList[i].src)}`
                },
                filesList[i].src,
            );
        })());
    }

    return promises;
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
        }

        // create directory for smil files
        await sos.fileSystem.createDirectory({
            storageUnit: internalStorageUnit,
            filePath: path
        });
    }
}
