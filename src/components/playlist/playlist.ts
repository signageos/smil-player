import isNil = require('lodash/isNil');
import isNaN = require('lodash/isNaN');
import { parallel } from 'async';
import { RegionAttributes, RegionsObject, SMILFileObject, SMILVideo, SosModule, CurrentlyPlaying } from '../../models';
import { FileStructure } from '../../enums';
import { IFile, IStorageUnit } from '@signageos/front-applet/es6/FrontApplet/FileSystem/types';
import { defaults as config } from '../../config';
import { getFileName } from '../files/tools';
import { debug, disableLoop, getRegionInfo, runEndlessLoop, sleep } from './tools';

const isUrl = require('is-url-superb');

export class Playlist {
	private checkFilesLoop: boolean = true;
	private files: object;
	private sos: SosModule;
	private currentlyPlaying: CurrentlyPlaying = {};
	private introUrl: string;

	constructor (sos: SosModule, files: object) {
		this.sos = sos;
		this.files = files;
	}

	public setIntroUrl(url : string) {
		this.introUrl = url;
	}

	public playTimedMedia = async (htmlElement: string, filepath: string, regionInfo: RegionAttributes, duration: number) => {
		let exist = false;
		let oldElement: HTMLElement;
		if (document.getElementById(getFileName(filepath)) != null) {
			exist = true;
			oldElement = <HTMLElement> document.getElementById(getFileName(filepath));
		}
		const element: HTMLElement = <HTMLElement> document.createElement(htmlElement);

		element.setAttribute('src', filepath);
		element.id = getFileName(filepath);
		Object.keys(regionInfo).forEach((attr: string) => {
			if (config.constants.cssElementsPosition.includes(attr)) {
				// @ts-ignore
				element.style[attr] = `${regionInfo[attr]}px`;
			}
			if (config.constants.cssElements.includes(attr)) {
				// @ts-ignore
				element.style[attr] = regionInfo[attr];
			}
		});
		element.style.position = 'absolute';
		debug('Creating htmlElement: %O with duration %s', element, duration);
		if (exist) {
			// @ts-ignore
			oldElement.remove();
		}
		document.body.appendChild(element);
		if (!isNil(this.currentlyPlaying[regionInfo.regionName]) && this.currentlyPlaying[regionInfo.regionName].playing) {
			debug('previous video playing: %O', this.currentlyPlaying[regionInfo.regionName]);
			await this.sos.video.stop(
				this.currentlyPlaying[regionInfo.regionName].localFilePath,
				// @ts-ignore
				this.currentlyPlaying[regionInfo.regionName].regionInfo.left,
				// @ts-ignore
				this.currentlyPlaying[regionInfo.regionName].regionInfo.top,
				// @ts-ignore
				this.currentlyPlaying[regionInfo.regionName].regionInfo.width,
				// @ts-ignore
				this.currentlyPlaying[regionInfo.regionName].regionInfo.height,
			);
			this.currentlyPlaying[regionInfo.regionName].playing = false;
			debug('previous video stopped');
		}
		await sleep(duration * 1000);
	}

	public playVideosSeq = async (videos: SMILVideo[], internalStorageUnit: IStorageUnit) => {
		for (let i = 0; i < videos.length; i += 1) {
			const previousVideo = videos[(i + videos.length - 1) % videos.length];
			const currentVideo = videos[i];
			const nextVideo = videos[(i + 1) % videos.length];
			const currentVideoDetails = <IFile> await this.sos.fileSystem.getFile({
				storageUnit: internalStorageUnit,
				filePath: `${FileStructure.videos}${getFileName(currentVideo.src)}`,
			});
			const nextVideoDetails = <IFile> await this.sos.fileSystem.getFile({
				storageUnit: internalStorageUnit,
				filePath: `${FileStructure.videos}${getFileName(nextVideo.src)}`,
			});
			const previousVideoDetails = <IFile> await this.sos.fileSystem.getFile({
				storageUnit: internalStorageUnit,
				filePath: `${FileStructure.videos}${getFileName(previousVideo.src)}`,
			});

			currentVideo.localFilePath = currentVideoDetails.localUri;
			nextVideo.localFilePath = nextVideoDetails.localUri;
			previousVideo.localFilePath = previousVideoDetails.localUri;

			this.fixVideoDimension(<SMILVideo> currentVideo);
			this.fixVideoDimension(<SMILVideo> nextVideo);
			this.fixVideoDimension(<SMILVideo> previousVideo);

			debug(
				'Playing videos in loop, currentVideo: %O,' +
				' previousVideo: %O' +
				' nextVideo: %O',
				currentVideo,
				previousVideo,
				nextVideo,
			);

			// prepare video only once ( was double prepare current and next video )
			if (i === 0) {
				await this.sos.video.prepare(
					currentVideo.localFilePath,
					currentVideo.regionInfo.left,
					currentVideo.regionInfo.top,
					currentVideo.regionInfo.width,
					currentVideo.regionInfo.height,
					config.videoOptions,
				);
			}

			this.currentlyPlaying[currentVideo.regionInfo.regionName] = currentVideo;

			await this.sos.video.play(
				currentVideo.localFilePath,
				currentVideo.regionInfo.left,
				currentVideo.regionInfo.top,
				currentVideo.regionInfo.width,
				currentVideo.regionInfo.height,
			);
			currentVideo.playing = true;
			if (previousVideo.playing) {
				debug('Stopping video: %O', previousVideo);
				await this.sos.video.stop(
					previousVideo.localFilePath,
					previousVideo.regionInfo.left,
					previousVideo.regionInfo.top,
					previousVideo.regionInfo.width,
					previousVideo.regionInfo.height,
				);
				previousVideo.playing = false;
			}
			await this.sos.video.prepare(
				nextVideo.localFilePath,
				nextVideo.regionInfo.left,
				nextVideo.regionInfo.top,
				nextVideo.regionInfo.width,
				nextVideo.regionInfo.height,
				config.videoOptions,
			);
			await this.sos.video.onceEnded(
				currentVideo.localFilePath,
				currentVideo.regionInfo.left,
				currentVideo.regionInfo.top,
				currentVideo.regionInfo.width,
				currentVideo.regionInfo.height,
			);
		}
	}

	public playVideosPar = async (videos: SMILVideo[], internalStorageUnit: IStorageUnit) => {
		const promises = [];
		for (let i = 0; i < videos.length; i += 1) {
			promises.push((async () => {
				await this.playVideo(videos[i], internalStorageUnit);
			})());
		}
		await Promise.all(promises);
	}

	public fixVideoDimension = (video: SMILVideo) => {
		Object.keys(video.regionInfo).forEach((attr: string) => {
			if (config.constants.cssElements.includes(attr)) {
				// sos video does not support values in %
				// @ts-ignore
				if ((attr === 'width' || attr === 'height') && video.regionInfo[attr].indexOf('%') > 0) {
					switch (attr) {
						case 'width':
							video.regionInfo.width = document.body.clientWidth;
							break;
						case 'height':
							video.regionInfo.height = document.body.clientHeight;
							break;
						default:
							// unhandled attribute
					}
				}
			}
		});
	}

	public playVideo = async (video: SMILVideo, internalStorageUnit: IStorageUnit) => {
		// dont play intro video in each loop
		if (video.src == this.introUrl) {
			debug('Intro video detected, not playing: %O', video);
			return;
		}
		// @ts-ignore
		const currentVideoDetails = <IFile> await this.files.getFileDetails(video, internalStorageUnit, FileStructure.videos);
		video.localFilePath = currentVideoDetails.localUri;
		debug('Playing video: %O', video);
		this.fixVideoDimension(<SMILVideo> video);

		this.currentlyPlaying[video.regionInfo.regionName] = video;

		await this.sos.video.prepare(
			video.localFilePath,
			video.regionInfo.left,
			video.regionInfo.top,
			video.regionInfo.width,
			video.regionInfo.height,
			config.videoOptions,
		);
		await this.sos.video.play(
			video.localFilePath,
			video.regionInfo.left,
			video.regionInfo.top,
			video.regionInfo.width,
			video.regionInfo.height,
		);
		await this.sos.video.onceEnded(
			video.localFilePath,
			video.regionInfo.left,
			video.regionInfo.top,
			video.regionInfo.width,
			video.regionInfo.height,
		);
		await this.sos.video.stop(
			video.localFilePath,
			video.regionInfo.left,
			video.regionInfo.top,
			video.regionInfo.width,
			video.regionInfo.height,
		);
	}

	public setupIntroVideo = async (video: SMILVideo, internalStorageUnit: IStorageUnit, region: RegionsObject) => {
		// @ts-ignore
		const currentVideoDetails = <IFile> await this.files.getFileDetails(video, internalStorageUnit, FileStructure.videos);
		video.regionInfo = getRegionInfo(region, video.region);
		video.localFilePath = currentVideoDetails.localUri;
		this.fixVideoDimension(<SMILVideo> video);
		debug('Setting-up intro video: %O', video);
		await this.sos.video.prepare(
			video.localFilePath,
			video.regionInfo.left,
			video.regionInfo.top,
			video.regionInfo.width,
			video.regionInfo.height,
			config.videoOptions,
		);
	}

	public playIntroVideo = async (video: SMILVideo) => {
		debug('Playing intro video: %O', video);
		await this.sos.video.play(
			video.localFilePath,
			video.regionInfo.left,
			video.regionInfo.top,
			video.regionInfo.width,
			video.regionInfo.height,
		);
		await this.sos.video.onceEnded(
			video.localFilePath,
			video.regionInfo.left,
			video.regionInfo.top,
			video.regionInfo.width,
			video.regionInfo.height,
		);
	}

	public endIntroVideo = async (video: SMILVideo) => {
		debug('Ending intro video: %O', video);
		await this.sos.video.stop(
			video.localFilePath,
			video.regionInfo.left,
			video.regionInfo.top,
			video.regionInfo.width,
			video.regionInfo.height,
		);
	}

	public playOtherMedia = async (
		value: any,
		internalStorageUnit: IStorageUnit,
		parent: string,
		fileStructure: string,
		htmlElement: string,
		widgetRootFile: string,
	) => {
		if (!Array.isArray(value)) {
			if (isNil(value.src) || !isUrl(value.src)) {
				debug('Invalid element values: %O', value);
				return;
			}
			value = [value];
		}
		if (parent === 'seq') {
			debug('Playing media sequentially: %O', value);
			for (let i = 0; i < value.length; i += 1) {
				if (isUrl(value[i].src)) {
					const mediaFile = <IFile> await this.sos.fileSystem.getFile({
						storageUnit: internalStorageUnit,
						filePath: `${fileStructure}${getFileName(value[i].src)}${widgetRootFile}`,
					});
					await this.playTimedMedia(htmlElement, mediaFile.localUri, value[i].regionInfo, parseInt(value[i].dur, 10));
				}
			}
		} else {
			const promises = [];
			debug('Playing media in parallel: %O', value);
			for (let i = 0; i < value.length; i += 1) {
				promises.push((async () => {
					const mediaFile = <IFile> await this.sos.fileSystem.getFile({
						storageUnit: internalStorageUnit,
						filePath: `${fileStructure}${getFileName(value[i].src)}${widgetRootFile}`,
					});
					await this.playTimedMedia(htmlElement, mediaFile.localUri, value[i].regionInfo, parseInt(value[i].dur, 10));
				})());
			}
			await Promise.all(promises);
		}
	}

	public playElement = async (value: object | any[], key: string, internalStorageUnit: IStorageUnit, parent: string) => {
		debug('Playing element with key: %O, value: %O', key, value);
		switch (key) {
			case 'video':
				if (Array.isArray(value)) {
					if (parent === 'seq') {
						await this.playVideosSeq(value, internalStorageUnit);
						break;
					} else {
						await this.playVideosPar(value, internalStorageUnit);
						break;
					}
				} else {
					await this.playVideo(<SMILVideo> value, internalStorageUnit);
				}
				break;
			case 'ref':
				await this.playOtherMedia(value, internalStorageUnit, parent, FileStructure.extracted, 'iframe', '/index.html');
				break;
			case 'img':
				await this.playOtherMedia(value, internalStorageUnit, parent, FileStructure.images, 'img', '');
				break;
			// case 'audio':
			// 	await this.playOtherMedia(value, internalStorageUnit, parent, FileStructure.audios, 'audio', '');
			// 	break;
			default:
				console.log('Sorry, we are out of ' + key + '.');
		}
	}

	public getRegionPlayElement = async (value: any, key: string, internalStorageUnit: IStorageUnit, region: RegionsObject, parent: string = '0') => {
		if (!isNaN(parseInt(parent))) {
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
	}

	public processingLoop = async (
		internalStorageUnit: IStorageUnit,
		smilObject: SMILFileObject,
		fileEtagPromisesMedia: any[],
		fileEtagPromisesSMIL: any[],
	) => {
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
			],       async (err) => {
				if (err) {
					reject(err);
				}
				resolve();
			});
		});
	}
	// processing parsed playlist, will change in future
	public processPlaylist = async (playlist: object, region: RegionsObject, internalStorageUnit: IStorageUnit, parent?: string) => {
		for (let [key, value] of Object.entries(playlist)) {
			debug('Processing playlist element with key: %O, value: %O', key, value);
			const promises = [];

			if (key === 'excl') {
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

			if (key === 'priorityClass') {
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

			if (key === 'seq') {
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

			if (key === 'par') {
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
