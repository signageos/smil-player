import * as _ from 'lodash';
import { parallel } from 'async';
import { RegionAttributes, RegionsObject, SMILFileObject, SMILVideo, SosModule } from '../../models';
import { FileStructure } from '../../enums';
import { IFile, IStorageUnit } from '@signageos/front-applet/es6/FrontApplet/FileSystem/types';
import { Files } from '../files/files';
import { defaults as config } from '../../config';
import { getFileName } from '../files/tools';
import { debug, disableLoop, getRegionInfo, runEndlessLoop, sleep } from './tools';

const isUrl = require('is-url-superb');

export class Playlist {
	private checkFilesLoop = true;
	private files: object;
	private sos: SosModule;

	constructor (sos: SosModule) {
		this.sos = sos;
		this.files = new Files(sos);
	}

	playTimedMedia = async (htmlElement: string, filepath: string, regionInfo: RegionAttributes, duration: number) => {
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
	};

	playVideosSeq = async (videos: SMILVideo[], internalStorageUnit: IStorageUnit) => {
		for (let i = 0; i < videos.length; i += 1) {
			const previousVideo = videos[(i + videos.length - 1) % videos.length];
			const currentVideo = videos[i];
			const nextVideo = videos[(i + 1) % videos.length];
			const currentVideoDetails = <IFile>await this.sos.fileSystem.getFile({
				storageUnit: internalStorageUnit,
				filePath: `${FileStructure.videos}${getFileName(currentVideo.src)}`
			});
			const nextVideoDetails = <IFile>await this.sos.fileSystem.getFile({
				storageUnit: internalStorageUnit,
				filePath: `${FileStructure.videos}${getFileName(nextVideo.src)}`
			});
			const previousVideoDetails = <IFile>await this.sos.fileSystem.getFile({
				storageUnit: internalStorageUnit,
				filePath: `${FileStructure.videos}${getFileName(previousVideo.src)}`
			});

			currentVideo.localFilePath = currentVideoDetails.localUri;
			previousVideo.localFilePath = previousVideoDetails.localUri;
			nextVideo.localFilePath = nextVideoDetails.localUri;

			debug('Playing videos in loop, currentVideo: %O,' +
				' previousVideo: %O' +
				'nextVideo: %O', currentVideo, previousVideo, nextVideo);

			await this.sos.video.prepare(currentVideo.localFilePath, currentVideo.regionInfo.left, currentVideo.regionInfo.top, currentVideo.regionInfo.width, currentVideo.regionInfo.height, config.videoOptions);
			await this.sos.video.play(currentVideo.localFilePath, currentVideo.regionInfo.left, currentVideo.regionInfo.top, currentVideo.regionInfo.width, currentVideo.regionInfo.height);
			currentVideo.playing = true;
			if (previousVideo.playing) {
				debug('Stopping video: %O', previousVideo);
				await this.sos.video.stop(previousVideo.localFilePath, previousVideo.regionInfo.left, previousVideo.regionInfo.top, previousVideo.regionInfo.width, previousVideo.regionInfo.height);
				previousVideo.playing = false;
			}
			await this.sos.video.prepare(nextVideo.localFilePath, nextVideo.regionInfo.left, nextVideo.regionInfo.top, nextVideo.regionInfo.width, nextVideo.regionInfo.height, config.videoOptions);
			await this.sos.video.onceEnded(currentVideo.localFilePath, currentVideo.regionInfo.left, currentVideo.regionInfo.top, currentVideo.regionInfo.width, currentVideo.regionInfo.height);
		}
	};

	playVideosPar = async (videos: SMILVideo[], internalStorageUnit: IStorageUnit) => {
		const promises = [];
		for (let i = 0; i < videos.length; i += 1) {
			promises.push((async () => {
				await this.playVideo(videos[i], internalStorageUnit);
			})())
		}
		await Promise.all(promises);
	};

	playVideo = async (video: SMILVideo, internalStorageUnit: IStorageUnit) => {
		// @ts-ignore
		const currentVideoDetails = <IFile>await this.files.getFileDetails(video, internalStorageUnit, FileStructure.videos);
		video.localFilePath = currentVideoDetails.localUri;
		debug('Playing video: %O', video);
		await this.sos.video.prepare(video.localFilePath, video.regionInfo.left, video.regionInfo.top, video.regionInfo.width, video.regionInfo.height, config.videoOptions);
		await this.sos.video.play(video.localFilePath, video.regionInfo.left, video.regionInfo.top, video.regionInfo.width, video.regionInfo.height);
		await this.sos.video.onceEnded(video.localFilePath, video.regionInfo.left, video.regionInfo.top, video.regionInfo.width, video.regionInfo.height);
		await this.sos.video.stop(video.localFilePath, video.regionInfo.left, video.regionInfo.top, video.regionInfo.width, video.regionInfo.height);
	};

	setupIntroVideo = async (video: SMILVideo, internalStorageUnit: IStorageUnit, region: RegionsObject) => {
		// @ts-ignore
		const currentVideoDetails = <IFile>await this.files.getFileDetails(video, internalStorageUnit, FileStructure.videos);
		video.regionInfo = getRegionInfo(region, video.region);
		video.localFilePath = currentVideoDetails.localUri;
		debug('Setting-up intro video: %O', video);
		await this.sos.video.prepare(video.localFilePath, video.regionInfo.left, video.regionInfo.top, video.regionInfo.width, video.regionInfo.height, config.videoOptions);

	};

	playIntroVideo = async (video: SMILVideo) => {
		debug('Playing intro video: %O', video);
		await this.sos.video.play(video.localFilePath, video.regionInfo.left, video.regionInfo.top, video.regionInfo.width, video.regionInfo.height);
		await this.sos.video.onceEnded(video.localFilePath, video.regionInfo.left, video.regionInfo.top, video.regionInfo.width, video.regionInfo.height);
	};

	playOtherMedia = async (value: any, internalStorageUnit: IStorageUnit, parent: string, fileStructure: string, htmlElement: string, widgetRootFile: string) => {
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
					const mediaFile = <IFile>await this.sos.fileSystem.getFile({
						storageUnit: internalStorageUnit,
						filePath: `${fileStructure}${getFileName(value[i].src)}${widgetRootFile}`
					});
					await this.playTimedMedia(htmlElement, mediaFile.localUri, value[i].regionInfo, parseInt(value[i].dur, 10));
				}
			}
		} else {
			const promises = [];
			debug('Playing media in parallel: %O', value);
			for (let i = 0; i < value.length; i += 1) {
				promises.push((async () => {
					const mediaFile = <IFile>await this.sos.fileSystem.getFile({
						storageUnit: internalStorageUnit,
						filePath: `${fileStructure}${getFileName(value[i].src)}${widgetRootFile}`
					});
					await this.playTimedMedia(htmlElement, mediaFile.localUri, value[i].regionInfo, parseInt(value[i].dur, 10));
				})())
			}
			await Promise.all(promises);
		}
	};

	playElement = async (value: object | any[], key: string, internalStorageUnit: IStorageUnit, parent: string) => {
		debug('Playing element with key: %O, value: %O', key, value);
		switch (key) {
			case 'video':
				if (Array.isArray(value)) {
					if (parent == 'seq') {
						await this.playVideosSeq(value, internalStorageUnit);
						break;
					} else {
						await this.playVideosPar(value, internalStorageUnit);
						break;
					}
				} else {
					await this.playVideo(<SMILVideo>value, internalStorageUnit);
				}
				break;
			case 'audio':
				await this.playOtherMedia(value, internalStorageUnit, parent, FileStructure.audios, 'audio', '');
				break;
			case 'ref':
				await this.playOtherMedia(value, internalStorageUnit, parent, FileStructure.extracted, 'iframe', '/index.html');
				break;
			case 'img':
				await this.playOtherMedia(value, internalStorageUnit, parent, FileStructure.images, 'img', '');
				break;
			default:
				console.log('Sorry, we are out of ' + key + '.');
		}
	};

	getRegionPlayElement = async (value: any, key: string, internalStorageUnit: IStorageUnit, region: RegionsObject, parent: string = '0') => {
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
		await this.playElement(value, key, internalStorageUnit, parent);
	};

	processingLoop = async (internalStorageUnit: IStorageUnit, smilObject: SMILFileObject, fileEtagPromisesMedia: any[], fileEtagPromisesSMIL: any[]) => {
		return new Promise((resolve, reject) => {
			parallel([
				async () => {
					while (this.checkFilesLoop) {
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
						await this.processPlaylist(smilObject.playlist, smilObject, internalStorageUnit);
					});
				},
			], async (err) => {
				if (err) {
					reject(err);
				}
				resolve();
			});
		});
	};

	processPlaylist = async (playlist: object, region: RegionsObject, internalStorageUnit: IStorageUnit, parent?: string) => {
		for (let [key, value] of Object.entries(playlist)) {
			debug('Processing playlist element with key: %O, value: %O', key, value);
			const promises = [];

			if (key == 'excl') {
				if (Array.isArray(value)) {
					for (let i in value) {
						promises.push((async () => {
							await this.processPlaylist(value[i], region, internalStorageUnit, 'seq');
						})());
					}
				} else {
					promises.push((async () => {
						await this.processPlaylist(value, region, internalStorageUnit, 'seq');
					})());
				}
			}

			if (key == 'priorityClass') {
				if (Array.isArray(value)) {
					for (let i in value) {
						promises.push((async () => {
							await this.processPlaylist(value[i], region, internalStorageUnit, 'seq');
						})());
					}
				} else {
					promises.push((async () => {
						await this.processPlaylist(value, region, internalStorageUnit, 'seq');
					})());
				}
			}

			if (key == 'seq') {
				if (Array.isArray(value)) {
					for (let i in value) {
						if (config.constants.extractedElements.includes(i)) {
							await this.getRegionPlayElement(value[i], i, internalStorageUnit, region, 'seq');
							continue;
						}
						promises.push((async () => {
							await this.processPlaylist(value[i], region, internalStorageUnit, 'seq');
						})());
					}
				} else {
					promises.push((async () => {
						await this.processPlaylist(value, region, internalStorageUnit, 'seq');
					})());
				}
			}

			if (key == 'par') {
				for (let i in value) {
					if (config.constants.extractedElements.includes(i)) {
						await this.getRegionPlayElement(value[i], i, internalStorageUnit, region, parent);
						continue;
					}
					if (Array.isArray(value[i])) {
						const wrapper = {
							par: value[i],
						};
						promises.push((async () => {
							await this.processPlaylist(wrapper, region, internalStorageUnit, 'par');
						})());
					} else {
						promises.push((async () => {
							await this.processPlaylist(value[i], region, internalStorageUnit, i);
						})());

					}
				}
			}

			await Promise.all(promises);

			if (config.constants.extractedElements.includes(key)) {
				await this.getRegionPlayElement(value, key, internalStorageUnit, region, parent);
			}
		}
	}
}
