import sos from '@signageos/front-applet';
import * as _ from 'lodash';
const isUrl = require('is-url-superb');

import { FileStructure } from '../enums';
import { IStorageUnit } from '@signageos/front-applet/es6/FrontApplet/FileSystem/types';

export async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

export function getFileName(filePath: string) {
    return filePath.substring(filePath.lastIndexOf('/') + 1);
}

export async function extractWidgets(widgets, internalStorageUnit) {
    for(let i = 0; i < widgets.length; i++) {
        if (isUrl(widgets[i].src)) {
            await sos.fileSystem.extractFile(
                {
                    storageUnit: internalStorageUnit,
                    filePath: `${FileStructure.widgets}${getFileName(widgets[i].src)}`
                },
                {
                    storageUnit: internalStorageUnit,
                    filePath: `${FileStructure.extracted}${getFileName(widgets[i].src)}`
                },
                'zip',
            );
        }
    }
}

export async function getFileDetails(media, internalStorageUnit, fileStructure) {
    return sos.fileSystem.getFile({ storageUnit: internalStorageUnit, filePath: `${fileStructure}${getFileName(media.src)}`})
}

export function parallelDownloadAllFiles(internalStorageUnit: IStorageUnit, filesList: any[], localFilePath: string): any[] {
    const promises = [];
    for(let i = 0; i< filesList.length; i += 1) {
        if (isUrl(filesList[i].src)) {
            promises.push((async() => {
                await sos.fileSystem.downloadFile({
                        storageUnit: internalStorageUnit,
                        filePath: `${localFilePath}/${getFileName(filesList[i].src)}`
                    },
                    filesList[i].src,
                );
            })());
        }
    }
    return promises;
}

export async function createFileStructure(internalStorageUnit: IStorageUnit) {
    for ( const path of Object.values(FileStructure) ) {
        console.log(path);
        if (await sos.fileSystem.exists({
            storageUnit: internalStorageUnit,
            filePath: path
        })) {
            await sos.fileSystem.deleteFile({
                storageUnit: internalStorageUnit,
                filePath: path
            }, true);
        }
        await sos.fileSystem.createDirectory({
            storageUnit: internalStorageUnit,
            filePath: path
        });
    }
}
