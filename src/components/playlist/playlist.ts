import isNil = require('lodash/isNil');
import isNaN = require('lodash/isNaN');
import isObject = require('lodash/isObject');
const isUrl = require('is-url-superb');
import get = require('lodash/get');
import set = require('lodash/set');
import { isEqual } from 'lodash';
import { parallel } from 'async';
import FrontApplet from '@signageos/front-applet/es6/FrontApplet/FrontApplet';
import Nexmosphere from '@signageos/front-applet-extension-nexmosphere/es6';

import {
	RegionAttributes,
	RegionsObject,
	SMILFileObject,
	SMILVideo,
	CurrentlyPlaying,
	CurrentlyPlayingPriority,
	PriorityObject,
	SMILFile,
	SMILImage,
	PlaylistElement,
	SMILWidget,
	SMILMedia,
	SMILMediaNoVideo,
	SMILIntro, SosHtmlElement, TriggerList, ParsedTriggerCondition, ParsedSensor, PlayingInfo,
} from '../../models';
import { FileStructure, SMILScheduleEnum, XmlTags, HtmlEnum, SMILTriggersEnum, DeviceInfo, SMILEnums } from '../../enums';
import { defaults as config } from '../../../config/parameters';
import { IFile, IStorageUnit, IVideoFile } from '@signageos/front-applet/es6/FrontApplet/FileSystem/types';
import { getFileName, getRandomInt } from '../files/tools';
import {
	debug, getRegionInfo, sleep, isNotPrefetchLoop, parseSmilSchedule,
	setElementDuration, createHtmlElement, extractAdditionalInfo, setDefaultAwait,
	generateElementId, createDomElement, checkSlowDevice, createPriorityObject,
} from './tools';
import { Files } from '../files/files';
import { RfidAntennaEvent } from "@signageos/front-applet/es6/Sensors/IRfidAntenna";

export class Playlist {
	private checkFilesLoop: boolean = true;
	private cancelFunction: boolean = false;
	private files: Files;
	private sos: FrontApplet;
	// hold reference to all currently playing content in each region
	private currentlyPlaying: CurrentlyPlaying = {};
	private currentlyPlayingPriority: CurrentlyPlayingPriority = {};
	private triggersEndless: any = {};
	private introObject: object;

	constructor(sos: FrontApplet, files: Files) {
		this.sos = sos;
		this.files = files;
	}

	public setCheckFilesLoop(checkFilesLoop: boolean) {
		this.checkFilesLoop = checkFilesLoop;
	}

	// disables endless loop for media playing
	public disableLoop(value: boolean) {
		this.cancelFunction = value;
	}

	/**
	 * runs function given as parameter in endless loop
	 * @param fn - Function
	 */
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

	/**
	 * Performs all necessary actions needed to process playlist ( delete unused files, extact widgets, extract regionInfo for each media )
	 * @param smilObject - JSON representation of parsed smil file
	 * @param internalStorageUnit - persistent storage unit
	 * @param smilUrl - url for SMIL file so its not deleted as unused file ( actual smil file url is not present in smil file itself )
	 */
	public manageFilesAndInfo = async (smilObject: SMILFileObject, internalStorageUnit: IStorageUnit, smilUrl: string) => {
		// check of outdated files and delete them
		await this.files.deleteUnusedFiles(internalStorageUnit, smilObject, smilUrl);

		debug('Unused files deleted');

		// unpack .wgt archives with widgets ( ref tag )
		await this.files.extractWidgets(smilObject.ref, internalStorageUnit);

		debug('Widgets extracted');

		// has to before getAllinfo for generic playlist, because src attribute for triggers is specified during intro
		await this.getAllInfo(smilObject.triggers, smilObject, internalStorageUnit, true);
		debug('All triggers info extracted');

		// extracts region info for all medias in playlist
		await this.getAllInfo(smilObject.playlist, smilObject, internalStorageUnit);
		debug('All elements info extracted');
	}

	/**
	 * plays intro media before actual playlist starts, default behaviour is to play video as intro
	 * @param smilObject - JSON representation of parsed smil file
	 * @param internalStorageUnit - persistent storage unit
	 * @param smilUrl - url of actual smil file
	 */
	public playIntro = async (
		smilObject: SMILFileObject, internalStorageUnit: IStorageUnit, smilUrl: string,
	): Promise<void> => {
		let media: string = HtmlEnum.video;
		let fileStructure: string = FileStructure.videos;
		let downloadPromises: Promise<Function[]>[] = [];
		let imageElement: HTMLElement = document.createElement(HtmlEnum.img);

		// play image
		if (smilObject.intro[0].hasOwnProperty(HtmlEnum.img)) {
			media = HtmlEnum.img;
			fileStructure = FileStructure.images;
		}

		downloadPromises = downloadPromises.concat(
			await this.files.parallelDownloadAllFiles(internalStorageUnit, [<SMILVideo | SMILImage> smilObject.intro[0][media]], fileStructure),
		);

		await Promise.all(downloadPromises);

		const intro: SMILIntro = smilObject.intro[0];

		switch (media) {
			case HtmlEnum.img:
				if (imageElement.getAttribute('src') === null) {
					imageElement = await this.setupIntroImage(intro.img!, internalStorageUnit, smilObject);
				}
				break;
			default:
				await this.setupIntroVideo(intro.video!, internalStorageUnit, smilObject);
		}

		debug('Intro media downloaded: %O', intro);

		downloadPromises = await this.files.prepareDownloadMediaSetup(internalStorageUnit, smilObject);

		await this.playIntroLoop(media, intro, downloadPromises, smilObject, internalStorageUnit, smilUrl);

		debug('Playing intro finished: %O', intro);

		switch (media) {
			case HtmlEnum.img:
				imageElement.style.display = 'none';
				break;
			default:
				await this.endIntroVideo(intro.video!);
		}
	}

	/**
	 * main processing function of smil player, runs playlist in endless loop and periodically
	 * checks for smil and media update in parallel
	 * @param internalStorageUnit - persistent storage unit
	 * @param smilObject - JSON representation of parsed smil file
	 * @param smilFile - representation of actual SMIL file
	 */
	public processingLoop = async (
		internalStorageUnit: IStorageUnit,
		smilObject: SMILFileObject,
		smilFile: SMILFile,
	): Promise<void> => {
		return new Promise((resolve, reject) => {
			parallel([
				async (callback) => {
					while (this.checkFilesLoop) {
						debug('Prepare ETag check for smil media files prepared');
						const {
							fileEtagPromisesMedia: fileEtagPromisesMedia,
							fileEtagPromisesSMIL: fileEtagPromisesSMIL,
						} = await this.files.prepareLastModifiedSetup(internalStorageUnit, smilObject, smilFile);

						debug('Last modified check for smil media files prepared');
						await sleep(smilObject.refresh * 1000);
						debug('Checking files for changes');
						let responseFiles = await Promise.all(fileEtagPromisesSMIL);
						responseFiles = responseFiles.concat(await Promise.all(fileEtagPromisesMedia));
						for (const response of responseFiles) {
							if (response.length > 0) {
								debug('One of the files changed, restarting loop');
								this.disableLoop(true);
								this.setCheckFilesLoop(false);
								break;
							}
						}
					}
					callback();
				},
				async (callback) => {
					// endless processing of smil playlist
					await this.runEndlessLoop(async () => {
						try {
							await this.processPlaylist(smilObject.playlist);
						} catch (err) {
							debug('Unexpected error during playlist processing: %O', err);
							await sleep(5000);
						}
					});
					callback();
				},
				async (callback) => {
					// triggers processing
					await this.watchTriggers(smilObject);
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

	/**
	 * recursively traverses through playlist and gets additional info for all media  specified in smil file
	 * @param playlist - smil file playlist, set of rules which media should be played and when
	 * @param region - regions object with information about all regions
	 * @param internalStorageUnit - persistent storage unit
	 * @param isTrigger - boolean value determining if function is processing trigger playlist or ordinary playlist
	 */
	public getAllInfo = async (
		playlist: PlaylistElement | PlaylistElement[] | TriggerList, region: SMILFileObject, internalStorageUnit: IStorageUnit,
		isTrigger: boolean = false,
	): Promise<void> => {
		let widgetRootFile: string = '';
		let fileStructure: string = '';
		let htmlElement: string = '';
		let triggerName: string = '';
		for (let [key, loopValue] of Object.entries(playlist)) {
			triggerName = key === 'begin' && loopValue.startsWith(SMILTriggersEnum.triggerFormat) ? loopValue : triggerName;
			// skip processing string values like "repeatCount": "indefinite"
			if (!isObject(loopValue)) {
				continue;
			}

			let value: PlaylistElement | PlaylistElement[] = loopValue;
			if (XmlTags.extractedElements.includes(key)) {
				debug('found %s element, getting all info', key);
				if (!Array.isArray(value)) {
					value = [value];
				}

				switch (key) {
					case 'video':
						fileStructure = FileStructure.videos;
						break;
					case 'ref':
						widgetRootFile = HtmlEnum.widgetRoot;
						fileStructure = FileStructure.extracted;
						htmlElement = HtmlEnum.ref;
						break;
					case SMILEnums.img:
						fileStructure = FileStructure.images;
						htmlElement = HtmlEnum.img;
						break;
					case 'audio':
						fileStructure = FileStructure.audios;
						break;
					default:
						debug(`Sorry, we are out of ${key}.`);
				}

				for (const elem of value) {
					if (isUrl(elem.src)) {
						const mediaFile = <IVideoFile> await this.sos.fileSystem.getFile({
							storageUnit: internalStorageUnit,
							filePath: `${fileStructure}/${getFileName(elem.src)}${widgetRootFile}`,
						});
						// in case of web page as widget, leave localFilePath blank
						elem.localFilePath = mediaFile ? mediaFile.localUri : '';

						// check if video has duration defined due to webos bug
						if (key === 'video') {
							elem.dur = mediaFile.videoDurationMs ? mediaFile.videoDurationMs : SMILEnums.defaultVideoDuration;
						}
						elem.regionInfo = getRegionInfo(region, elem.region);
						extractAdditionalInfo(elem);

						// element will be played only on trigger emit in nested region
						if (isTrigger) {
							elem.triggerValue = triggerName;
						}

						// create placeholders in DOM for images and widgets to speedup playlist processing
						if (key === SMILEnums.img || key === 'ref') {
							createDomElement(elem, htmlElement, isTrigger);
						}
					}
				}
			} else {
				await this.getAllInfo(value, region, internalStorageUnit, isTrigger);
			}
		}
	}

	/**
	 * excl and priorityClass are not supported in this version, they are processed as seq tags
	 * @param value - JSON object or array of objects
	 * @param parent - superordinate element of value
	 * @param endTime - date in millis when value stops playing
	 */
	public processPriorityTag = (
		value: PlaylistElement | PlaylistElement[], parent: string = '', endTime: number = 0,
	): Promise<void>[] => {
		const promises: Promise<void>[] = [];
		if (Array.isArray(value)) {
			let arrayIndex = value.length - 1;
			for (let elem of value) {
				const priorityObject = createPriorityObject(elem, arrayIndex);
				promises.push((async () => {
					await this.processPlaylist(elem, parent, endTime, priorityObject);
				})());
				arrayIndex -= 1;
			}
		} else {
			const priorityObject = createPriorityObject(value, 0);
			promises.push((async () => {
				await this.processPlaylist(value, parent, endTime, priorityObject);
			})());
		}
		return promises;
	}

	/**
	 * recursive function which goes through the playlist and process supported tags
	 * is responsible for calling functions which handles actual playing of elements
	 * @param playlist - JSON representation of SMIL parsed playlist
	 * @param parent - superordinate element of value
	 * @param endTime - date in millis when value stops playing
	 * @param priorityObject
	 */
	public processPlaylist = async (
		playlist: PlaylistElement | PlaylistElement[], parent: string = '',
		endTime: number = 0, priorityObject: PriorityObject =  <PriorityObject> {},
	) => {
		for (let [key, loopValue] of Object.entries(playlist)) {
			// skips processing attributes of elements like repeatCount or wallclock
			if (!isObject(loopValue)) {
				debug('Playlist element with key: %O is not object. value: %O, skipping', key, loopValue);
				continue;
			}
			let value: PlaylistElement | PlaylistElement[] = loopValue;
			debug('Processing playlist element with key: %O, value: %O', key, value);

			// dont play intro in the actual playlist
			if (XmlTags.extractedElements.includes(key)
				&& value !== get(this.introObject, 'video', 'default')
				&& value !== get(this.introObject, SMILEnums.img, 'default')
			) {
				const lastPlaylistElem: string = Object.entries(playlist)[Object.entries(playlist).length - 1][0];
				const isLast = lastPlaylistElem === key;
				await this.priorityBehaviour(<SMILMedia> value, key, parent, endTime, priorityObject, isLast);
				continue;
			}

			let promises: Promise<void>[] = [];

			if (key === 'excl') {
				promises = this.processPriorityTag(value, 'seq', endTime);
			}

			if (key === 'priorityClass') {
				promises = this.processPriorityTag(value, 'seq', endTime);
			}

			if (key === 'seq') {
				let newParent = `seq-${getRandomInt(100000)}`;
				if (Array.isArray(value)) {
					let arrayIndex = 0;
					for (const valueElement of value) {
						// skip trigger processing in automated playlist
						if (valueElement.hasOwnProperty('begin') && valueElement.begin!.startsWith(SMILTriggersEnum.triggerFormat)) {
							continue;
						}
						if (valueElement.hasOwnProperty('begin') && valueElement.begin.indexOf('wallclock') > -1
							&& !isEqual(valueElement, this.introObject)
							&& isNotPrefetchLoop(valueElement)) {
							const {timeToStart, timeToEnd} = parseSmilSchedule(valueElement.begin, valueElement.end);
							// if no playable element was found in array, set defaultAwait for last element to avoid infinite loop
							if (arrayIndex === value.length - 1 && setDefaultAwait(value) === SMILScheduleEnum.defaultAwait) {
								debug('No active sequence find in wallclock schedule, setting default await: %s', SMILScheduleEnum.defaultAwait);
								await sleep(SMILScheduleEnum.defaultAwait);
							}

							if (timeToEnd === SMILScheduleEnum.neverPlay || timeToEnd < Date.now()) {
								arrayIndex += 1;
								continue;
							}

							if (valueElement.hasOwnProperty('repeatCount') && valueElement.repeatCount !== 'indefinite') {
								const repeatCount = valueElement.repeatCount;
								let counter = 0;
								if (timeToStart <= 0) {
									promises.push((async () => {
										await sleep(timeToStart);
										newParent = `seq-${getRandomInt(100000)}`;
										while (counter < repeatCount) {
											await this.processPlaylist(valueElement, newParent, repeatCount, priorityObject);
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
									await this.processPlaylist(valueElement, newParent, timeToEnd, priorityObject);
								})());
							}
							await Promise.all(promises);
							arrayIndex += 1;
							continue;
						}

						if (valueElement.hasOwnProperty('repeatCount') && valueElement.repeatCount !== 'indefinite') {
							const repeatCount = valueElement.repeatCount;
							let counter = 0;
							promises.push((async () => {
								newParent = `seq-${getRandomInt(100000)}`;
								while (counter < repeatCount) {
									await this.processPlaylist(valueElement, newParent, repeatCount, priorityObject);
									counter += 1;
								}
							})());
							await Promise.all(promises);
							continue;
						}
						promises.push((async () => {
							await this.processPlaylist(valueElement, newParent, endTime, priorityObject);
						})());
					}
				} else {
					// skip trigger processing in automated playlist
					if (value.hasOwnProperty('begin') && value.begin!.startsWith(SMILTriggersEnum.triggerFormat)) {
						continue;
					}
					if (value.hasOwnProperty('begin') && value.begin!.indexOf('wallclock') > -1) {
						const {timeToStart, timeToEnd} = parseSmilSchedule(value.begin!, value.end);
						// playlist endTime is in past, wait default amnout of time and then try again ( to avoid indefinite loop )
						if (timeToEnd === SMILScheduleEnum.neverPlay || timeToEnd < Date.now()) {
							debug('No active sequence find in wallclock schedule, setting default await: %s', SMILScheduleEnum.defaultAwait);
							await sleep(SMILScheduleEnum.defaultAwait);
							return;
						}
						if (value.hasOwnProperty('repeatCount') && value.repeatCount !== 'indefinite') {
							const repeatCount: number = <number> value.repeatCount;
							let counter = 0;
							promises.push((async () => {
								await sleep(timeToStart);
								newParent = `seq-${getRandomInt(100000)}`;
								while (counter < repeatCount) {
									await this.processPlaylist(value, newParent, repeatCount, priorityObject);
									counter += 1;
								}
							})());
							continue;
						}
						promises.push((async () => {
							await sleep(timeToStart);
							await this.processPlaylist(value, newParent, endTime, priorityObject);
						})());
					} else if (value.repeatCount === 'indefinite'
						&& value !== this.introObject
						&& isNotPrefetchLoop(value)) {
						promises.push((async () => {
							// when endTime is not set, play indefinitely
							if (endTime === 0) {
								newParent = `seq-${getRandomInt(100000)}`;
								await this.runEndlessLoop(async () => {
									await this.processPlaylist(value, newParent, endTime, priorityObject);
								});
								// play N-times, is determined by higher level tag, because this one has repeatCount=indefinite
							} else if (endTime > 0 && endTime <= 1000) {
								const seqParent = parent.replace('par', 'seq');
								await this.processPlaylist(value, seqParent, endTime, priorityObject);
							} else {
								newParent = `seq-${getRandomInt(100000)}`;
								while (Date.now() <= endTime) {
									await this.processPlaylist(value, newParent, endTime, priorityObject);
									// force stop because new version of smil file was detected
									if (this.getCancelFunction()) {
										return;
									}
								}
							}
						})());
					} else if (value.hasOwnProperty('repeatCount') && value.repeatCount !== 'indefinite') {
						const repeatCount: number = <number> value.repeatCount;
						let counter = 0;
						promises.push((async () => {
							newParent = `seq-${getRandomInt(100000)}`;
							while (counter < repeatCount) {
								await this.processPlaylist(value, newParent, repeatCount, priorityObject);
								counter += 1;
							}
						})());
						await Promise.all(promises);
					} else {
						promises.push((async () => {
							await this.processPlaylist(value, newParent, endTime, priorityObject);
						})());
					}
				}
			}

			if (key === 'par') {
				for (let [parKey, parValue] of Object.entries(<object> value)) {
					let newParent = `${parKey}-${getRandomInt(100000)}`;
					if (XmlTags.extractedElements.includes(parKey)) {
						const lastPlaylistElem: string = Object.entries(value)[Object.entries(value).length - 1][0];
						const isLast = lastPlaylistElem === key;
						await this.priorityBehaviour(parValue, parKey, newParent, endTime, priorityObject, isLast);
						continue;
					}
					if (Array.isArray(parValue)) {
						const controlTag = parKey === 'seq' ? parKey : 'par';
						const wrapper = {
							[controlTag]: parValue,
						};
						promises.push((async () => {
							await this.processPlaylist(wrapper, newParent, endTime, priorityObject);
						})());
					} else {
						// skip trigger processing in automated playlist
						if (value.hasOwnProperty('begin') && value.begin!.startsWith(SMILTriggersEnum.triggerFormat)) {
							continue;
						}
						if (value.hasOwnProperty('begin') && value.begin!.indexOf('wallclock') > -1) {
							const { timeToStart, timeToEnd } = parseSmilSchedule(value.begin!, value.end);
							if (timeToEnd === SMILScheduleEnum.neverPlay || timeToEnd < Date.now()) {
								debug('No active sequence find in wallclock schedule, setting default await: %s', SMILScheduleEnum.defaultAwait);
								await sleep(SMILScheduleEnum.defaultAwait);
								return;
							}
							if (value.hasOwnProperty('repeatCount') && value.repeatCount !== 'indefinite') {
								const repeatCount: number = <number> value.repeatCount;
								let counter = 0;
								promises.push((async () => {
									await sleep(timeToStart);
									newParent = `par-${getRandomInt(100000)}`;
									while (counter < repeatCount) {
										await this.processPlaylist(value, newParent, repeatCount, priorityObject);
										counter += 1;
									}
								})());
								break;
							}
							promises.push((async () => {
								await sleep(timeToStart);
								await this.processPlaylist(value, newParent, timeToEnd, priorityObject);
							})());
							break;
						}

						if (parValue.hasOwnProperty('begin') && parValue.begin!.indexOf('wallclock') > -1) {
							const { timeToStart, timeToEnd } = parseSmilSchedule(parValue.begin!, parValue.end);
							if (parValue.hasOwnProperty('repeatCount') && parValue.repeatCount !== 'indefinite') {
								const repeatCount: number = <number> parValue.repeatCount;
								let counter = 0;
								promises.push((async () => {
									await sleep(timeToStart);
									newParent = `${parKey}-${getRandomInt(100000)}`;
									while (counter < repeatCount) {
										await this.processPlaylist(parValue, newParent, repeatCount, priorityObject);
										counter += 1;
									}
								})());
								continue;
							}

							if (timeToEnd === SMILScheduleEnum.neverPlay || timeToEnd < Date.now()) {
								debug('No active sequence find in wallclock schedule, setting default await: %s', SMILScheduleEnum.defaultAwait);
								await sleep(SMILScheduleEnum.defaultAwait);
								return;
							}
							promises.push((async () => {
								await sleep(timeToStart);
								await this.processPlaylist(parValue, newParent, timeToEnd, priorityObject);
							})());
							continue;
						}
						if (parValue.repeatCount === 'indefinite' && isNotPrefetchLoop(parValue)) {
							promises.push((async () => {
								// when endTime is not set, play indefinitely
								if (endTime === 0) {
									newParent = `${parKey}-${getRandomInt(100000)}`;
									await this.runEndlessLoop(async () => {
										await this.processPlaylist(parValue, newParent, endTime, priorityObject);
									});
								} else if (endTime > 0 && endTime <= 1000) {
									await this.processPlaylist(parValue, newParent, endTime, priorityObject);
								} else {
									newParent = `${parKey}-${getRandomInt(100000)}`;
									while (Date.now() <= endTime) {
										await this.processPlaylist(parValue, newParent, endTime, priorityObject);
										// force stop because new version of smil file was detected
										if (this.getCancelFunction()) {
											return;
										}
									}
								}
							})());
							continue;
						}

						if (parValue.hasOwnProperty('repeatCount') && parValue.repeatCount !== 'indefinite') {
							const repeatCount: number = parValue.repeatCount;
							let counter = 0;
							promises.push((async () => {
								newParent = `${parKey}-${getRandomInt(100000)}`;
								while (counter < repeatCount) {
									await this.processPlaylist(parValue, newParent, repeatCount, priorityObject);
									counter += 1;
								}
							})());
							await Promise.all(promises);
							continue;
						}

						promises.push((async () => {
							await this.processPlaylist(parValue, newParent, endTime, priorityObject);
						})());
					}
				}
			}

			await Promise.all(promises);
		}
	}

	public watchTriggers = async(smilObject: SMILFileObject) => {
		let serialPort;
		try {
			serialPort = await this.sos.hardware.openSerialPort({
				device: <string> SMILTriggersEnum.nexmoDevice,
				baudRate: <number> SMILTriggersEnum.nexmoBaudRate,
			});
		} catch (err) {
			debug('Error occured during Nexmosphere trigger initialization: %O', err);
			return;
		}

		// @ts-ignore
		const nexmosphere = new Nexmosphere(serialPort);
		const sensorArray = [];

		for (const sensor of smilObject.sensors) {
			if (sensor.driver === SMILTriggersEnum.sensorNexmo && sensor.type === SMILTriggersEnum.sensorRfid) {
				// sensor does not have address
				if (get(sensor, 'address', 'default') === 'default') {
					debug('Sensor %O does not have address specified.', sensor);
					continue;
				}

				sensorArray.push(nexmosphere.createRfidAntenna(parseInt(sensor.address!)));

				sensorArray[sensorArray.length - 1].on(RfidAntennaEvent.PICKED, async (tag: number) => {
					try {
						await this.processRfidAntenna(smilObject, sensor, tag, RfidAntennaEvent.PICKED);
					} catch (err) {
						debug('Unexpected error occurred at sensor: %O with tag: %s', sensor, tag);
					}
				});
				sensorArray[sensorArray.length - 1].on(RfidAntennaEvent.PLACED, async (tag: number) => {
					try {
						await this.processRfidAntenna(smilObject, sensor, tag, RfidAntennaEvent.PLACED);
					} catch (err) {
						debug('Unexpected error occurred at sensor: %O with tag: %s', sensor, tag);
					}
			});
			}
		}
	}

	private processRfidAntenna = async (smilObject: SMILFileObject, sensor: ParsedSensor, tag: number, action: string) => {
		debug('RfId tag: %s picked on antena: %s', tag, sensor.id);
		const triggerInfo = smilObject.triggerSensorInfo[`${sensor.id}-${tag}`];
		let counter = 0;
		// check if some conditions equals emitted parameters
		if (this.areTriggerConditionsMet(triggerInfo.condition, triggerInfo.stringCondition, action)) {
			debug('Starting trigger: %O', triggerInfo.trigger);
			const triggerMedia = smilObject.triggers[triggerInfo.trigger];
			set(this.triggersEndless, `${triggerInfo.trigger}.play`, true);
			// while (this.triggersEndless[triggerInfo.trigger].play) {
			while (get(this.triggersEndless, `${triggerInfo.trigger}.play`, false)
				&& counter < 2) {
				await this.processPlaylist(triggerMedia);
				counter += 1;
			}
			// trigger finished playing by itself, cancel it
			debug('Cancelling trigger: %O', triggerInfo.trigger);
			const regionInfo = this.triggersEndless[triggerInfo.trigger].regionInfo;
			set(this.triggersEndless, `${triggerInfo.trigger}.play`, false);
			await this.cancelPreviousMedia(regionInfo);

			// remove info about trigger
			debug('Deleting trigger info: %O', triggerInfo.trigger);
			delete this.triggersEndless[triggerInfo.trigger];
			return;
		}
		// if no condition to activate trigger was found, stop it if its already running
		if (!isNil(this.triggersEndless[triggerInfo.trigger])) {
			debug('Cancelling trigger: %O', triggerInfo.trigger);
			const regionInfo = this.triggersEndless[triggerInfo.trigger].regionInfo;
			set(this.triggersEndless, `${triggerInfo.trigger}.play`, false);
			await this.cancelPreviousMedia(regionInfo);
			return;
		}

		debug('No corresponding condition: %O for trigger: ', triggerInfo.condition, triggerInfo.trigger);
	}

	private areTriggerConditionsMet(conditions: ParsedTriggerCondition[], logicCondition: string, action: string): boolean {
		switch (logicCondition) {
			case 'or':
				for (const condition of conditions) {
					if (condition.action === action) {
						return true;
					}
				}
				break;
			default:
				debug(`Logic condition not supported`);
		}
		return false;
	}

	private findFirstFreeRegion(regions: RegionAttributes[]): number {
		let index = 0;
		for (const region of regions) {
			// region is empty or media playing in it are not defined as trigger media
			if (get(this.currentlyPlaying[region.regionName], 'playing', false) === false ||
				get(this.currentlyPlaying[region.regionName], SMILTriggersEnum.triggerValue, false) === false) {
				set(this.currentlyPlaying, `${region.regionName}.playing`, true);
				return index;
			}
			index += 1;
		}
		return 0;
	}

	private isRegionOrNestedActive = async (regionInfo: RegionAttributes): Promise<boolean> => {
		if (get(this.currentlyPlaying[regionInfo.regionName], 'playing') === true
			&& get(this.currentlyPlaying[regionInfo.regionName], SMILTriggersEnum.triggerValue, 'default') !== 'default') {
			return true;
		}

		if (regionInfo.hasOwnProperty('region')) {
			for (const region of <RegionAttributes[]> regionInfo.region) {
				if (get(this.currentlyPlaying[region.regionName], 'playing') === true) {
					return true;
				}
			}
		}
		return false;
	}

	private setIntroUrl(introObject: object) {
		this.introObject = introObject;
	}

	private getCancelFunction(): boolean {
		return this.cancelFunction;
	}

	/**
	 * determines which function to use to cancel previous content
	 * @param regionInfo - information about region when current video belongs to
	 */
	private cancelPreviousMedia = async (regionInfo: RegionAttributes) => {
		switch (this.currentlyPlaying[regionInfo.regionName].media) {
			case 'video':
				await sleep(500);
				await this.cancelPreviousVideo(regionInfo);
				break;
			default:
				await sleep(200);
				this.cancelPreviousImage(regionInfo);
				break;
		}
	}

	/**
	 * sets element which played in current region before currently playing element invisible ( image, widget, video )
	 * @param regionInfo - information about region when current video belongs to
	 */
	private cancelPreviousImage = (regionInfo: RegionAttributes) => {
		debug('previous html element playing: %O', this.currentlyPlaying[regionInfo.regionName]);
		if (isNil(this.currentlyPlaying[regionInfo.regionName])) {
			debug('html element was already cancelled');
			return;
		}
		const element = <HTMLElement> document.getElementById((<SosHtmlElement> this.currentlyPlaying[regionInfo.regionName]).id);
		element.style.display = 'none';
		this.currentlyPlaying[regionInfo.regionName].player = 'stop';
		this.currentlyPlaying[regionInfo.regionName].playing = false;
	}

	/**
	 * updated currentlyPlaying object with new element
	 * @param element -  element which is currently playing in given region ( video or HtmlElement )
	 * @param tag - variable which specifies type of element ( video or HtmlElement )
	 * @param regionName -  name of the region of current media
	 */
	private setCurrentlyPlaying = (element: SMILVideo | SosHtmlElement, tag: string, regionName: string) => {
		this.currentlyPlaying[regionName] = <PlayingInfo> element;
		this.currentlyPlaying[regionName].media = tag;
		this.currentlyPlaying[regionName].playing = true;
	}

	/**
	 * removes video from DOM which played in current region before currently playing element ( image, widget or video )
	 * @param regionInfo - information about region when current video belongs to
	 */
	private cancelPreviousVideo = async (regionInfo: RegionAttributes) => {
		debug('previous video playing: %O', this.currentlyPlaying[regionInfo.regionName]);
		if (isNil(this.currentlyPlaying[regionInfo.regionName])) {
			debug('video was already cancelled');
			return;
		}

		this.currentlyPlaying[regionInfo.regionName].player = 'stop';

		const video = <SMILVideo> this.currentlyPlaying[regionInfo.regionName];
		let localRegionInfo = video.regionInfo;
		// cancelling trigger, have to find correct nested region
		if (localRegionInfo.regionName !== regionInfo.regionName) {
			localRegionInfo.region.forEach((nestedRegion: RegionAttributes) => {
				if (nestedRegion.regionName === regionInfo.regionName) {
					localRegionInfo = nestedRegion;
				}
			});
		}

		await this.sos.video.stop(
			video.localFilePath,
			localRegionInfo.left,
			localRegionInfo.top,
			localRegionInfo.width,
			localRegionInfo.height,
		);
		video.playing = false;
		debug('previous video stopped');
	}

	/**
	 * plays images, widgets and audio, creates htmlElement, appends to DOM and waits for specified duration before resolving function
	 * @param filepath - local folder structure where file is stored
	 * @param regionInfo - information about regio	n when current media belongs to
	 * @param duration - how long should media stay on screen
	 * @param triggerValue
	 */
	private playTimedMedia = async (
		filepath: string, regionInfo: RegionAttributes, duration: string, triggerValue: string | undefined, arrayIndex: number,
	): Promise<string | void> => {
		return new Promise(async (resolve) => {
			try {
				let element = <HTMLElement> document.getElementById(generateElementId(filepath, regionInfo.regionName));

				// set correct duration
				const parsedDuration: number = setElementDuration(duration);

				// add query parameter to invalidate cache on devices
				if (element.getAttribute('src') === null) {
					// BrightSign does not support query parameters in filesystem
					if (await this.doesSupportQueryParametersCompatibilityMode()) {
						element.setAttribute('src', `${filepath}?v=${getRandomInt(1000000)}`);
					} else {
						element.setAttribute('src', filepath);
					}
					element.style.display = 'block';
					if (checkSlowDevice(await this.sos.management.getModel())) {
						await sleep(500);
					}
				} else {
					element.style.display = 'block';
				}

				const sosHtmlElement: SosHtmlElement = {
					src: <string> element.getAttribute('src'),
					id: element.id,
					regionInfo,
					localFilePath:  filepath,
				};

				if (!isNil(triggerValue)) {
					sosHtmlElement.triggerValue = triggerValue;
				}

				const parentRegion = regionInfo;
				let localRegionInfo = await this.handleTriggers(sosHtmlElement, element);

				const response = await this.waitMediaOnScreen(localRegionInfo, parentRegion, parsedDuration, sosHtmlElement, arrayIndex);
				resolve(response);
			} catch (err) {
				debug('Unexpected error: %O during html element playback: %s', err, filepath);
				resolve();
			}
		});
	}

	/**
	 * pauses function execution for given duration time =  how long should media stay visible on the screen
	 * @param regionInfo - information about region when current media belongs to
	 * @param parentRegion
	 * @param duration - how long should media stay on screen
	 * @param element - displayed HTML element
	 */
	private waitMediaOnScreen = async (
		regionInfo: RegionAttributes, parentRegion: RegionAttributes, duration: number, element: SosHtmlElement, arrayIndex: number,
		): Promise<string | void> => {

		// set invisible previous element in region for gapless playback if it differs from current element
		if (!isNil(this.currentlyPlaying[regionInfo.regionName])
			&& !isNil(get(this.currentlyPlaying[regionInfo.regionName], 'src'))
			&& get(this.currentlyPlaying[regionInfo.regionName], 'src') !== element.src) {
			debug('cancelling media: %s from image: %s', this.currentlyPlaying[regionInfo.regionName].src, element.id);
			await this.cancelPreviousMedia(regionInfo);
		}

		// cancel if video is not same as previous one played in the parent region ( triggers case )
		if (get(this.currentlyPlaying[parentRegion.regionName], 'playing')
			&& (get(this.currentlyPlaying[parentRegion.regionName], 'src') !== element.src)) {
			debug('cancelling media from parent region: %s from image: %s', this.currentlyPlaying[regionInfo.regionName].src, element.id);
			await this.cancelPreviousMedia(parentRegion);
		}

		this.setCurrentlyPlaying(element, 'html', regionInfo.regionName);

		debug('waiting image duration: %s from element: %s', duration, element.id);
		// pause function for how long should media stay on display screen
		while (duration !== 0 && get(this.currentlyPlaying, `${regionInfo.regionName}`).player !== 'stop'
			&& !get(this.currentlyPlayingPriority, `${regionInfo.regionName}`)[arrayIndex].player.stop) {
			while (get(this.currentlyPlayingPriority, `${regionInfo.regionName}`)[arrayIndex].player.contentPause !== 0) {
				await sleep(1000);
				// if playlist is paused and new smil file version is detected, cancel pause behaviour and cancel playlist
				if (this.getCancelFunction()) {
					await this.cancelPreviousMedia(regionInfo);
					return 'cancelLoop';
				}
			}
			duration--;
			await sleep(1000);
		}
		debug('element playing finished: %O', element);

		if (get(this.currentlyPlaying, `${regionInfo.regionName}`).player === 'stop'
		|| get(this.currentlyPlayingPriority, `${regionInfo.regionName}`)[arrayIndex].player.stop) {
			return 'cancelLoop';
		}

		debug('element playing finished: %O', element);
		return 'finished';
	}

	/**
	 * Function to determine if device supports query parameters in filesystem. Its mechanism to invalidate cache used
	 * in updating smil media on the fly without restarting device. Only device which does not support this feature is brightsign
	 * but its needed there. Brightsign works fine without query parameters.
	 */
	// TODO: add this feature to SoS module itself
	private doesSupportQueryParametersCompatibilityMode = async (): Promise<boolean> => {
		return (await this.sos.management.app.getType() !== DeviceInfo.brightsign);
	}

	/**
	 * plays array of videos in sequential order
	 * @param videos - array of SMILVideo objects
	 */
	private playVideosSeq = async (videos: SMILVideo[]) => {
		const parentRegion = videos[0].regionInfo;
		let regionInfo = await this.handleTriggers(videos[0]);
		const index = this.currentlyPlayingPriority[regionInfo.regionName].findIndex((element) => {
			return element.player.playing;
		});
		for (let i = 0; i < videos.length; i += 1) {
			try {
				const previousVideo = videos[(i + videos.length - 1) % videos.length];
				const currentVideo = videos[i];
				const nextVideo = videos[(i + 1) % videos.length];

				debug(
					'Playing videos in loop, currentVideo: %O,' +
					' previousVideo: %O' +
					' nextVideo: %O',
					currentVideo,
					previousVideo,
					nextVideo,
				);
				// TODO: implement check to sos library
				if (currentVideo.localFilePath === '') {
					debug('Video: %O has empty localFilepath: %O', currentVideo);
					continue;
				}

				// prepare video only once ( was double prepare current and next video )
				if (i === 0) {
					debug('Preparing video current: %O', currentVideo);
					await this.sos.video.prepare(
						currentVideo.localFilePath,
						regionInfo.left,
						regionInfo.top,
						regionInfo.width,
						regionInfo.height,
						config.videoOptions,
					);
				}
				// cancel if there was image player before and only for first video playing
				if (get(this.currentlyPlaying[regionInfo.regionName], 'playing') && i === 0 ) {
					await this.cancelPreviousMedia(regionInfo);
				}

				// cancel if video is not same as previous one played in the parent region ( triggers case )
				if (get(this.currentlyPlaying[parentRegion.regionName], 'playing')
					&& (get(this.currentlyPlaying[parentRegion.regionName], 'src') !== currentVideo.src
					|| parentRegion.regionName !== regionInfo.regionName)
					&& !isNil(currentVideo.triggerValue)) {
					await this.cancelPreviousMedia(parentRegion);
				}

				this.setCurrentlyPlaying(currentVideo, 'video', regionInfo.regionName);

				debug('Playing video current: %O', currentVideo);
				await this.sos.video.play(
					currentVideo.localFilePath,
					regionInfo.left,
					regionInfo.top,
					regionInfo.width,
					regionInfo.height,
				);

				if (previousVideo.playing &&
					previousVideo.src !== currentVideo.src) {
					debug('Stopping video previous: %O', previousVideo);
					await this.sos.video.stop(
						previousVideo.localFilePath,
						regionInfo.left,
						regionInfo.top,
						regionInfo.width,
						regionInfo.height,
				);
					previousVideo.playing = false;
				}

				if (nextVideo.src !== currentVideo.src && nextVideo.localFilePath !== '') {
					debug('Preparing video next: %O', nextVideo);
					await this.sos.video.prepare(
						nextVideo.localFilePath,
						regionInfo.left,
						regionInfo.top,
						regionInfo.width,
						regionInfo.height,
						config.videoOptions,
						);
				}

				debug('Starting playing video onceEnded function: %O', currentVideo);

				const promiseRaceArray = [];
				promiseRaceArray.push(this.sos.video.onceEnded(
					currentVideo.localFilePath,
					regionInfo.left,
					regionInfo.top,
					regionInfo.width,
					regionInfo.height,
				));
				if (get(currentVideo, 'dur', SMILEnums.defaultVideoDuration) !== SMILEnums.defaultVideoDuration) {
					promiseRaceArray.push(sleep(currentVideo.dur! + SMILEnums.videoDurationOffset));
				}
				/*
					has to be inner try catch, because stoping video in middle of playback throws error
					in onceEnded function, if it would be caught by higher try..catch rest of function would
					not be processed
				    due to webos bug when onceEnded function never resolves, add videoDuration + 1000ms function to resolve
				    so playback can continue

				*/
				// TODO: fix in webos app
				try {
					await Promise.race(promiseRaceArray);
				} catch (err) {
					debug('Unexpected error: %O during multiple video playback onceEnded at video: %O', err, videos[i]);
				}

				debug('Finished playing video: %O', currentVideo);

				// stopped because of higher priority playlist will start to play
				if (this.currentlyPlaying[regionInfo.regionName].player === 'stop'
					|| this.currentlyPlayingPriority[regionInfo.regionName][index].player.stop) {
					debug('Stopping video: %O', currentVideo);
					await this.sos.video.stop(
						currentVideo.localFilePath,
						regionInfo.left,
						regionInfo.top,
						regionInfo.width,
						regionInfo.height,
					);
					currentVideo.playing = false;
					break;
				}

				while (this.currentlyPlayingPriority[regionInfo.regionName][index].player.contentPause !== 0) {
					currentVideo.playing = false;
					await sleep(1000);
					// if playlist is paused and new smil file version is detected, cancel pause behaviour and cancel playlist
					if (this.getCancelFunction()) {
						await this.cancelPreviousMedia(regionInfo);
						break;
					}
				}

				// force stop video only when reloading smil file due to new version of smil
				if (this.getCancelFunction()) {
					await this.cancelPreviousMedia(regionInfo);
				}
			} catch (err) {
				debug('Unexpected error: %O during multiple video playback at video: %O', err, videos[i]);
			}
		}
	}

	/**
	 * plays videos in parallel
	 * @param videos - array of SMILVideo objects
	 */
	private playVideosPar = async (videos: SMILVideo[]) => {
		const promises = [];
		for (let elem of videos) {
			promises.push((async () => {
				await this.playVideo(elem);
			})());
		}
		await Promise.all(promises);
	}

	private playAudio = async (filePath: string) => {
		debug('Playing audio: %s', filePath);
		return new Promise((resolve, reject) => {
			const audioElement = <HTMLAudioElement> new Audio(filePath);
			audioElement.onerror = reject;
			audioElement.onended = resolve;
			audioElement.play();
		});
	}

	private handleTriggers = async (media: SMILVideo | SosHtmlElement, element: HTMLElement | undefined = undefined) => {
		let regionInfo = media.regionInfo;
		while (await this.isRegionOrNestedActive(regionInfo) && !media.hasOwnProperty(SMILTriggersEnum.triggerValue)) {
			debug('Cant play video because its region is occupied by trigger. video: %O, region: %O', media, regionInfo);
			await sleep(150);
		}

		if (media.hasOwnProperty(SMILTriggersEnum.triggerValue) && regionInfo.hasOwnProperty('region')) {
			if (!Array.isArray(regionInfo.region)) {
				regionInfo.region = [regionInfo.region];
			}

			// if this trigger has already assigned region take it,
			// else find first free region in nested regions, if none is free, take first one
			regionInfo = !isNil(this.triggersEndless[<string> media.triggerValue].regionInfo) ?
				this.triggersEndless[<string> media.triggerValue].regionInfo : regionInfo.region[this.findFirstFreeRegion(regionInfo.region)];
			set(this.triggersEndless, `${media.triggerValue}.regionInfo`, regionInfo);

			debug('Found free region: %s for trigger: %O', regionInfo.regionName, media);

			// function is processing Html Element ( image, widget ) dynamically set coordinates
			if (!isNil(element)) {
				// new coordinates for new region
				element.style.width = `${regionInfo.width}px`;
				element.style.height = `${regionInfo.height}px`;
				element.style.top = `${regionInfo.top}px`;
				element.style.left = `${regionInfo.left}px`;
			}
		}

		return regionInfo;
	}

	/**
	 * plays one video
	 * @param video - SMILVideo object
	 */
	private playVideo = async (video: SMILVideo) => {
		try {
			debug('Playing video: %O', video);

			// TODO: implement check to sos library
			if (video.localFilePath === '') {
				debug('Video: %O has empty localFilepath: %O', video);
				return;
			}

			const parentRegion = video.regionInfo;
			let regionInfo = await this.handleTriggers(video);

			// find at which index is current playlist stored in currentlyPlayingPriority object
			const index = this.currentlyPlayingPriority[regionInfo.regionName].findIndex((element) => {
				return element.player.playing;
			});

			// prepare if video is not same as previous one played
			if (get(this.currentlyPlaying[regionInfo.regionName], 'src') !== video.src) {
					debug('Preparing video: %O', video);
					await this.sos.video.prepare(
						video.localFilePath,
						regionInfo.left,
						regionInfo.top,
						regionInfo.width,
						regionInfo.height,
						config.videoOptions,
					);
				}

			// cancel if video is not same as previous one played in the same region
			if (get(this.currentlyPlaying[regionInfo.regionName], 'playing')
				&& get(this.currentlyPlaying[regionInfo.regionName], 'src') !== video.src) {
				await this.cancelPreviousMedia(regionInfo);
			}

			// cancel if video is not same as previous one played in the parent region ( triggers case )
			if (get(this.currentlyPlaying[parentRegion.regionName], 'playing')
				&& get(this.currentlyPlaying[parentRegion.regionName], 'src') !== video.src) {
				await this.cancelPreviousMedia(parentRegion);
			}

			this.setCurrentlyPlaying(video, 'video', regionInfo.regionName);

			await this.sos.video.play(
				video.localFilePath,
				regionInfo.left,
				regionInfo.top,
				regionInfo.width,
				regionInfo.height,
			);

			debug('Starting playing video onceEnded function: %O', video);

			const promiseRaceArray = [];
			promiseRaceArray.push(this.sos.video.onceEnded(
				video.localFilePath,
				regionInfo.left,
				regionInfo.top,
				regionInfo.width,
				regionInfo.height,
			));

			// due to webos bug when onceEnded function never resolves, add videoDuration + 1000ms function to resolve
			// so playback can continue
			// TODO: fix in webos app
			if (get(video, 'dur', SMILEnums.defaultVideoDuration) !== SMILEnums.defaultVideoDuration) {
				promiseRaceArray.push(sleep(video.dur! + SMILEnums.videoDurationOffset));
			}

			try {
				await Promise.race(promiseRaceArray);
			} catch (err) {
				debug('Unexpected error: %O during single video playback onceEnded at video: %O', err, video);
			}

			debug('Playing video finished: %O', video);

			// stopped because of higher priority playlist will start to play
			if (this.currentlyPlayingPriority[regionInfo.regionName][index].player.stop) {
				await this.sos.video.stop(
					video.localFilePath,
					video.regionInfo.left,
					video.regionInfo.top,
					video.regionInfo.width,
					video.regionInfo.height,
				);
				video.playing = false;
			}

			while (this.currentlyPlayingPriority[regionInfo.regionName][index].player.contentPause !== 0) {
				video.playing = false;
				await sleep(1000);
				// if playlist is paused and new smil file version is detected, cancel pause behaviour and cancel playlist
				if (this.getCancelFunction()) {
					await this.cancelPreviousMedia(regionInfo);
					break;
				}
			}
			// no video.stop function so one video can be played gapless in infinite loop
			// stopping is handled by cancelPreviousMedia function
			// force stop video only when reloading smil file due to new version of smil
			if (this.getCancelFunction()) {
				await this.cancelPreviousMedia(regionInfo);
			}
		} catch (err) {
			debug('Unexpected error: %O occurred during single video playback: O%', err, video);
		}
	}

	private setupIntroVideo = async (video: SMILVideo, internalStorageUnit: IStorageUnit, region: RegionsObject) => {
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

	private setupIntroImage = async (image: SMILImage, internalStorageUnit: IStorageUnit, region: RegionsObject): Promise<HTMLElement> => {
		const currentImageDetails = <IFile> await this.files.getFileDetails(image, internalStorageUnit, FileStructure.images);
		image.regionInfo = getRegionInfo(region, image.region);
		image.localFilePath = currentImageDetails.localUri;
		debug('Setting-up intro image: %O', image);
		const element: HTMLElement = createHtmlElement(HtmlEnum.img, image.localFilePath, image.regionInfo);
		element.style.display = 'block';
		element.setAttribute('src', image.localFilePath);
		document.body.appendChild(element);
		debug('Intro image prepared: %O', element);
		return element;
	}

	private playIntroLoop = async (
		media: string, intro: SMILIntro, downloadPromises: Promise<Function[]>[],
		smilObject: SMILFileObject, internalStorageUnit: IStorageUnit, smilUrl: string,
	): Promise<void> => {
		return new Promise((resolve, reject) => {
			let playingIntro = true;
			parallel([
				async (callback) => {
					while (playingIntro) {
						debug('Playing intro');
						// set intro url in playlist to exclude it from further playing
						this.setIntroUrl(intro);

						switch (media) {
							case SMILEnums.img:
								await sleep(1000);
								break;
							default:
								await this.playIntroVideo(intro.video!);
						}
					}
					callback();
				},
				async (callback) => {
					Promise.all(downloadPromises).then(async () =>  {
						// prepares everything needed for processing playlist
						await this.manageFilesAndInfo(smilObject, internalStorageUnit, smilUrl);

						// all files are downloaded, stop intro
						debug('SMIL media files download finished, stopping intro ' + playingIntro);
						playingIntro = false;
						callback();
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

	private playIntroVideo = async (video: SMILVideo) => {
		debug('Playing intro video: %O', video);
		await this.sos.video.play(
			video.localFilePath,
			video.regionInfo.left,
			video.regionInfo.top,
			video.regionInfo.width,
			video.regionInfo.height,
		);
		debug('Playing intro video before onceEnded: %O', video);
		await this.sos.video.onceEnded(
			video.localFilePath,
			video.regionInfo.left,
			video.regionInfo.top,
			video.regionInfo.width,
			video.regionInfo.height,
		);
		debug('Playing intro video after onceEnded: %O', video);
	}

	private endIntroVideo = async (video: SMILVideo) => {
		debug('Ending intro video: %O', video);
		await this.sos.video.stop(
			video.localFilePath,
			video.regionInfo.left,
			video.regionInfo.top,
			video.regionInfo.width,
			video.regionInfo.height,
		);
	}

	/**
	 * iterate through array of images, widgets or audios
	 * @param value - object or array of object of type SMILAudio | SMILImage | SMILWidget
	 * @param parent - superordinate element of value
	 * @param htmlElement - which html element will be created in DOM
	 */
	private playOtherMedia = async (
		value: SMILMediaNoVideo,
		parent: string,
		htmlElement: string,
	) => {
		if (!Array.isArray(value)) {
			if (isNil(value.src) || !isUrl(value.src)) {
				debug('Invalid element values: %O', value);
				return;
			}
			value = [value];
		}

		const index = this.currentlyPlayingPriority[value[0].regionInfo.regionName].findIndex((element) => {
			return element.player.playing;
		});
		let response: string = '';

		if (parent.startsWith('seq')) {
			debug('Playing media sequentially: %O', value);
			for (const elem of value) {
				if (isUrl(elem.src)) {
					// widget with website url as datasource
					if (htmlElement === HtmlEnum.ref && getFileName(elem.src).indexOf('.wgt') === -1) {
						response = <string> await this.playTimedMedia(elem.src, elem.regionInfo, elem.dur, elem.triggerValue, index);
						if (response === 'cancelLoop') {
							break;
						}
						continue;
					}
					if (htmlElement === 'audio') {
						await this.playAudio(elem.localFilePath);
						continue;
					}
					response = <string> await this.playTimedMedia(elem.localFilePath, elem.regionInfo, elem.dur, elem.triggerValue, index);
					if (response === 'cancelLoop') {
						break;
					}
				}
			}
		}
		if (parent.startsWith('par')) {
			const promises = [];
			debug('Playing media in parallel: %O', value);
			for (const elem of value) {
				// widget with website url as datasource
				if (htmlElement === HtmlEnum.ref && getFileName(elem.src).indexOf('.wgt') === -1) {
					promises.push((async () => {
						await this.playTimedMedia(elem.src, elem.regionInfo, elem.dur, elem.triggerValue, index);
					})());
					continue;
				}
				promises.push((async () => {
					if (htmlElement === 'audio') {
						await this.playAudio(elem.localFilePath);
						return;
					}
					await this.playTimedMedia(elem.localFilePath, elem.regionInfo, elem.dur, elem.triggerValue, index);
				})());
			}
			await Promise.all(promises);
		}
	}

	/**
	 * call actual playing functions for given elements
	 * @param value - json object or array of json objects of type SMILAudio | SMILImage | SMILWidget | SMILVideo
	 * @param key - defines which media will be played ( video, audio, image or widget )
	 * @param parent - superordinate element of value
	 */
	private playElement = async (
		value: SMILMedia, key: string, parent: string,
	) => {
		// in case of array elements play it in sequential order or parent is empty ( trigger case )
		if (!isNaN(parseInt(parent)) || parent === '') {
			parent = 'seq';
		}
		debug('Playing element with key: %O, value: %O', key, value);
		switch (key) {
			case 'video':
				if (Array.isArray(value)) {
					if (parent.startsWith('seq')) {
						await this.playVideosSeq(<SMILVideo[]> value);
						break;
					}
					await this.playVideosPar(<SMILVideo[]> value);
					break;
				} else {
					await this.playVideo(<SMILVideo> value);
					break;
				}
			case 'ref':
				await this.playOtherMedia(<SMILWidget | SMILWidget[]> value, parent, HtmlEnum.ref);
				break;
			case SMILEnums.img:
				await this.playOtherMedia(<SMILImage | SMILImage[]> value, parent, HtmlEnum.img);
				break;
			// case 'audio':
			// 	await this.playOtherMedia(value, internalStorageUnit, parent, FileStructure.audios, 'audio');
			// 	break;
			default:
				debug(`Sorry, we are out of ${key}.`);
		}
	}

	/**
	 * Handles lifecycle of playlist in priority behaviour
	 * @param value - json object or array of json objects of type SMILAudio | SMILImage | SMILWidget | SMILVideo
	 * @param key - defines which media will be played ( video, audio, image or widget )
	 * @param parent - parent specifying parent object in xml with randomly generated sufix (par-98324)
	 * @param endTime - time when should playlist end in millis or as repeatCount ( less than 1000 )
	 * @param priorityObject - information about priority rules for given playlist
	 * @param isLast - if current playlist is last in playlist chain ( could me multiple image, video, widgets playlists )
	 */
	private priorityBehaviour = async (
		value: SMILMedia, key: string, parent: string = '0', endTime: number = 0,
		priorityObject: PriorityObject = <PriorityObject> {}, isLast: boolean = false,
		) =>  {
		let priorityRegionName;
		let regionInfo;

		if (Array.isArray(value)) {
			regionInfo = value[0].regionInfo;
		} else {
			regionInfo = value.regionInfo;
		}

		// invalid element
		if (isNil(regionInfo)) {
			debug('Invalid element with no regionInfo: %O', value);
			return;
		}

		priorityRegionName = regionInfo.regionName;

		let { currentIndex, previousPlayingIndex } = this.handlePriorityInfoObject(priorityRegionName, value, parent, endTime, priorityObject);
		debug('Got currentIndex and previousPlayingIndex: %s, %s for priorityRegionName: %s'
			,    currentIndex, previousPlayingIndex, priorityRegionName);

		if (this.currentlyPlayingPriority[priorityRegionName].length > 1
			&& currentIndex !== previousPlayingIndex) {
			debug('Detected priority conflict for playlist: %O', this.currentlyPlayingPriority[priorityRegionName][currentIndex]);
			await this.handlePriorityBeforePlay(priorityObject, priorityRegionName, currentIndex, previousPlayingIndex, parent, endTime);
		}

		this.currentlyPlayingPriority[priorityRegionName][currentIndex].player.playing = true;
		await this.playElement(value, key, parent);
		debug('Finished iteration of playlist: %O', this.currentlyPlayingPriority[priorityRegionName][currentIndex]);

		this.handlePriorityWhenDone(priorityRegionName, currentIndex, endTime, isLast);
	}

	/**
	 * Determines which priority rule to use
	 * @param priorityObject - information about priority rules for given playlist
	 * @param priorityRegionName - regionName in which playlist will be played
	 * @param currentIndex - at which index is playlist stored in currentlyPlayingPriority object
	 * @param previousPlayingIndex - at which index is previously playing playlist stored in currentlyPlayingPriority object
	 * @param parent - parent specifying parent object in xml with randomly generated sufix (par-98324)
	 * @param endTime - time when should playlist end in millis or as repeatCount ( less than 1000 )
	 * @param priorityRule - which priority rule will be used ( never, stop, pause or defer )
	 */
	private handlePriorityRules = async (
		priorityObject: PriorityObject, priorityRegionName: string, currentIndex: number, previousPlayingIndex: number,
		parent: string, endTime: number, priorityRule: string,
	): Promise<void> => {
		switch (priorityRule) {
			case 'never':
				await this.handleNeverBehaviour(priorityRegionName, currentIndex);
				break;
			case 'stop':
				this.handleStopBehaviour(priorityRegionName, previousPlayingIndex);
				break;
			case 'pause':
				this.handlePauseBehaviour(priorityRegionName, currentIndex, previousPlayingIndex);
				break;
			case 'defer':
				await this.handleDeferBehaviour(priorityObject, priorityRegionName, currentIndex, previousPlayingIndex, parent, endTime);
				break;
			default:
				debug('Specified priority rule: %s is not supported', priorityRule);
		}
	}

	/**
	 * Function checks if conditions are met for various priority cases
	 * @param priorityObject - information about priority rules for given playlist
	 * @param priorityRegionName - regionName in which playlist will be played
	 * @param currentIndex - at which index is playlist stored in currentlyPlayingPriority object
	 * @param previousPlayingIndex - at which index is previously playing playlist stored in currentlyPlayingPriority object
	 * @param parent - parent specifying parent object in xml with randomly generated sufix (par-98324)
	 * @param endTime - time when should playlist end in millis or as repeatCount ( less than 1000 )
	 */
	private handlePriorityBeforePlay = async (
			priorityObject: PriorityObject, priorityRegionName: string, currentIndex: number,
			previousPlayingIndex: number, parent: string, endTime: number,
		): Promise<void> => {
		// if attempted to play playlsit which was stopped by higher priority, wait till end of higher priority playlist and try again
		if (this.currentlyPlayingPriority[priorityRegionName][currentIndex].parent === parent
			&& this.currentlyPlayingPriority[priorityRegionName][currentIndex].behaviour === 'stop') {
			await this.handlePrecedingContentStop(priorityObject, priorityRegionName, currentIndex, previousPlayingIndex);
		}

		// playlist has higher priority than currently playing
		if (this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex].priority.priorityLevel
			< priorityObject.priorityLevel
			&& this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex].player.playing) {
			debug('Found conflict with lower priority playlist playlist, lower: %O, higher: %O'
				,    this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex]
				,    this.currentlyPlayingPriority[priorityRegionName][currentIndex]);

			await this.handlePriorityRules(priorityObject, priorityRegionName, currentIndex, previousPlayingIndex, parent, endTime
				,                             this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex].priority.higher);
		}

		// playlist has same ( peer ) priority than currently playing
		if (this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex].priority.priorityLevel === priorityObject.priorityLevel
			&& this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex].parent !== parent
			&& this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex].player.playing
			&& (Date.now() <= endTime || endTime <= 1000)) {
			debug('Found conflict with same priority playlists, old: %O, new: %O'
				,    this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex]
				,    this.currentlyPlayingPriority[priorityRegionName][currentIndex]);

			await this.handlePriorityRules(priorityObject, priorityRegionName, currentIndex, previousPlayingIndex, parent, endTime
				,                             this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex].priority.peer);
		}

		// playlist has lower priority than currently playing
		if (this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex].priority.priorityLevel
			> priorityObject.priorityLevel
			&& this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex].player.playing) {

			debug('Found conflict with higher priority playlist playlist, higher: %O, lower: %O'
				,    this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex]
				,    this.currentlyPlayingPriority[priorityRegionName][currentIndex]);

			await this.handlePriorityRules(priorityObject, priorityRegionName, currentIndex, previousPlayingIndex, parent, endTime
				,                             this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex].priority.lower);
		}
	}

	/**
	 * If preceding playlist in chain was stopped, this function stops also following playlist
	 * @param priorityObject - information about priority rules for given playlist
	 * @param priorityRegionName - regionName in which playlist will be played
	 * @param currentIndex - at which index is playlist stored in currentlyPlayingPriority object
	 * @param previousPlayingIndex - at which index is previously playing playlist stored in currentlyPlayingPriority object
	 */
	private handlePrecedingContentStop = async (
			priorityObject: PriorityObject, priorityRegionName: string, currentIndex: number, previousPlayingIndex: number,
		): Promise<void> => {
		debug('Previous iteration of this playlist was stopped, stopping this one as well: %O'
			,    this.currentlyPlayingPriority[priorityRegionName][currentIndex]);
		while (true) {
			while (this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex].player.playing) {
				await sleep(100);
			}

			// if playlist is paused and new smil file version is detected, cancel pause behaviour and cancel playlist
			if (this.getCancelFunction()) {
				return;
			}

			// during playlist pause was exceeded its endTime, dont play it and return from function
			if (this.currentlyPlayingPriority[priorityRegionName][currentIndex].player.endTime <= Date.now()) {
				debug('Playtime for playlist: %O was exceeded, exiting', this.currentlyPlayingPriority[priorityRegionName][currentIndex]);
				return;
			}

			// wait for new potentional playlist to appear
			await sleep((this.currentlyPlayingPriority[priorityRegionName].length - priorityObject.priorityLevel) * 100);
			this.currentlyPlayingPriority[priorityRegionName][currentIndex].behaviour = '';

			debug('Stop behaviour lock released for playlist: %O', this.currentlyPlayingPriority[priorityRegionName][currentIndex]);

			// regenerate
			let newPreviousIndex = this.currentlyPlayingPriority[priorityRegionName].findIndex((element) => {
				return element.player.playing;
			});

			debug('Found new active playlist index for stop behaviour, current: %s, new: %s', previousPlayingIndex, newPreviousIndex);

			// no playlist currently playing, this one can proceed to playback
			if (newPreviousIndex === -1) {
				newPreviousIndex = 0;
				previousPlayingIndex = newPreviousIndex;
				debug('Stop behaviour, no active playlist found');
				break;
			}
			previousPlayingIndex = newPreviousIndex;
			// break only if priority level is not same, because if it is, peer priority which comes later in
			// playlist is playing, and previous playlist cannot cancel it
			if (this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex].priority.priorityLevel
				!== priorityObject.priorityLevel) {
				break;
			}
			debug('New found playlist has same priority, wait for it to finish, setting stop behaviour for playlist: %O'
				,    this.currentlyPlayingPriority[priorityRegionName][currentIndex]);
		}
	}

	/**
	 * Function handles pause behaviour meaning current playlist is paused higher priority finishes
	 * @param priorityRegionName - regionName in which playlist will be played
	 * @param currentIndex - at which index is playlist stored in currentlyPlayingPriority object
	 * @param previousPlayingIndex - at which index is previously playing playlist stored in currentlyPlayingPriority object
	 */
	private handlePauseBehaviour = (priorityRegionName: string, currentIndex: number, previousPlayingIndex: number): void => {
		debug('Pausing playlist: %O', this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex]);
		this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex].player.contentPause = 9999999;
		this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex].player.playing = false;
		this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex].behaviour = 'pause';
		this.currentlyPlayingPriority[priorityRegionName][currentIndex].controlledPlaylist = previousPlayingIndex;
	}

	/**
	 * Function handles stop behaviour meaning current playlist is stopped higher priority finishes
	 * @param priorityRegionName - regionName in which playlist will be played
	 * @param previousPlayingIndex - at which index is previously playing playlist stored in currentlyPlayingPriority object
	 */
	private handleStopBehaviour = (priorityRegionName: string, previousPlayingIndex: number): void => {
		debug('Stopping playlist: %O', this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex]);
		this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex].player.stop = true;
		this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex].player.playing = false;
		this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex].behaviour = 'stop';
	}

	private handleNeverBehaviour = async(priorityRegionName: string, currentIndex: number) => {
		debug('Found never behaviour for playlist: %O skipping', this.currentlyPlayingPriority[priorityRegionName][currentIndex]);
		// avoid infinite loop
		await sleep(10000);
	}

	/**
	 * Function handles defer behaviour meaning current playlist is delayed until higher priority finishes
	 * @param priorityObject - information about priority rules for given playlist
	 * @param priorityRegionName - regionName in which playlist will be played
	 * @param currentIndex - at which index is playlist stored in currentlyPlayingPriority object
	 * @param previousPlayingIndex - at which index is previously playing playlist stored in currentlyPlayingPriority object
	 * @param parent - parent specifying parent object in xml with randomly generated sufix (par-98324)
	 * @param endTime - time when should playlist end in millis or as repeatCount ( less than 1000 )
	 */
	private handleDeferBehaviour = async (
			priorityObject: PriorityObject, priorityRegionName: string, currentIndex: number,
			previousPlayingIndex: number, parent: string, endTime: number,
		): Promise<void> => {
		debug('Handling defer behaviour for playlist: %O', this.currentlyPlayingPriority[priorityRegionName][currentIndex]);
		this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex].behaviour = 'defer';
		// set current defered content to not playing
		this.currentlyPlayingPriority[priorityRegionName][currentIndex].player.playing = false;

		while (true) {
			while (this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex].player.playing) {
				await sleep(100);
			}

			// if playlist is paused and new smil file version is detected, cancel pause behaviour and cancel playlist
			if (this.getCancelFunction()) {
				return;
			}

			// wait for new potentional playlist to appear
			await sleep((this.currentlyPlayingPriority[priorityRegionName].length - priorityObject.priorityLevel) * 100);

			debug('Defer behaviour lock released for playlist: %O', this.currentlyPlayingPriority[priorityRegionName][currentIndex]);

			// regenerate
			let newPreviousIndex = this.currentlyPlayingPriority[priorityRegionName].findIndex((element) => {
				return element.player.playing;
			});

			debug('Found new active playlist index for defer behaviour, current: %s, new: %s', previousPlayingIndex, newPreviousIndex);

			// no playlist currently playing, this one can proceed to playback
			if (newPreviousIndex === -1) {
				debug('Defer behaviour, no active playlist found');
				break;
			}

			if (this.currentlyPlayingPriority[priorityRegionName][newPreviousIndex].priority.priorityLevel > priorityObject.priorityLevel) {
				debug('New found playlist has higher priority, setting defer behaviour for playlist:  %O'
					,    this.currentlyPlayingPriority[priorityRegionName][currentIndex]);
				previousPlayingIndex = newPreviousIndex;
			} else {
				await this.handlePriorityBeforePlay(priorityObject, priorityRegionName, currentIndex, newPreviousIndex, parent, endTime);
				break;
			}
		}
	}

	/**
	 * Function set current playlist as finished based on endTime or repeatCount and releases all playlists which were dependent on it
	 * @param priorityRegionName - regionName in which playlist will be played
	 * @param currentIndex - at which index is playlist stored in currentlyPlayingPriority object
	 * @param endTime - time when should playlist end in millis or as repeatCount ( less than 1000 )
	 * @param isLast - if current playlist is last in playlist chain ( could me multiple image, video, widgets playlists )
	 */
	private handlePriorityWhenDone = (priorityRegionName: string, currentIndex: number, endTime: number, isLast: boolean): void => {
		debug('Checking if playlist is finished: %O for region: %s'
			,    this.currentlyPlayingPriority[priorityRegionName][currentIndex], priorityRegionName);
		/*
			condition which determines if this was last iteration of playlist
			rule 1: if endTime in millis is lower as current time and at the same time is higher than 1000
				- endTime is specified in date in milis
			rule 2: if timesPlayed is bigger than endTime
				- endTime is specified as repeatCount ( <= 1000 )
			rule 3: is last part of current playlist chain
			rule 4: smil file was updated force end of playlist
		 */
		if ((((this.currentlyPlayingPriority[priorityRegionName][currentIndex].player.endTime <= Date.now()
			&& this.currentlyPlayingPriority[priorityRegionName][currentIndex].player.endTime > 1000)
			|| this.currentlyPlayingPriority[priorityRegionName][currentIndex].player.timesPlayed >= endTime)
			&& isLast) || this.getCancelFunction()) {
			debug('Finished playing playlist: %O for region: %s'
				,    this.currentlyPlayingPriority[priorityRegionName][currentIndex], priorityRegionName);
			// some playlist was paused by this one, unpause it
			const pausedIndex = this.currentlyPlayingPriority[priorityRegionName][currentIndex].controlledPlaylist;
			if (!isNil(pausedIndex)) {
				debug('Unpaused priority dependant playlist: %O for region: %s'
					,    this.currentlyPlayingPriority[priorityRegionName][pausedIndex], priorityRegionName);
				this.currentlyPlayingPriority[priorityRegionName][pausedIndex].player.contentPause = 0;
			}
			this.currentlyPlayingPriority[priorityRegionName][currentIndex].player.playing = false;
		}
	}
	/**
	 * Functions handles elements in currentlyPlayingPriority object, pushes new ones or replaces older ones when parent is same
	 * also copies neccesary info from older playlists
	 * @param priorityRegionName - regionName in which playlist will be played
	 * @param value - actual playlist
	 * @param parent - parent specifying parent object in xml with randomly generated sufix (par-98324)
	 * @param endTime - time when should playlist end in millis or as repeatCount ( less than 1000 )
	 * @param priorityObject - information about priority rules for given playlist
	 */
	private handlePriorityInfoObject = (
			priorityRegionName: string, value: SMILMedia, parent: string, endTime: number, priorityObject: PriorityObject,
		): {
		currentIndex: number,
		previousPlayingIndex: number,
	} => {
		const infoObject = {
			media: value,
			player: {
				contentPause: 0,
				stop: false,
				endTime: endTime,
				playing: false,
				timesPlayed: 0,
			},
			parent: parent,
			priority: <PriorityObject> priorityObject,
			controlledPlaylist: null,
			behaviour: '',
			isFirstInPlaylist: <SMILMedia> {},
		};

		if (isNil(this.currentlyPlayingPriority[priorityRegionName])) {
			this.currentlyPlayingPriority[priorityRegionName] = [];
			// remember first media in the playlist chain
			infoObject.isFirstInPlaylist = infoObject.media;
			this.currentlyPlayingPriority[priorityRegionName].push(infoObject);
		}

		let previousPlayingIndex = this.currentlyPlayingPriority[priorityRegionName].findIndex((element) => {
			return element.player.playing;
		});
		previousPlayingIndex = previousPlayingIndex > -1 ? previousPlayingIndex : 0;

		let currentIndex = 0;

		let arrayIndex: number = 0;
		for (const elem of this.currentlyPlayingPriority[priorityRegionName]) {
			if (isEqual(elem.media, infoObject.media)) {
				// preserve behaviour of previous element from same parent
				infoObject.behaviour = elem.behaviour;
				infoObject.player.playing = elem.player.playing;
				infoObject.controlledPlaylist = <any> elem.controlledPlaylist;
				// same playlist is played again, increase count to track how many times it was already played
				infoObject.player.timesPlayed = elem.player.timesPlayed + 1;
				currentIndex = arrayIndex;
				break;
			}

			// same parent of playlist, update currently playing object
			if (elem.parent === infoObject.parent) {
				// preserve behaviour of previous element from same parent
				infoObject.behaviour = elem.behaviour;
				infoObject.player.playing = elem.player.playing;
				infoObject.controlledPlaylist = <any> elem.controlledPlaylist;
				infoObject.player.timesPlayed = elem.player.timesPlayed;
				// increase times played only if first media in chain is playing again
				if (isEqual(elem.isFirstInPlaylist, infoObject.media)) {
					infoObject.player.timesPlayed = elem.player.timesPlayed + 1;
				}
				// remember first in playlist
				infoObject.isFirstInPlaylist = elem.isFirstInPlaylist;
				this.currentlyPlayingPriority[priorityRegionName][arrayIndex] = infoObject;
				if (arrayIndex === 0) {
					currentIndex = arrayIndex;
					break;
				}
				currentIndex = arrayIndex;
				break;
			}
			// new element, new parent
			if (arrayIndex === this.currentlyPlayingPriority[priorityRegionName].length - 1) {
				infoObject.isFirstInPlaylist = infoObject.media;
				this.currentlyPlayingPriority[priorityRegionName].push(infoObject);
				currentIndex = this.currentlyPlayingPriority[priorityRegionName].length - 1;
			}
			arrayIndex += 1;
		}
		return { currentIndex, previousPlayingIndex };
	}
}
