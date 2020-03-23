import sos from '@signageos/front-applet';
import * as _ from 'lodash';

const isUrl = require('is-url-superb');

import { RegionsObject, RegionAttributes, SMILVideo, SMILAudio, SMILImage, SMILWidget } from '../models';
import { FileStructure } from '../enums';
import { IStorageUnit } from '@signageos/front-applet/es6/FrontApplet/FileSystem/types';
import { getFileName, getFileDetails } from './files';
import { defaults as config } from '../config';

let cancelFunction = false;

export function disableLoop(value: boolean) {
	cancelFunction = value;
}

export async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

export async function playTimedMedia(htmlElement, filepath: string, regionInfo: RegionAttributes, duration: number): Promise<void> {
	const element = document.createElement(htmlElement);
	element.src = filepath;
	element.id = getFileName(filepath);
	Object.keys(regionInfo).forEach((attr) => {
		if (config.constants.cssElements.includes(attr)) {
			element.style[attr] = regionInfo[attr];
		}
	});
	element.style['position'] = 'absolute';
	document.body.appendChild(element);
	await sleep(duration * 1000);
}

export function getRegionInfo(regionObject: object, regionName: string): RegionAttributes {
	const defaultRegion = {
		left: 0,
		top: 0,
		width: '1280',
		height: '720',
	};
	return _.get(regionObject, regionName, defaultRegion);
}

export async function playVideosSeq(videos, internalStorageUnit) {
	for (let i = 0; i < videos.length; i += 1) {
		const previousVideo = videos[(i + videos.length - 1) % videos.length];
		const currentVideo = videos[i];
		const nextVideo = videos[(i + 1) % videos.length];
		const currentVideoDetails = await sos.fileSystem.getFile({
			storageUnit: internalStorageUnit,
			filePath: `${FileStructure.videos}${getFileName(currentVideo.src)}`
		});
		const previousVideoDetails = await sos.fileSystem.getFile({
			storageUnit: internalStorageUnit,
			filePath: `${FileStructure.videos}${getFileName(previousVideo.src)}`
		});
		const nextVideoDetails = await sos.fileSystem.getFile({
			storageUnit: internalStorageUnit,
			filePath: `${FileStructure.videos}${getFileName(nextVideo.src)}`
		});

		currentVideo.localFilePath = currentVideoDetails.localUri;
		previousVideo.localFilePath = previousVideoDetails.localUri;
		nextVideo.localFilePath = nextVideoDetails.localUri;

		await sos.video.prepare(currentVideo.localFilePath, currentVideo.regionInfo.left, currentVideo.regionInfo.top, currentVideo.regionInfo.width, currentVideo.regionInfo.height, config.videoOptions);
		await sos.video.play(currentVideo.localFilePath, currentVideo.regionInfo.left, currentVideo.regionInfo.top, currentVideo.regionInfo.width, currentVideo.regionInfo.height);
		currentVideo.playing = true;
		if (previousVideo.playing) {
			await sos.video.stop(previousVideo.localFilePath, previousVideo.regionInfo.left, previousVideo.regionInfo.top, previousVideo.regionInfo.width, previousVideo.regionInfo.height);
			previousVideo.playing = false;
		}
		await sos.video.prepare(nextVideo.localFilePath, nextVideo.regionInfo.left, nextVideo.regionInfo.top, nextVideo.regionInfo.width, nextVideo.regionInfo.height, config.videoOptions);
		await sos.video.onceEnded(currentVideo.localFilePath, currentVideo.regionInfo.left, currentVideo.regionInfo.top, currentVideo.regionInfo.width, currentVideo.regionInfo.height);
	}
}

export async function playVideosPar(videos, internalStorageUnit) {
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

export async function playVideo(video, internalStorageUnit) {
	const currentVideoDetails = await getFileDetails(video, internalStorageUnit, FileStructure.videos);
	video.localFilePath = currentVideoDetails.localUri;
	await sos.video.prepare(video.localFilePath, video.regionInfo.left, video.regionInfo.top, video.regionInfo.width, video.regionInfo.height, config.videoOptions);
	await sos.video.play(video.localFilePath, video.regionInfo.left, video.regionInfo.top, video.regionInfo.width, video.regionInfo.height);
	await sos.video.onceEnded(video.localFilePath, video.regionInfo.left, video.regionInfo.top, video.regionInfo.width, video.regionInfo.height);
	await sos.video.stop(video.localFilePath, video.regionInfo.left, video.regionInfo.top, video.regionInfo.width, video.regionInfo.height);
}

export async function setupIntroVideo(video, internalStorageUnit, region) {
	const currentVideoDetails = await getFileDetails(video, internalStorageUnit, FileStructure.videos);
	video.regionInfo = getRegionInfo(region, video.region);
	video.localFilePath = currentVideoDetails.localUri;
	// @ts-ignore
	await sos.video.prepare(video.localFilePath, video.regionInfo.left, video.regionInfo.top, video.regionInfo.width, video.regionInfo.height, config.videoOptions);
}

export async function playIntroVideo(video) {
	await sos.video.play(video.localFilePath, video.regionInfo.left, video.regionInfo.top, video.regionInfo.width, video.regionInfo.height);
	await sos.video.onceEnded(video.localFilePath, video.regionInfo.left, video.regionInfo.top, video.regionInfo.width, video.regionInfo.height);
}

export async function playOtherMedia(value: any, key: string, internalStorageUnit: IStorageUnit, parent: string, fileStructure: string, htmlElement: string, widgetRootFile: string) {
	if (!Array.isArray(value)) {
		if (_.isNil(value.src) || !isUrl(value.src)) {
			return;
		}
		value = [value];
	}
	if (parent == 'seq') {
		for (let i = 0; i < value.length; i += 1) {
			if (isUrl(value[i].src)) {
				const mediaFile = await sos.fileSystem.getFile({
					storageUnit: internalStorageUnit,
					filePath: `${fileStructure}${getFileName(value[i].src)}${widgetRootFile}`
				});
				await playTimedMedia(htmlElement, mediaFile.localUri, value[i].regionInfo, parseInt(value[i].dur, 10));
			}
		}
	} else {
		const promises = [];
		for (let i = 0; i < value.length; i += 1) {
			promises.push((async () => {
				const mediaFile = await sos.fileSystem.getFile({
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
				await playVideo(value, internalStorageUnit);
			}
			break;
		case 'audio':
			await playOtherMedia(value, key, internalStorageUnit, parent, FileStructure.audios, 'audio', '');
			break;
		case 'ref':
			await playOtherMedia(value, key, internalStorageUnit, parent, FileStructure.extracted, 'iframe', '/index.html');
			break;
		case 'img':
			await playOtherMedia(value, key, internalStorageUnit, parent, FileStructure.images, 'img', '');
			break;
		default:
			console.log('Sorry, we are out of ' + key + '.');
	}
}

export async function getRegionPlayElement(value: any, key: string, internalStorageUnit: IStorageUnit, parent: string, region: object) {
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

export async function processPlaylist(playlist: object, region: object, internalStorageUnit, parent?: string) {
	for (let [key, value] of Object.entries(playlist)) {
		// console.log(`${key}: ${value}`);
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
						await getRegionPlayElement(value[i], i, internalStorageUnit, 'seq', region);
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
					await getRegionPlayElement(value[i], i, internalStorageUnit, parent, region);
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
			await getRegionPlayElement(value, key, internalStorageUnit, parent, region);
		}
	}
}
