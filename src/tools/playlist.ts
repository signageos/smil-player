import sos from '@signageos/front-applet';
import * as _ from 'lodash';
import { parallel } from 'async';
import Debug from 'debug';

const debug = Debug('playlistModule');
const isUrl = require('is-url-superb');

import { RegionsObject, RegionAttributes, SMILVideo, SMILFileObject } from '../models';
import { FileStructure } from '../enums';
import { IFile, IStorageUnit } from '@signageos/front-applet/es6/FrontApplet/FileSystem/types';
import { getFileName, getFileDetails } from './files';
import { defaults as config } from '../config';

let cancelFunction = false;
let checkFilesLoop = true;

export function disableLoop(value: boolean) {
	cancelFunction = value;
}

export async function sleep(ms: number): Promise<object> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

export async function playTimedMedia(htmlElement: string, filepath: string, regionInfo: RegionAttributes, duration: number): Promise<void> {
	const element: HTMLElement = document.createElement(htmlElement);
	element.setAttribute('src', filepath);
	element.id = getFileName(filepath);
	Object.keys(regionInfo).forEach((attr: string) => {
		if (config.constants.cssElements.includes(attr)) {
			// @ts-ignore
			element.style[attr] = regionInfo[attr];
		}
	});
	element.style['position'] = 'absolute';
	debug('Creating htmlElement: %O with duration', element, duration);
	document.body.appendChild(element);
	await sleep(duration * 1000);
}

export function getRegionInfo(regionObject: RegionsObject, regionName: string): RegionAttributes {
	const regionInfo = _.get(regionObject.region, regionName, config.constants.defaultRegion);
	debug('Getting region info: %O for region name: %O', regionInfo, regionName);
	return regionInfo;
}

export async function playVideosSeq(videos: SMILVideo[], internalStorageUnit: IStorageUnit) {
	for (let i = 0; i < videos.length; i += 1) {
		const previousVideo = videos[(i + videos.length - 1) % videos.length];
		const currentVideo = videos[i];
		const nextVideo = videos[(i + 1) % videos.length];
		const currentVideoDetails = <IFile>await sos.fileSystem.getFile({
			storageUnit: internalStorageUnit,
			filePath: `${FileStructure.videos}${getFileName(currentVideo.src)}`
		});
		const previousVideoDetails = <IFile>await sos.fileSystem.getFile({
			storageUnit: internalStorageUnit,
			filePath: `${FileStructure.videos}${getFileName(previousVideo.src)}`
		});
		const nextVideoDetails = <IFile>await sos.fileSystem.getFile({
			storageUnit: internalStorageUnit,
			filePath: `${FileStructure.videos}${getFileName(nextVideo.src)}`
		});

		currentVideo.localFilePath = currentVideoDetails.localUri;
		previousVideo.localFilePath = previousVideoDetails.localUri;
		nextVideo.localFilePath = nextVideoDetails.localUri;

		debug('Playing videos in loop, currentVideo: %O,' +
			' previousVideo: %O' +
			'nextVideo: %O', currentVideo, previousVideo, nextVideo);

		await sos.video.prepare(currentVideo.localFilePath, currentVideo.regionInfo.left, currentVideo.regionInfo.top, currentVideo.regionInfo.width, currentVideo.regionInfo.height, config.videoOptions);
		await sos.video.play(currentVideo.localFilePath, currentVideo.regionInfo.left, currentVideo.regionInfo.top, currentVideo.regionInfo.width, currentVideo.regionInfo.height);
		currentVideo.playing = true;
		if (previousVideo.playing) {
			debug('Stopping video: %O', previousVideo);
			await sos.video.stop(previousVideo.localFilePath, previousVideo.regionInfo.left, previousVideo.regionInfo.top, previousVideo.regionInfo.width, previousVideo.regionInfo.height);
			previousVideo.playing = false;
		}
		await sos.video.prepare(nextVideo.localFilePath, nextVideo.regionInfo.left, nextVideo.regionInfo.top, nextVideo.regionInfo.width, nextVideo.regionInfo.height, config.videoOptions);
		await sos.video.onceEnded(currentVideo.localFilePath, currentVideo.regionInfo.left, currentVideo.regionInfo.top, currentVideo.regionInfo.width, currentVideo.regionInfo.height);
	}
}

export async function playVideosPar(videos: SMILVideo[], internalStorageUnit: IStorageUnit) {
	const promises = [];
	for (let i = 0; i < videos.length; i += 1) {
		promises.push((async () => {
			await playVideo(videos[i], internalStorageUnit);
		})())
	}
	await Promise.all(promises);
}

export async function runEndlessLoop(fn: Function) {
	while (!cancelFunction) {
		try {
			await fn();
		} catch (err) {
			console.log(err);
			return err;
		}
	}
}

export async function playVideo(video: SMILVideo, internalStorageUnit: IStorageUnit) {
	const currentVideoDetails = <IFile>await getFileDetails(video, internalStorageUnit, FileStructure.videos);
	video.localFilePath = currentVideoDetails.localUri;
	debug('Playing video: %O', video);
	await sos.video.prepare(video.localFilePath, video.regionInfo.left, video.regionInfo.top, video.regionInfo.width, video.regionInfo.height, config.videoOptions);
	await sos.video.play(video.localFilePath, video.regionInfo.left, video.regionInfo.top, video.regionInfo.width, video.regionInfo.height);
	await sos.video.onceEnded(video.localFilePath, video.regionInfo.left, video.regionInfo.top, video.regionInfo.width, video.regionInfo.height);
	await sos.video.stop(video.localFilePath, video.regionInfo.left, video.regionInfo.top, video.regionInfo.width, video.regionInfo.height);
}

export async function setupIntroVideo(video: SMILVideo, internalStorageUnit: IStorageUnit, region: RegionsObject) {
	const currentVideoDetails = <IFile>await getFileDetails(video, internalStorageUnit, FileStructure.videos);
	video.regionInfo = getRegionInfo(region, video.region);
	video.localFilePath = currentVideoDetails.localUri;
	debug('Setting-up intro video: %O', video);
	await sos.video.prepare(video.localFilePath, video.regionInfo.left, video.regionInfo.top, video.regionInfo.width, video.regionInfo.height, config.videoOptions);
}

export async function playIntroVideo(video: SMILVideo) {
	debug('Playing intro video: %O', video);
	await sos.video.play(video.localFilePath, video.regionInfo.left, video.regionInfo.top, video.regionInfo.width, video.regionInfo.height);
	await sos.video.onceEnded(video.localFilePath, video.regionInfo.left, video.regionInfo.top, video.regionInfo.width, video.regionInfo.height);
}

export async function playOtherMedia(value: any, internalStorageUnit: IStorageUnit, parent: string, fileStructure: string, htmlElement: string, widgetRootFile: string) {
	if (!Array.isArray(value)) {
		if (_.isNil(value.src) || !isUrl(value.src)) {
			debug('Invalid element values: %O', value);
			return;
		}
		value = [value];
	}
	if (parent == 'seq') {
		debug('Playing media sequentially: %O', value);
		for (let i = 0; i < value.length; i += 1) {
			if (isUrl(value[i].src)) {
				const mediaFile = <IFile>await sos.fileSystem.getFile({
					storageUnit: internalStorageUnit,
					filePath: `${fileStructure}${getFileName(value[i].src)}${widgetRootFile}`
				});
				await playTimedMedia(htmlElement, mediaFile.localUri, value[i].regionInfo, parseInt(value[i].dur, 10));
			}
		}
	} else {
		const promises = [];
		debug('Playing media in parallel: %O', value);
		for (let i = 0; i < value.length; i += 1) {
			promises.push((async () => {
				const mediaFile = <IFile>await sos.fileSystem.getFile({
					storageUnit: internalStorageUnit,
					filePath: `${fileStructure}${getFileName(value[i].src)}${widgetRootFile}`
				});
				await playTimedMedia(htmlElement, mediaFile.localUri, value[i].regionInfo, parseInt(value[i].dur, 10));
			})())
		}
		await Promise.all(promises);
	}
}

export async function playElement(value: object | any[], key: string, internalStorageUnit: IStorageUnit, parent: string) {
	debug('Playing element with key: %O, value: %O', key, value);
	switch (key) {
		case 'video':
			if (Array.isArray(value)) {
				if (parent == 'seq') {
					await playVideosSeq(value, internalStorageUnit);
					break;
				} else {
					await playVideosPar(value, internalStorageUnit);
					break;
				}
			} else {
				await playVideo(<SMILVideo>value, internalStorageUnit);
			}
			break;
		case 'audio':
			await playOtherMedia(value, internalStorageUnit, parent, FileStructure.audios, 'audio', '');
			break;
		case 'ref':
			await playOtherMedia(value, internalStorageUnit, parent, FileStructure.extracted, 'iframe', '/index.html');
			break;
		case 'img':
			await playOtherMedia(value, internalStorageUnit, parent, FileStructure.images, 'img', '');
			break;
		default:
			console.log('Sorry, we are out of ' + key + '.');
	}
}

export async function getRegionPlayElement(value: any, key: string, internalStorageUnit: IStorageUnit, region: RegionsObject, parent: string = '0') {
	if (!_.isNaN(parseInt(parent))) {
		parent = 'seq';
	}
	if (Array.isArray(value)) {
		for (let i in value) {
			value[i].regionInfo = getRegionInfo(region, value[i].region);
		}
	} else {
		value.regionInfo = getRegionInfo(region, value.region);
	}
	await playElement(value, key, internalStorageUnit, parent);
}

export async function processingLoop(internalStorageUnit: IStorageUnit, smilObject: SMILFileObject, fileEtagPromisesMedia: any[], fileEtagPromisesSMIL: any[]) {
	return new Promise((resolve, reject) => {
		parallel([
			async () => {
				while (checkFilesLoop) {
					await sleep(120000);
					const response = await Promise.all(fileEtagPromisesSMIL);
					if (response[0].length > 0) {
						debug('SMIL file changed, restarting loop');
						disableLoop(true);
						return;
					}
					await Promise.all(fileEtagPromisesMedia);
				}
			},
			async () => {
				await runEndlessLoop(async () => {
					await processPlaylist(smilObject.playlist, smilObject, internalStorageUnit);
				});
			},
		], async (err) => {
			if (err) {
				reject(err);
			}
			resolve();
		});
	});
}

export async function processPlaylist(playlist: object, region: RegionsObject, internalStorageUnit: IStorageUnit, parent?: string) {
	for (let [key, value] of Object.entries(playlist)) {
		debug('Processing playlist element with key: %O, value: %O', key, value);
		const promises = [];

		if (key == 'excl') {
			if (Array.isArray(value)) {
				for (let i in value) {
					promises.push((async () => {
						await processPlaylist(value[i], region, internalStorageUnit, 'seq');
					})());
				}
			} else {
				promises.push((async () => {
					await processPlaylist(value, region, internalStorageUnit, 'seq');
				})());
			}
		}

		if (key == 'priorityClass') {
			if (Array.isArray(value)) {
				for (let i in value) {
					promises.push((async () => {
						await processPlaylist(value[i], region, internalStorageUnit, 'seq');
					})());
				}
			} else {
				promises.push((async () => {
					await processPlaylist(value, region, internalStorageUnit, 'seq');
				})());
			}
		}

		if (key == 'seq') {
			if (Array.isArray(value)) {
				for (let i in value) {
					if (config.constants.extractedElements.includes(i)) {
						await getRegionPlayElement(value[i], i, internalStorageUnit, region, 'seq');
						continue;
					}
					promises.push((async () => {
						await processPlaylist(value[i], region, internalStorageUnit, 'seq');
					})());
				}
			} else {
				promises.push((async () => {
					await processPlaylist(value, region, internalStorageUnit, 'seq');
				})());
			}
		}

		if (key == 'par') {
			for (let i in value) {
				if (config.constants.extractedElements.includes(i)) {
					await getRegionPlayElement(value[i], i, internalStorageUnit, region, parent);
					continue;
				}
				if (Array.isArray(value[i])) {
					const wrapper = {
						par: value[i],
					};
					promises.push((async () => {
						await processPlaylist(wrapper, region, internalStorageUnit, 'par');
					})());
				} else {
					promises.push((async () => {
						await processPlaylist(value[i], region, internalStorageUnit, i);
					})());

				}
			}
		}

		await Promise.all(promises);

		if (config.constants.extractedElements.includes(key)) {
			await getRegionPlayElement(value, key, internalStorageUnit, region, parent);
		}
	}
}
