import isNil = require('lodash/isNil');
import isNaN = require('lodash/isNaN');
import isObject = require('lodash/isObject');
import get = require('lodash/get');
import { isEqual } from "lodash";
import { parallel } from 'async';
import {
	RegionAttributes,
	RegionsObject,
	SMILFileObject,
	SMILVideo,
	SosModule,
	CurrentlyPlaying, SMILFile,
} from '../../models';
import { FileStructure, SMILScheduleEnum } from '../../enums';
import { IFile, IStorageUnit } from '@signageos/front-applet/es6/FrontApplet/FileSystem/types';
import { defaults as config } from '../../config';
import { getFileName } from '../files/tools';
import {
	debug, getRegionInfo, sleep, detectPrefetchLoop, parseSmilSchedule,
	setDuration, extractAdditionalInfo, createHtmlElement, setDefaultAwait,
} from './tools';
import { Files } from '../files/files';
const isUrl = require('is-url-superb');

export class Playlist {
	private checkFilesLoop: boolean = true;
	private cancelFunction: boolean = false;
	private files: Files;
	private sos: SosModule;
	private currentlyPlaying: CurrentlyPlaying = {};
	private introObject: object;

	constructor(sos: SosModule, files: Files) {
		this.sos = sos;
		this.files = files;
	}

	public setIntroUrl(introObject: object) {
		this.introObject = introObject;
	}

	public setCheckFilesLoop(checkFilesLoop: boolean) {
		this.checkFilesLoop = checkFilesLoop;
	}

	public getCancelFunction(): boolean {
		return this.cancelFunction;
	}

	public disableLoop(value: boolean) {
		this.cancelFunction = value;
	}

	public runEndlessLoop = async (fn: Function) => {
		while (!this.cancelFunction) {
			try {
				await fn();
			} catch (err) {
				debug('Error: %O occured during processing function %s', err, fn.name);
				throw err;
			}
		}
	}

	public cancelPreviousVideo = async (regionInfo: RegionAttributes) => {
		debug('previous video playing: %O', this.currentlyPlaying[regionInfo.regionName]);
		await this.sos.video.stop(
			this.currentlyPlaying[regionInfo.regionName].localFilePath,
			this.currentlyPlaying[regionInfo.regionName].regionInfo.left,
			this.currentlyPlaying[regionInfo.regionName].regionInfo.top,
			this.currentlyPlaying[regionInfo.regionName].regionInfo.width,
			this.currentlyPlaying[regionInfo.regionName].regionInfo.height,
		);
		this.currentlyPlaying[regionInfo.regionName].playing = false;
		debug('previous video stopped');
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
		Object.keys(regionInfo).forEach((attr: any) => {
			if (config.constants.cssElementsPosition.includes(attr)) {
				element.style[attr] = `${regionInfo[attr]}px`;
			}
			if (config.constants.cssElements.includes(attr)) {
				element.style[attr] = <string> regionInfo[attr];
			}
		});
		element.style.position = 'absolute';
		element.style.backgroundColor = 'transparent';
		debug('Creating htmlElement: %O with duration %s', element, duration);
		if (exist) {
			// @ts-ignore
			oldElement.remove();
		}
		document.body.appendChild(element);
		if (!isNil(this.currentlyPlaying[regionInfo.regionName]) && this.currentlyPlaying[regionInfo.regionName].playing) {
			await this.cancelPreviousVideo(regionInfo);
		}
		await sleep(duration * 1000);
		debug('element playing finished');
	}

	public playVideosSeq = async (videos: SMILVideo[], internalStorageUnit: IStorageUnit) => {
		for (let i = 0; i < videos.length; i += 1) {
			const previousVideo = videos[(i + videos.length - 1) % videos.length];
			const currentVideo = videos[i];
			const nextVideo = videos[(i + 1) % videos.length];
			const currentVideoDetails = <IFile> await this.sos.fileSystem.getFile({
				storageUnit: internalStorageUnit,
				filePath: `${FileStructure.videos}/${getFileName(currentVideo.src)}`,
			});
			const nextVideoDetails = <IFile> await this.sos.fileSystem.getFile({
				storageUnit: internalStorageUnit,
				filePath: `${FileStructure.videos}/${getFileName(nextVideo.src)}`,
			});
			const previousVideoDetails = <IFile> await this.sos.fileSystem.getFile({
				storageUnit: internalStorageUnit,
				filePath: `${FileStructure.videos}/${getFileName(previousVideo.src)}`,
			});

			currentVideo.localFilePath = currentVideoDetails.localUri;
			nextVideo.localFilePath = nextVideoDetails.localUri;
			previousVideo.localFilePath = previousVideoDetails.localUri;

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

			// force stop video only when reloading smil file due to new version of smil
			if (this.getCancelFunction()) {
				await this.cancelPreviousVideo(currentVideo.regionInfo);
			}
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

	public playVideo = async (video: SMILVideo, internalStorageUnit: IStorageUnit) => {
		const currentVideoDetails = <IFile> await this.files.getFileDetails(video, internalStorageUnit, FileStructure.videos);
		video.localFilePath = currentVideoDetails.localUri;
		debug('Playing video: %O', video);

		await this.sos.video.prepare(
			video.localFilePath,
			video.regionInfo.left,
			video.regionInfo.top,
			video.regionInfo.width,
			video.regionInfo.height,
			config.videoOptions,
		);

		if (!isNil(this.currentlyPlaying[video.regionInfo.regionName]) && this.currentlyPlaying[video.regionInfo.regionName].playing) {
			await this.cancelPreviousVideo(video.regionInfo);
		}

		this.currentlyPlaying[video.regionInfo.regionName] = video;
		video.playing = true;

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
		debug('Playing video finished: %O', video);

		// no video.stop function so one video can be played gapless in infinite loop
		// stopping is handled by cancelPreviousVideo function
		// force stop video only when reloading smil file due to new version of smil
		if (this.getCancelFunction()) {
			await this.cancelPreviousVideo(video.regionInfo);
		}
	}

	public setupIntroVideo = async (video: SMILVideo, internalStorageUnit: IStorageUnit, region: RegionsObject) => {
		const currentVideoDetails = <IFile> await this.files.getFileDetails(video, internalStorageUnit, FileStructure.videos);
		video.regionInfo = getRegionInfo(region, video.region);
		video.localFilePath = currentVideoDetails.localUri;
		debug('Setting-up intro video: %O', video);
		await this.sos.video.prepare(
			video.localFilePath,
			video.regionInfo.left,
			video.regionInfo.top,
			video.regionInfo.width,
			video.regionInfo.height,
			config.videoOptions,
		);
		debug('Intro video prepared: %O', video);
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
					// widget with website url as datasource
					if (htmlElement === 'iframe' && getFileName(value[i].src).indexOf('.wgt') === -1) {
						await this.playTimedMedia(htmlElement, value[i].src, value[i].regionInfo, value[i].dur);
						continue;
					}
					const mediaFile = <IFile> await this.sos.fileSystem.getFile({
						storageUnit: internalStorageUnit,
						filePath: `${fileStructure}/${getFileName(value[i].src)}${widgetRootFile}`,
					});
					await this.playTimedMedia(htmlElement, mediaFile.localUri, value[i].regionInfo, value[i].dur);
				}
			}
		}
		if (parent === 'par') {
			const promises = [];
			debug('Playing media in parallel: %O', value);
			for (let i = 0; i < value.length; i += 1) {
				// widget with website url as datasource
				if (htmlElement === 'iframe' && getFileName(value[i].src).indexOf('.wgt') === -1) {
					promises.push((async () => {
						await this.playTimedMedia(htmlElement, value[i].src, value[i].regionInfo, value[i].dur);
					})());
					continue;
				}
				promises.push((async () => {
					const mediaFile = <IFile> await this.sos.fileSystem.getFile({
						storageUnit: internalStorageUnit,
						filePath: `${fileStructure}/${getFileName(value[i].src)}${widgetRootFile}`,
					});
					await this.playTimedMedia(htmlElement, mediaFile.localUri, value[i].regionInfo, value[i].dur);
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
					}
					await this.playVideosPar(value, internalStorageUnit);
					break;
				} else {
					await this.playVideo(<SMILVideo> value, internalStorageUnit);
					break;
				}
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
				debug(`Sorry, we are out of ${key}.`);
		}
	}

	public getRegionPlayElement = async (value: any, key: string, internalStorageUnit: IStorageUnit, region: RegionsObject, parent: string = '0') => {
		if (!isNaN(parseInt(parent))) {
			parent = 'seq';
		}
		if (Array.isArray(value)) {
			for (let i in value) {
				value[i].regionInfo = getRegionInfo(region, value[i].region);
				extractAdditionalInfo(value[i]);
			}
		} else {
			value.regionInfo = getRegionInfo(region, value.region);
			extractAdditionalInfo(value);
		}
		await this.playElement(value, key, internalStorageUnit, parent);
	}

	public processingLoop = async (
		internalStorageUnit: IStorageUnit,
		smilObject: SMILFileObject,
		smilFile: SMILFile,
	) => {
		return new Promise((resolve, reject) => {
			parallel([
				async (callback) => {
					while (this.checkFilesLoop) {
						debug('Prepare ETag check for smil media files prepared');
						const {
							fileEtagPromisesMedia: fileEtagPromisesMedia,
							fileEtagPromisesSMIL: fileEtagPromisesSMIL,
						} = await this.files.prepareETagSetup(internalStorageUnit, smilObject, smilFile);

						debug('ETag check for smil media files prepared');
						await sleep(90000);
						debug('Checking files for changes');
						const response = await Promise.all(fileEtagPromisesSMIL);
						if (response[0].length > 0) {
							debug('SMIL file changed, restarting loop');
							this.disableLoop(true);
							this.setCheckFilesLoop(false);
						}
						await Promise.all(fileEtagPromisesMedia);
					}
					callback();
				},
				async (callback) => {
					await this.runEndlessLoop(async () => {
						await this.processPlaylist(smilObject.playlist, smilObject, internalStorageUnit);
					});
					callback();
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
	// tslint:disable-next-line:max-line-length
	public processPlaylist = async (playlist: object, region: RegionsObject, internalStorageUnit: IStorageUnit, parent: string = '', endTime: number = 0) => {
		for (let [key, loopValue] of Object.entries(playlist)) {
			if (!isObject(loopValue)) {
				debug('Playlist element with key is not object: %O, value: %O, skipping', key, loopValue);
				continue;
			}
			let value: any = loopValue;
			debug('Processing playlist element with key: %O, value: %O', key, value);
			const promises = [];
			if (key === 'excl') {
				if (Array.isArray(value)) {
					for (let elem of value) {
						promises.push((async () => {
							await this.processPlaylist(elem, region, internalStorageUnit, 'seq', endTime);
						})());
					}
				} else {
					promises.push((async () => {
						await this.processPlaylist(value, region, internalStorageUnit, 'seq', endTime);
					})());
				}
			}

			if (key === 'priorityClass') {
				if (Array.isArray(value)) {
					for (let elem of value) {
						promises.push((async () => {
							await this.processPlaylist(elem, region, internalStorageUnit, 'seq', endTime);
						})());
					}
				} else {
					promises.push((async () => {
						await this.processPlaylist(value, region, internalStorageUnit, 'seq', endTime);
					})());
				}
			}

			if (key === 'seq') {
				if (Array.isArray(value)) {
					let arrayIndex = 0;
					for (const elem of value) {
						if (elem.hasOwnProperty('begin') && elem.begin.indexOf('wallclock') > -1
							&& !isEqual(elem, this.introObject)
							&& detectPrefetchLoop(elem)) {
							const {timeToStart, timeToEnd} = parseSmilSchedule(elem.begin, elem.end);
							// if no playable element was found in array, set defaultAwait for last element to avoid infinite loop
							if (arrayIndex === value.length - 1 && setDefaultAwait(value) === SMILScheduleEnum.defaultAwait) {
								debug('No active sequence find in wallclock schedule, setting default await: %s', SMILScheduleEnum.defaultAwait);
								await sleep(SMILScheduleEnum.defaultAwait);
							}

							if (timeToEnd === SMILScheduleEnum.neverPlay) {
								arrayIndex += 1;
								continue;
							}

							if (elem.hasOwnProperty('repeatCount') && elem.repeatCount !== 'indefinite') {
								const repeatCount = elem.repeatCount;
								let counter = 0;
								if (timeToStart <= 0) {
									promises.push((async () => {
										await sleep(timeToStart);
										while (counter < repeatCount) {
											await this.processPlaylist(elem, region, internalStorageUnit, 'seq', timeToEnd);
											counter += 1;
										}
									})());
								}
								await Promise.all(promises);
								arrayIndex += 1;
								continue;
							}
							// play at least one from array to avoid infinite loop
							if (value.length === 1 || timeToStart <= 0) {
								promises.push((async () => {
									await sleep(timeToStart);
									await this.processPlaylist(elem, region, internalStorageUnit, 'seq', timeToEnd);
								})());
							}
							await Promise.all(promises);
							arrayIndex += 1;
							continue;
						}

						if (elem.hasOwnProperty('repeatCount') && elem.repeatCount !== 'indefinite') {
							const repeatCount = elem.repeatCount;
							let counter = 0;
							promises.push((async () => {
								while (counter < repeatCount) {
									await this.processPlaylist(elem, region, internalStorageUnit, 'seq', endTime);
									counter += 1;
								}
							})());
							await Promise.all(promises);
							continue;
						}
						promises.push((async () => {
							await this.processPlaylist(elem, region, internalStorageUnit, 'seq', endTime);
						})());
					}
				} else {
					if (value.hasOwnProperty('begin') && value.begin.indexOf('wallclock') > -1) {
						const {timeToStart, timeToEnd} = parseSmilSchedule(value.begin, value.end);
						if (timeToEnd === SMILScheduleEnum.neverPlay) {
							return;
						}
						promises.push((async () => {
							await sleep(timeToStart);
							await this.processPlaylist(value, region, internalStorageUnit, 'seq', timeToEnd);
						})());
					} else if (value.repeatCount === 'indefinite'
						&& value !== this.introObject
						&& detectPrefetchLoop(value)) {
						promises.push((async () => {
							// when endTime is not set, play indefinitely
							if (endTime === 0) {
								await this.runEndlessLoop(async () => {
									await this.processPlaylist(value, region, internalStorageUnit, 'seq', endTime);
								});
							} else {
								while (Date.now() < endTime) {
									await this.processPlaylist(value, region, internalStorageUnit, 'seq', endTime);
									if (this.getCancelFunction()) {
										return;
									}
								}
							}
						})());
					} else if (value.hasOwnProperty('repeatCount') && value.repeatCount !== 'indefinite') {
						const repeatCount = value.repeatCount;
						let counter = 0;
						promises.push((async () => {
							while (counter < repeatCount) {
								await this.processPlaylist(value, region, internalStorageUnit, 'seq', endTime);
								counter += 1;
							}
						})());
						await Promise.all(promises);
					} else {
						promises.push((async () => {
							await this.processPlaylist(value, region, internalStorageUnit, 'seq', endTime);
						})());
					}
				}
			}

			if (key === 'par') {
				for (let [parKey, parValue] of Object.entries(<object> value)) {
					if (config.constants.extractedElements.includes(parKey)) {
						await this.getRegionPlayElement(parValue, parKey, internalStorageUnit, region, parent);
						continue;
					}
					if (Array.isArray(parValue)) {
						const controlTag = parKey === 'seq' ? parKey : 'par';
						const wrapper = {
							[controlTag]: parValue,
						};
						promises.push((async () => {
							await this.processPlaylist(wrapper, region, internalStorageUnit, 'par', endTime);
						})());
					} else {
						if (parValue.hasOwnProperty('begin') && parValue.begin.indexOf('wallclock') > -1) {
							const {timeToStart, timeToEnd} = parseSmilSchedule(parValue.begin, parValue.end);
							if (timeToEnd === SMILScheduleEnum.neverPlay) {
								return;
							}
							promises.push((async () => {
								await sleep(timeToStart);
								await this.processPlaylist(parValue, region, internalStorageUnit, parKey, timeToEnd);
							})());
							continue;
						}
						if (parValue.repeatCount === 'indefinite' && detectPrefetchLoop(parValue)) {
							promises.push((async () => {
								// when endTime is not set, play indefinitely
								if (endTime === 0) {
									await this.runEndlessLoop(async () => {
										await this.processPlaylist(parValue, region, internalStorageUnit, parKey, endTime);
									});
								} else {
									while (Date.now() < endTime) {
										await this.processPlaylist(parValue, region, internalStorageUnit, parKey, endTime);
										if (this.getCancelFunction()) {
											return;
										}
									}
								}
							})());
							continue;
						}

						if (parValue.hasOwnProperty('repeatCount') && parValue.repeatCount !== 'indefinite') {
							const repeatCount = parValue.repeatCount;
							let counter = 0;
							promises.push((async () => {
								while (counter < repeatCount) {
									await this.processPlaylist(parValue, region, internalStorageUnit, 'par', endTime);
									counter += 1;
								}
							})());
							await Promise.all(promises);
							continue;
						}

						promises.push((async () => {
							await this.processPlaylist(parValue, region, internalStorageUnit, parKey, endTime);
						})());
					}
				}
			}
			await Promise.all(promises);

			if (config.constants.extractedElements.includes(key)
				&& value !== get(this.introObject, 'video', 'default')
			) {
				await this.getRegionPlayElement(value, key, internalStorageUnit, region, parent);
			}
		}
	}
}
