import sos from '@signageos/front-applet';
const isUrl = require('is-url-superb');

import { SMILFileObject, RegionAttributes, SMILVideo, SMILAudio, SMILImage, SMILWidget } from '../models';
import { FileStructure } from '../enums';
import { IStorageUnit } from '@signageos/front-applet/es6/FrontApplet/FileSystem/types';
import { getFileName } from '../xmlParse';

const extractedElements = ['video', 'audio', 'img', 'ref'];
const flowElements = ['seq', 'par'];

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


// export async function processPlaylist(playlist: object, parent?: string) {
//     for (let [key, value] of Object.entries(playlist)) {
//         const promises = [];
//         // console.log(`${key}: ${JSON.stringify(value)}`);
//         // console.log(Array.isArray(value));
//         // console.log(playlist);
//         if (key == 'seq') {
//             if (Array.isArray(value)) {
//                 for (let i in value) {
//                     promises.push((async() => {
//                         await processPlaylist(value[i], 'seq');
//                     })());
//                 }
//             } else {
//                 promises.push((async() => {
//                     await processPlaylist(value, 'seq');
//                 })());
//             }
//         }
//
//         if (key == 'par') {
//             // console.log(Array.isArray(value));
//             if (Array.isArray(value)) {
//
//             } else {
//
//             }
//
//             for (let i in value) {
//                 if (Array.isArray(value[i])) {
//                     const wrapper = {
//                         par: value[i],
//                     };
//                     promises.push((async() => {
//                         await processPlaylist(wrapper, 'par');
//                     })());
//                 } else {
//                     promises.push((async() => {
//                         await processPlaylist(value[i], i);
//                     })());
//
//                 }
//             }
//         }
//
//         await Promise.all(promises);
//
//         if (extractedElements.includes(key)) {
//             switch (key) {
//                 case 'video':
//                     if (Array.isArray(value)) {
//                         if (parent == 'seq') {
//                             for (let i = 0; i < value.length; i += 1) {
//                                 console.log(`playing video seq: ${value[i].src}`);
//                             }
//                             break;
//                         } else {
//                             const promises = [];
//                             for (let i in value) {
//                                 promises.push((async() => {
//                                     console.log(`playing video parallel: ${value[i].src}`);
//                                 })())
//                             }
//                             await Promise.all(promises);
//                             break;
//                         }
//                     }
//                     console.log(`playing video seq: ${value.src}`);
//                     break;
//                 case 'audio':
//                     console.log(`playing audio: ${value.src}`);
//                     break;
//                 case 'ref':
//                     await sleep(5000);
//                     console.log(`playing ref: ${value.src}`);
//                     break;
//                 case 'img':
//                     console.log(`playing img: ${value.src}`);
//                     break;
//                 default:
//                     console.log('Sorry, we are out of ' + key + '.');
//             }
//         }
//     }
// }
