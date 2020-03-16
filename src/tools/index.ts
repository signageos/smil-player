import sos from '@signageos/front-applet';
const isUrl = require('is-url-superb');

import { RegionsObject, RegionAttributes, SMILVideo, SMILAudio, SMILImage, SMILWidget } from '../models';
import { FileStructure } from '../enums';
import { IStorageUnit } from '@signageos/front-applet/es6/FrontApplet/FileSystem/types';
import { getFileName } from '../xmlParse';

const extractedElements = ['video', 'audio', 'img', 'ref'];
const flowElements = ['seq', 'par'];
const positionElements = ['left', 'top', 'bottom', 'width', 'height'];

export async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
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

export async function playTimedMedia(htmlElement, filepath: string, regionInfo: RegionAttributes, duration: number): Promise<void> {
    const element = document.createElement(htmlElement);
    element.src = filepath;
    element.id = getFileName(filepath);
    Object.keys(regionInfo).forEach((attr) => {
        if (positionElements.includes(attr)) {
            element.style[attr] = regionInfo[attr];
        }
    });
    document.body.appendChild(element);
    await sleep(duration*1000);
    element.src = '';
}

export function getRegionInfo(regionObject: object, regionName: string): RegionAttributes {
    return regionObject[regionName];
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

export async function playVideosSeq(videos, internalStorageUnit) {
    for (let i = 0; i < videos.length; i += 1) {
        const previousVideo = videos[(i + videos.length - 1) % videos.length];
        const currentVideo = videos[i];
        const nextVideo = videos[(i + 1) % videos.length];
        const currentVideoDetails = await sos.fileSystem.getFile({ storageUnit: internalStorageUnit, filePath: `${FileStructure.videos}${getFileName(currentVideo.src)}`});
        const previousVideoDetails = await sos.fileSystem.getFile({ storageUnit: internalStorageUnit, filePath: `${FileStructure.videos}${getFileName(previousVideo.src)}`});
        const nextVideoDetails = await sos.fileSystem.getFile({ storageUnit: internalStorageUnit, filePath: `${FileStructure.videos}${getFileName(nextVideo.src)}`});


        currentVideo.localFilePath = currentVideoDetails.localUri;
        previousVideo.localFilePath = previousVideoDetails.localUri;
        nextVideo.localFilePath = nextVideoDetails.localUri;

        console.log('playing');
        // Videos are identificated by URI & coordination together (https://docs.signageos.io/api/sos-applet-api/#Play_video)
        await sos.video.play(currentVideo.localFilePath, 0, 0, 500, 500);
        currentVideo.playing = true;
        if (previousVideo.playing) {
            await sos.video.stop(previousVideo.localFilePath, 0, 0, 500, 500);
            previousVideo.playing = false;
        }
        await sos.video.prepare(nextVideo.localFilePath, 0, 0, 500, 500);
        await sos.video.onceEnded(currentVideo.localFilePath, 0, 0, 500, 500); // https://docs.signageos.io/api/sos-applet-api/#onceEnded
    }
}

export async function playVideosPar(videos, internalStorageUnit) {
    const promises = [];
    for (let i = 0; i < videos.length; i += 1) {
        promises.push((async() => {
           await playVideo(videos[i], internalStorageUnit);
        })())
    }
    await Promise.all(promises);
}

export async function playVideo(video, internalStorageUnit) {
    const currentVideo = video;
    const currentVideoDetails = await sos.fileSystem.getFile({ storageUnit: internalStorageUnit, filePath: `${FileStructure.videos}${getFileName(currentVideo.src)}`});
    currentVideo.localFilePath = currentVideoDetails.localUri;
    await sos.video.prepare(currentVideo.localFilePath, 0, 0, 500, 500);
    await sos.video.play(currentVideo.localFilePath, 0, 0, 500, 500);
    await sos.video.onceEnded(currentVideo.localFilePath, 0, 0, 500, 500);
    await sos.video.stop(currentVideo.localFilePath, 0, 0, 500, 500);
}

export async function playElement(value, key, internalStorageUnit, parent) {
    switch (key) {
        case 'video':
            if (Array.isArray(value)) {
                if (parent == 'seq') {
                    console.log(`playing videos seq: ${JSON.stringify(value)}`);
                    await playVideosSeq(value, internalStorageUnit);
                    break;
                } else {
                    await playVideosPar(value, internalStorageUnit);
                    break;
                }
            } else {
                await playVideo(value, internalStorageUnit);
            }
            console.log(`playing video seq: ${value.src}`);
            break;
        case 'audio':
            // console.log(`playing audio: ${value.src}`);
            break;
        case 'ref':
            if (!Array.isArray(value)) {
                value = [value];
            }
            if (parent == 'seq') {
                for (let i = 0; i < value.length ; i += 1) {
                    if (isUrl(value[i].src)) {
                        const mediaFile = await sos.fileSystem.getFile({ storageUnit: internalStorageUnit, filePath: `${FileStructure.extracted}${getFileName(value[i].src)}/index.html`});
                        await playTimedMedia('iframe', mediaFile.localUri, value[i].regionInfo, parseInt(value[i].dur, 10) );
                    }
                }
                break;
            } else {
                const promises = [];
                for (let i = 0; i < value.length ; i += 1) {
                    promises.push((async() => {
                        const mediaFile = await sos.fileSystem.getFile({ storageUnit: internalStorageUnit, filePath: `${FileStructure.extracted}${getFileName(value[i].src)}/index.html`});
                        await playTimedMedia('iframe', mediaFile.localUri, value[i].regionInfo, parseInt(value[i].dur, 10));
                    })())
                }
                await Promise.all(promises);
                break;
            }
            console.log(`playing ref: ${value.src}`);
            break;
        case 'img':
            if (!Array.isArray(value)) {
                value = [value];
            }
            if (parent == 'seq') {
                for (let i = 0; i < value.length ; i += 1) {
                    const mediaFile = await sos.fileSystem.getFile({ storageUnit: internalStorageUnit, filePath: `${FileStructure.images}${getFileName(value[i].src)}`});
                    await playTimedMedia('img', mediaFile.localUri, value[i].regionInfo, parseInt(value[i].dur, 10));
                }
                break;
            } else {
                const promises = [];
                for (let i = 0; i < value.length ; i += 1) {
                    promises.push((async() => {
                        const mediaFile = await sos.fileSystem.getFile({ storageUnit: internalStorageUnit, filePath: `${FileStructure.images}${getFileName(value[i].src)}`});
                        await playTimedMedia('img', mediaFile.localUri, value[i].regionInfo, parseInt(value[i].dur, 10));
                    })())

                }
                await Promise.all(promises);
                break;
            }
        default:
            console.log('Sorry, we are out of ' + key + '.');
    }
}

export async function processPlaylist(playlist: object, region: object, internalStorageUnit, parent?: string) {
    for (let [key, value] of Object.entries(playlist)) {
        const promises = [];
        if (key == 'seq') {
            if (Array.isArray(value)) {
                for (let i in value) {
                    promises.push((async() => {
                        await processPlaylist(value[i], region, internalStorageUnit, 'seq');
                    })());
                }
            } else {
                promises.push((async() => {
                    await processPlaylist(value, region, internalStorageUnit, 'seq');
                })());
            }
        }

        if (key == 'par') {
            for (let i in value) {
                if (Array.isArray(value[i])) {
                    const wrapper = {
                        par: value[i],
                    };
                    promises.push((async() => {
                        await processPlaylist(wrapper, region, internalStorageUnit, 'par');
                    })());
                } else {
                    promises.push((async() => {
                        await processPlaylist(value[i], region, internalStorageUnit, i);
                    })());

                }
            }
        }

        await Promise.all(promises);

        if (extractedElements.includes(key)) {
            value.regionInfo = getRegionInfo(region, value.region);
            await playElement(value, key, internalStorageUnit, parent);
        }
    }
}