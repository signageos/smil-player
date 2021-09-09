import isNil = require('lodash/isNil');
import isNaN = require('lodash/isNaN');
import isObject = require('lodash/isObject');
import cloneDeep = require('lodash/cloneDeep');
import moment from 'moment';
import get = require('lodash/get');
import set = require('lodash/set');
import { isEqual } from 'lodash';
import FrontApplet from '@signageos/front-applet/es6/FrontApplet/FrontApplet';
import Nexmosphere from '@signageos/front-applet-extension-nexmosphere/es6';

import { defaults as config } from '../../../config/parameters';
import { IFile, IStorageUnit, IVideoFile } from '@signageos/front-applet/es6/FrontApplet/FileSystem/types';
import { getFileName, createVersionedUrl, copyQueryParameters } from '../files/tools';
import { Files } from '../files/files';
import { RfidAntennaEvent } from '@signageos/front-applet/es6/Sensors/IRfidAntenna';
import { SMILEnums } from '../../enums/generalEnums';
import { XmlTags } from '../../enums/xmlEnums';
import { HtmlEnum } from '../../enums/htmlEnums';
import { ExprTag } from '../../enums/conditionalEnums';
import { SMILTriggersEnum } from '../../enums/triggerEnums';
import { FileStructure } from '../../enums/fileEnums';
import { SMILScheduleEnum } from '../../enums/scheduleEnums';
import { ParsedSensor, ParsedTriggerCondition, TriggerList, TriggerObject } from '../../models/triggerModels';
import { SMILFile, SMILFileObject } from '../../models/filesModels';
import { RegionAttributes, RegionsObject, TransitionAttributes } from '../../models/xmlJsonModels';
import { CurrentlyPlaying, CurrentlyPlayingPriority, PlayingInfo, PlaylistElement } from '../../models/playlistModels';
import { PriorityObject } from '../../models/priorityModels';
import {
	SMILImage,
	SMILIntro,
	SMILMedia,
	SMILMediaNoVideo,
	SMILVideo,
	SMILWidget,
	SosHtmlElement,
} from '../../models/mediaModels';
import { isConditionalExpExpired } from './tools/conditionalTools';
import {
	debug,
	extractAdditionalInfo,
	generateParentId,
	getIndexOfPlayingMedia,
	getLastArrayItem, getRegionInfo,
	removeDigits,
	sleep,
} from './tools/generalTools';
import { parseSmilSchedule } from './tools/wallclockTools';
import {
	createDomElement,
	createHtmlElement,
	removeTransitionCss,
	setTransitionCss,
	addEventOnTriggerWidget,
} from './tools/htmlTools';
import { findDuration, setDefaultAwait, setElementDuration } from './tools/scheduleTools';
import { createPriorityObject } from './tools/priorityTools';
import { main } from "../../index";

export class Playlist {
	private checkFilesLoop: boolean = true;
	private cancelFunction: boolean[] = [];
	private playingIntro: boolean = false;
	private readonly playerName: string;
	private readonly playerId: string;
	private files: Files;
	private sos: FrontApplet;
	// hold reference to all currently playing content in each region
	private currentlyPlaying: CurrentlyPlaying = {};
	private videoPreparing: any = {};
	private promiseAwaiting: any = {};
	private currentlyPlayingPriority: CurrentlyPlayingPriority = {};
	private triggersEndless: any = {};
	private playlistVersion: number = -1;
	private previousPlaylistVersion: number = -1;

	constructor(sos: FrontApplet, files: Files) {
		this.sos = sos;
		this.files = files;
		// TODO: will be handled differently in the future when we have units tests for sos sdk
		this.playerName = get(sos, 'config.playerName', '');
		this.playerId = get(sos, 'config.playerId', '');
	}

	public setCheckFilesLoop(checkFilesLoop: boolean) {
		this.checkFilesLoop = checkFilesLoop;
	}

	public getCheckFilesLoop() {
		return this.checkFilesLoop;
	}

	public setPlaylistVersion() {
		this.playlistVersion += 1;
	}

	public getPlaylistVersion() {
		return this.playlistVersion;
	}

	public setCancelFunction(value: boolean, index: number) {
		this.cancelFunction[index] = value;
	}

	// disables endless loop for media playing
	public disableLoop(value: boolean) {
		this.cancelFunction.push(value);
	}

	public stopAllContent = async() => {
		for (let [, region] of Object.entries(this.currentlyPlaying)) {
			if ('regionInfo' in region && region.regionInfo.regionName !== SMILEnums.defaultRegion) {
				await this.cancelPreviousMedia(region.regionInfo, false);
			}
		}
	}

	/**
	 * runs function given as parameter in endless loop
	 * @param fn - Function
	 * @param version - smil internal version of current playlist
	 */
	public runEndlessLoop = async (fn: Function, version: number = 0) => {
		while (!this.cancelFunction[version]) {
			try {
				await fn();
			} catch (err) {
				debug('Error: %O occurred during processing function %s', err, fn.name);
				throw err;
			}
		}
	}

	/**
	 * Performs all necessary actions needed to process playlist ( delete unused files, extract widgets, extract regionInfo for each media )
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
		let media: string = '';
		let fileStructure: string = '';
		let downloadPromises: Promise<Function[]>[] = [];
		let imageElement: HTMLElement = document.createElement(HtmlEnum.img);

		for (const property in smilObject.intro[0]) {
			if (property.startsWith(HtmlEnum.video)) {
				media = property;
				fileStructure = FileStructure.videos;
			}

			if (property.startsWith(HtmlEnum.img)) {
				media = property;
				fileStructure = FileStructure.images;
			}
		}

		downloadPromises = downloadPromises.concat(
			await this.files.parallelDownloadAllFiles(internalStorageUnit, [<SMILVideo | SMILImage> smilObject.intro[0][media]], fileStructure),
		);

		await Promise.all(downloadPromises);

		const intro: SMILIntro = smilObject.intro[0];

		debug('Intro media object: %O', intro);
		switch (removeDigits(media)) {
			case HtmlEnum.img:
				if (imageElement.getAttribute('src') === null) {
					imageElement = await this.setupIntroImage(<SMILImage> get(intro, `${media}`), internalStorageUnit, smilObject, media);
					this.setCurrentlyPlaying(<SMILImage> get(intro, `${media}`), 'html', SMILEnums.defaultRegion);
				}
				break;
			default:
				await this.setupIntroVideo(<SMILVideo> get(intro, `${media}`), internalStorageUnit, smilObject);
				this.setCurrentlyPlaying(<SMILVideo> get(intro, `${media}`), 'video', SMILEnums.defaultRegion);
		}

		debug('Intro media downloaded: %O', intro);

		downloadPromises = await this.files.prepareDownloadMediaSetup(internalStorageUnit, smilObject);

		await this.playIntroLoop(media, intro, downloadPromises, smilObject, internalStorageUnit, smilUrl);

		debug('Playing intro finished: %O', intro);
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
		const promises = [];
		this.previousPlaylistVersion = this.playlistVersion;
		this.setPlaylistVersion();
		const version = this.playlistVersion;

		promises.push((async () => {
			// used during playlist update, give enough time to start playing first content from new playlist and then start file check again
			if (!this.checkFilesLoop) {
				await sleep(SMILScheduleEnum.fileCheckDelay);
			}
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
						this.setCheckFilesLoop(false);
						break;
					}
				}
			}
			// no await
			main(internalStorageUnit, smilFile.src, this.sos, false);
		})());

		promises.push((async () => {
			// endless processing of smil playlist
			await this.runEndlessLoop(async () => {
				try {
					await this.processPlaylist(smilObject.playlist, version);
					debug('One smil playlist iteration finished ' + version);
					debug('One smil playlist iteration finished ' + JSON.stringify(this.cancelFunction));
				} catch (err) {
					debug('Unexpected error during playlist processing: %O', err);
					await sleep(SMILScheduleEnum.defaultAwait);
				}
			},                        version);
		})());

		promises.push((async () => {
			// triggers processing
			await this.watchTriggers(smilObject);
		})());

		await Promise.all(promises);
	}

	/**
	 * recursively traverses through playlist and gets additional info for all media  specified in smil file
	 * @param playlist - smil file playlist, set of rules which media should be played and when
	 * @param region - regions object with information about all regions
	 * @param internalStorageUnit - persistent storage unit
	 * @param isTrigger - boolean value determining if function is processing trigger playlist or ordinary playlist
	 * @param triggerName - name of the trigger element
	 */
		// TODO: fix naming
	public getAllInfo = async (
		playlist: PlaylistElement | PlaylistElement[] | TriggerList, region: SMILFileObject, internalStorageUnit: IStorageUnit,
		isTrigger: boolean = false, triggerName: string = '',
	): Promise<void> => {
		let widgetRootFile: string = '';
		let fileStructure: string = '';
		let htmlElement: string = '';
		for (let [key, loopValue] of Object.entries(playlist)) {
			triggerName = (key === 'begin' && loopValue.startsWith(SMILTriggersEnum.triggerFormat)) ? loopValue : triggerName;
			// skip processing string values like "repeatCount": "indefinite"
			if (!isObject(loopValue)) {
				continue;
			}

			let value: PlaylistElement | PlaylistElement[] = loopValue;
			if (XmlTags.extractedElements.includes(removeDigits(key))) {
				debug('found %s element, getting all info', key);
				if (!Array.isArray(value)) {
					value = [value];
				}

				switch (removeDigits(key)) {
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
					const mediaFile = <IVideoFile> await this.sos.fileSystem.getFile({
						storageUnit: internalStorageUnit,
						filePath: `${fileStructure}/${getFileName(elem.src)}${widgetRootFile}`,
					});
					// in case of web page as widget, leave localFilePath blank
					elem.localFilePath = mediaFile ? mediaFile.localUri : '';

					// check if video has duration defined due to webos bug
					if (key.startsWith('video') && mediaFile) {
						elem.fullVideoDuration = mediaFile.videoDurationMs ? mediaFile.videoDurationMs : SMILEnums.defaultVideoDuration;
					}
					elem.regionInfo = getRegionInfo(region, elem.region);
					extractAdditionalInfo(elem);

					if (key.startsWith(SMILEnums.img) && elem.hasOwnProperty(SMILEnums.transitionType)) {
						if (!isNil(get(region.transition, elem.transIn, undefined))) {
							elem.transitionInfo = <TransitionAttributes> get(region.transition, elem.transIn, undefined);
						} else {
							debug(`No corresponding transition found for element: %O, with transitionType: %s`, elem, elem.transIn);
						}
					}

					// element will be played only on trigger emit in nested region
					if (isTrigger && triggerName !== '') {
						elem.triggerValue = triggerName;
					}

					// create placeholders in DOM for images and widgets to speedup playlist processing
					if (key.startsWith(SMILEnums.img) || key.startsWith('ref')) {
						elem.id = createDomElement(elem, htmlElement, key, isTrigger);
					}
				}
				// reset widget exprension for next elements
				widgetRootFile = '';
			} else {
				await this.getAllInfo(value, region, internalStorageUnit, isTrigger, triggerName);
			}
		}
	}

	/**
	 * excl and priorityClass are not supported in this version, they are processed as seq tags
	 * @param value - JSON object or array of objects
	 * @param version - smil internal version of current playlist
	 * @param parent - superordinate element of value
	 * @param endTime - date in millis when value stops playing
	 */
	public processPriorityTag = async (
		value: PlaylistElement | PlaylistElement[], version: number, parent: string = '', endTime: number = 0,
	): Promise<Promise<void>[]> => {
		const promises: Promise<void>[] = [];
		if (!Array.isArray(value)) {
			value = [value];
		}
		let arrayIndex = value.length - 1;
		for (let elem of value) {
			// wallclock has higher priority than conditional expression
			if (isConditionalExpExpired(elem, this.playerName, this.playerId)) {
				debug('Conditional expression: %s, for value: %O is false', elem[ExprTag]!, elem);
				if (arrayIndex === 0 && setDefaultAwait(value, this.playerName, this.playerId)
					=== SMILScheduleEnum.defaultAwait) {
					debug('No active sequence find in conditional expression schedule, setting default await: %s', SMILScheduleEnum.defaultAwait);
					await sleep(SMILScheduleEnum.defaultAwait);
				}
				arrayIndex -= 1;
				continue;
			}

			const priorityObject = createPriorityObject(elem, arrayIndex);
			promises.push((async () => {
				await this.processPlaylist(elem, version, parent, endTime, priorityObject);
			})());
			arrayIndex -= 1;
		}

		return promises;
	}

	/**
	 * recursive function which goes through the playlist and process supported tags
	 * is responsible for calling functions which handles actual playing of elements
	 * @param playlist - JSON representation of SMIL parsed playlist
	 * @param version - smil internal version of current playlist
	 * @param parent - superordinate element of value
	 * @param endTime - date in millis when value stops playing
	 * @param priorityObject - contains data about priority behaviour for given playlist
	 */
	public processPlaylist = async (
		playlist: PlaylistElement | PlaylistElement[], version: number, parent: string = '',
		endTime: number = 0, priorityObject: PriorityObject =  <PriorityObject> {},
	) => {
		for (let [key, loopValue] of Object.entries(playlist)) {
			// skips processing attributes of elements like repeatCount or wallclock
			if (!isObject(loopValue)) {
				debug('Skipping playlist element with key: %O is not object. value: %O', key, loopValue);
				continue;
			}
			let value: PlaylistElement | PlaylistElement[] = loopValue;
			debug('Processing playlist element with key: %O, value: %O', key, value);
			// dont play intro in the actual playlist
			if (XmlTags.extractedElements.includes(removeDigits(key))) {
				const lastPlaylistElem: string = getLastArrayItem(Object.entries(playlist))[0];
				const isLast = lastPlaylistElem === key;
				await this.priorityBehaviour(<SMILMedia> value, version, key, parent, endTime, priorityObject, isLast);
				continue;
			}

			let promises: Promise<void>[] = [];

			if (key === 'excl') {
				promises = await this.processPriorityTag(value, version, 'seq', endTime);
			}

			if (key === 'priorityClass') {
				promises = await this.processPriorityTag(value, version, 'seq', endTime);
			}

			if (key === 'par') {
				let newParent = generateParentId(key, value);
				if (Array.isArray(value)) {
					value.forEach((elem) => {
						const controlTag = key === 'seq' ? key : 'par';
						const wrapper = {
							[controlTag]: elem,
						};
						promises.push(this.createDefaultPromise(wrapper, version, priorityObject, newParent, endTime));
					});
					await Promise.all(promises);
					continue;
				}

				if (value.hasOwnProperty('begin') && value.begin!.indexOf('wallclock') > -1) {
					const { timeToStart, timeToEnd } = parseSmilSchedule(value.begin!, value.end);
					if (timeToEnd === SMILScheduleEnum.neverPlay || timeToEnd < Date.now()) {
						if (setDefaultAwait(<PlaylistElement[]> value, this.playerName, this.playerId) === SMILScheduleEnum.defaultAwait)  {
							debug('No active sequence find in wallclock schedule, setting default await: %s', SMILScheduleEnum.defaultAwait);
							await sleep(SMILScheduleEnum.defaultAwait);
						}
						continue;
					}

					// wallclock has higher priority than conditional expression
					if (await this.checkConditionalDefaultAwait(value)) {
						continue;
					}

					if (value.hasOwnProperty('repeatCount') && value.repeatCount !== 'indefinite') {
						promises.push(this.createRepeatCountDefinitePromise(value, priorityObject,  version, 'par', timeToStart));
						await Promise.all(promises);
						continue;
					}
					promises.push(this.createDefaultPromise(value, version, priorityObject, newParent, timeToEnd, timeToStart));
					await Promise.all(promises);
					continue;
				}
				// wallclock has higher priority than conditional expression
				if (await this.checkConditionalDefaultAwait(value)) {
					continue;
				}

				if (value.repeatCount === 'indefinite') {
					promises.push(this.createRepeatCountIndefinitePromise(value, priorityObject, version, parent, endTime, key));
					await Promise.all(promises);
					continue;
				}

				if (value.hasOwnProperty('repeatCount') && value.repeatCount !== 'indefinite') {
					promises.push(this.createRepeatCountDefinitePromise(value, priorityObject, version, key));
					await Promise.all(promises);
					continue;
				}
				promises.push(this.createDefaultPromise(value, version, priorityObject, newParent, endTime));
			}

			if (key === 'seq') {
				let newParent = generateParentId('seq', value);
				if (!Array.isArray(value)) {
					value = [value];
				}
				let arrayIndex = 0;
				for (const valueElement of value) {
					if (valueElement.hasOwnProperty('begin') && valueElement.begin.indexOf('wallclock') > -1) {
						const { timeToStart, timeToEnd } = parseSmilSchedule(valueElement.begin, valueElement.end);
						// if no playable element was found in array, set defaultAwait for last element to avoid infinite loop
						if (arrayIndex === value.length - 1 && setDefaultAwait(value, this.playerName, this.playerId) === SMILScheduleEnum.defaultAwait) {
							debug('No active sequence find in wallclock schedule, setting default await: %s', SMILScheduleEnum.defaultAwait);
							await sleep(SMILScheduleEnum.defaultAwait);
						}

						if (timeToEnd === SMILScheduleEnum.neverPlay || timeToEnd < Date.now()) {
							arrayIndex += 1;
							continue;
						}

						// wallclock has higher priority than conditional expression
						if (await this.checkConditionalDefaultAwait(valueElement, arrayIndex, value.length)) {
							arrayIndex += 1;
							continue;
						}

						if (valueElement.hasOwnProperty('repeatCount') && valueElement.repeatCount !== 'indefinite') {
							if (timeToStart <= 0) {
								promises.push(this.createRepeatCountDefinitePromise(valueElement, priorityObject, version, 'seq', timeToStart));
							}
							if (!parent.startsWith('par')) {
								await Promise.all(promises);
							}
							arrayIndex += 1;
							continue;
						}
						// play at least one from array to avoid infinite loop
						if (value.length === 1 || timeToStart <= 0) {
							promises.push(this.createDefaultPromise(valueElement, version, priorityObject, newParent, timeToEnd, timeToStart));
						}
						if (!parent.startsWith('par')) {
							await Promise.all(promises);
						}
						arrayIndex += 1;
						continue;
					}

					// wallclock has higher priority than conditional expression
					if (await this.checkConditionalDefaultAwait(valueElement, arrayIndex, value.length)) {
						arrayIndex += 1;
						continue;
					}

					if (valueElement.hasOwnProperty('repeatCount') && valueElement.repeatCount !== 'indefinite') {
						promises.push(this.createRepeatCountDefinitePromise(valueElement, priorityObject, version, 'seq'));
						if (!parent.startsWith('par')) {
							await Promise.all(promises);
						}
						continue;
					}

					if (valueElement.repeatCount === 'indefinite') {
						promises.push(this.createRepeatCountIndefinitePromise(valueElement, priorityObject, version, parent, endTime, key));

						if (!parent.startsWith('par')) {
							await Promise.all(promises);
						}
						continue;
					}

					promises.push(this.createDefaultPromise(valueElement, version, priorityObject, newParent, endTime));
					if (!parent.startsWith('par')) {
						await Promise.all(promises);
					}
				}
			}

			await Promise.all(promises);
		}
	}

	public watchTriggers = async(smilObject: SMILFileObject) => {
		this.watchKeyboardInput(smilObject);
		this.watchOnTouchOnClick(smilObject);
		await this.watchRfidAntena(smilObject);
	}

	private watchRfidAntena = async (smilObject: SMILFileObject) => {
		let serialPort;
		try {
			serialPort = await this.sos.hardware.openSerialPort({
				device: (this.sos.config.serialPortDevice ?? <string> SMILTriggersEnum.nexmoDevice),
				baudRate: <number> SMILTriggersEnum.nexmoBaudRate,
			});
		} catch (err) {
			debug('Error occurred during Nexmosphere trigger initialization: %O', err);
			await this.files.sendGeneralErrorReport(err.message);
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
						await this.files.sendGeneralErrorReport(err.message);
					}
				});
				sensorArray[sensorArray.length - 1].on(RfidAntennaEvent.PLACED, async (tag: number) => {
					try {
						await this.processRfidAntenna(smilObject, sensor, tag, RfidAntennaEvent.PLACED);
					} catch (err) {
						debug('Unexpected error occurred at sensor: %O with tag: %s', sensor, tag);
						await this.files.sendGeneralErrorReport(err.message);
					}
				});
			}
		}
	}

	private watchOnTouchOnClick = (smilObject: SMILFileObject) => {
		window.parent.document.addEventListener(SMILTriggersEnum.mouseEventType, async () => {
			await this.processOnTouchOnClick(smilObject);
		});

		document.addEventListener(SMILTriggersEnum.mouseEventType, async () => {
			await this.processOnTouchOnClick(smilObject);
		});

		window.parent.document.addEventListener(SMILTriggersEnum.touchEventType, async () => {
			await this.processOnTouchOnClick(smilObject);
		});

		document.addEventListener(SMILTriggersEnum.touchEventType, async () => {
			await this.processOnTouchOnClick(smilObject);
		});
	}

	private processOnTouchOnClick = async (smilObject: SMILFileObject) => {
		const triggerInfo = smilObject.triggerSensorInfo[`${SMILTriggersEnum.mousePrefix}`];

		// smil file does not support mouse/touch events
		if (isNil(triggerInfo)) {
			return;
		}

		set(this.triggersEndless, `${triggerInfo.trigger}.latestEventFired`, Date.now());

		if (get(this.triggersEndless, `${triggerInfo.trigger}.play`, false)) {
			return;
		}

		const triggerMedia = smilObject.triggers[triggerInfo.trigger];

		if (!isNil(smilObject.triggerSensorInfo[`${SMILTriggersEnum.mousePrefix}`])
			&& !get(this.triggersEndless, `${triggerInfo.trigger}.play`, false)
		&& !isNil(triggerMedia)) {
			debug('Starting trigger: %O', triggerInfo.trigger);
			addEventOnTriggerWidget(triggerMedia, this.triggersEndless, triggerInfo);
			const stringDuration = findDuration(triggerMedia);
			if (!isNil(stringDuration)) {
				await this.processTriggerDuration(triggerInfo, triggerMedia, stringDuration);
				return;
			}

			await this.processTriggerRepeatCount(triggerInfo, triggerMedia);
		}
	}

	private watchKeyboardInput = (smilObject: SMILFileObject) => {
		let state = {
			buffer: [],
			lastKeyTime: Date.now(),
		};

		window.parent.document.addEventListener(SMILTriggersEnum.keyboardEventType, async (event) => {
			state = await this.processKeyDownEvent(event, smilObject, state);
		});

		document.addEventListener(SMILTriggersEnum.keyboardEventType, async (event) => {
			state = await this.processKeyDownEvent(event, smilObject, state);
		});
	}

	private processKeyDownEvent = async (event: KeyboardEvent, smilObject: SMILFileObject, state: any): Promise<any> => {
		const key = event.key.toLowerCase();
		const currentTime = Date.now();
		let buffer: any = [];

		if (currentTime - state.lastKeyTime > SMILTriggersEnum.keyStrokeDelay) {
			buffer = [key];
		} else {
			buffer = [...state.buffer, key];
		}
		let bufferString = buffer.join('');

		for (let [triggerId, ] of Object.entries(smilObject.triggerSensorInfo)) {
			const trimmedTriggerId = triggerId.replace(`${SMILTriggersEnum.keyboardPrefix}-`, '');
			if (bufferString.startsWith(trimmedTriggerId)) {
				bufferString = trimmedTriggerId;
			}
		}

		const triggerInfo = smilObject.triggerSensorInfo[`${SMILTriggersEnum.keyboardPrefix}-${bufferString}`];

		if (!isNil(smilObject.triggerSensorInfo[`${SMILTriggersEnum.keyboardPrefix}-${bufferString}`])
			&& !get(this.triggersEndless, `${triggerInfo.trigger}.play`, false)) {
			debug('Starting trigger: %O', triggerInfo.trigger);
			const triggerMedia = smilObject.triggers[triggerInfo.trigger];
			const stringDuration = findDuration(triggerMedia);
			if (!isNil(stringDuration)) {
				await this.processTriggerDuration(triggerInfo, triggerMedia, stringDuration);
				return;
			}

			await this.processTriggerRepeatCount(triggerInfo, triggerMedia);
			buffer = [];
		}

		state = { buffer: buffer, lastKeyTime: currentTime};
		return state;
	}

	private processTriggerDuration = async (
		triggerInfo: { condition: ParsedTriggerCondition[], stringCondition: string, trigger: string },
		triggerMedia: TriggerObject, stringDuration: string,
	) => {
		const durationMillis = setElementDuration(stringDuration);
		set(this.triggersEndless, `${triggerInfo.trigger}.play`, true);
		let play = true;

		const promises = [];

		promises.push((async () => {
			while (play) {
				await this.processPlaylist(triggerMedia, SMILScheduleEnum.triggerPlaylistVersion);
			}
		})());

		promises.push((async () => {
			while (get(this.triggersEndless, `${triggerInfo.trigger}.latestEventFired`) + durationMillis > Date.now()) {
				await sleep(100);
			}
			play = false;
		})());

		await Promise.race(promises);

		// trigger finished playing by itself, cancel it
		debug('Cancelling trigger: %O', triggerInfo.trigger);
		const regionInfo = this.triggersEndless[triggerInfo.trigger].regionInfo;

		set(this.triggersEndless, `${triggerInfo.trigger}.play`, false);
		await this.cancelPreviousMedia(regionInfo);

	}

	private processTriggerRepeatCount = async (
		triggerInfo: { condition: ParsedTriggerCondition[], stringCondition: string, trigger: string },
		triggerMedia: TriggerObject,
		) => {
		set(this.triggersEndless, `${triggerInfo.trigger}.play`, true);
		await this.processPlaylist(triggerMedia, SMILScheduleEnum.triggerPlaylistVersion);
		await Promise.all(this.promiseAwaiting[this.triggersEndless[triggerInfo.trigger].regionInfo.regionName].promiseFunction!);

		// trigger finished playing by itself, cancel it
		debug('Cancelling trigger: %O', triggerInfo.trigger);
		const regionInfo = this.triggersEndless[triggerInfo.trigger].regionInfo;
		set(this.triggersEndless, `${triggerInfo.trigger}.play`, false);
		await this.cancelPreviousMedia(regionInfo);

	}

	private createDefaultPromise = (
		value: PlaylistElement, version: number, priorityObject: PriorityObject, parent: string, timeToEnd: number, timeToStart: number = -1,
		): Promise<void> => {
		return ((async () => {
			// if smil file was updated during the timeout wait, cancel that timeout and reload smil again
			if (timeToStart > 0 && await this.waitTimeoutOrFileUpdate(timeToStart)) {
				return;
			}
			await this.processPlaylist(value, version, parent, timeToEnd, priorityObject);
		})());
	}

	private createRepeatCountDefinitePromise = (
		value: PlaylistElement, priorityObject: PriorityObject, version: number, parent: string, timeToStart: number = -1,
		): Promise<void> => {
		const repeatCount: number = <number> value.repeatCount;
		let counter = 0;
		return ((async () => {
			let newParent = generateParentId(parent, value);
			// if smil file was updated during the timeout wait, cancel that timeout and reload smil again
			if (timeToStart > 0 && await this.waitTimeoutOrFileUpdate(timeToStart)) {
				return;
			}
			while (counter < repeatCount) {
				await this.processPlaylist(value, version, newParent, repeatCount, priorityObject);
				counter += 1;
			}
		})());
	}

	private createRepeatCountIndefinitePromise = (
		value: PlaylistElement, priorityObject: PriorityObject, version: number, parent: string, endTime: number, key: string,
		): Promise<void> => {
		return ((async () => {
			// when endTime is not set, play indefinitely
			if (endTime === 0) {
				let newParent = generateParentId(key, value);
				await this.runEndlessLoop(async () => {
					await this.processPlaylist(value, version, newParent, endTime, priorityObject);
				},                        version);
				// play N-times, is determined by higher level tag, because this one has repeatCount=indefinite
			} else if (endTime > 0 && endTime <= 1000) {
				let newParent = generateParentId(key, value);
				if (key.startsWith('seq')) {
					newParent = parent.replace('par', 'seq');
				}
				await this.processPlaylist(value, version, newParent, endTime, priorityObject);
			} else {
				let newParent = generateParentId(key, value);
				while (Date.now() <= endTime) {
					await this.processPlaylist(value, version, newParent, endTime, priorityObject);
					// force stop because new version of smil file was detected
					if (this.getCancelFunction()) {
						return;
					}
				}
			}
		})());
	}

	/**
	 * checks if conditional expression is true or false and if there is other element
	 * which can be played in playlist, if not sets default await time
	 * @param value - current element in playlist
	 * @param arrayIndex - index of element in media array ( only for seq tag )
	 * @param length - length of media array
	 */
	private checkConditionalDefaultAwait = async (value: PlaylistElement, arrayIndex: number = -1, length: number = -1): Promise<boolean> => {
		if (arrayIndex === -1) {
			if (isConditionalExpExpired(value, this.playerName, this.playerId)) {
				debug('Conditional expression : %s, for value: %O is false', value[ExprTag]!, value);
				if (setDefaultAwait(<PlaylistElement[]> value, this.playerName, this.playerId) === SMILScheduleEnum.defaultAwait)  {
					debug('No active sequence find in conditional expression schedule, setting default await: %s', SMILScheduleEnum.defaultAwait);
					await sleep(SMILScheduleEnum.defaultAwait);
				}
				return true;
			}
		} else {
			if (isConditionalExpExpired(value, this.playerName, this.playerId)) {
				debug('Conditional expression: %s, for value: %O is false', value[ExprTag]!, value);
				if (arrayIndex === length - 1
					&& setDefaultAwait(<PlaylistElement[]> value, this.playerName, this.playerId) === SMILScheduleEnum.defaultAwait) {
					debug('No active sequence find in conditional expression schedule, setting default await: %s', SMILScheduleEnum.defaultAwait);
					await sleep(SMILScheduleEnum.defaultAwait);
				}
				return true;
			}
		}
		return false;
	}

	private processRfidAntenna = async (smilObject: SMILFileObject, sensor: ParsedSensor, tag: number, action: string) => {
		debug('RfId tag: %s %s on antenna: %s', tag, action, sensor.id);
		const triggerInfo = smilObject.triggerSensorInfo[`${sensor.id}-${tag}`];
		// check if some conditions equals emitted parameters
		if (this.areTriggerConditionsMet(triggerInfo.condition, triggerInfo.stringCondition, action)) {
			const triggerMedia = smilObject.triggers[triggerInfo.trigger];
			await this.processTriggerRepeatCount(triggerInfo, triggerMedia);
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

	private getCancelFunction(): boolean {
		return this.cancelFunction[this.cancelFunction.length - 1];
	}

	private checkRegionsForCancellation = async (
		element: SMILVideo | SosHtmlElement, regionInfo: RegionAttributes, parentRegion: RegionAttributes, version: number,
		) => {

		// enable internal endless loops for playing media
		if (!this.getCheckFilesLoop() && version > this.previousPlaylistVersion && this.previousPlaylistVersion !== -1) {
			if (this.getPlaylistVersion() > -1) {
				this.setCancelFunction(true, this.getPlaylistVersion() - 1);
			}
			this.setCheckFilesLoop(true);
			await this.stopAllContent();
			return;
		}

		// cancel element played in default region
		if (get(this.currentlyPlaying[SMILEnums.defaultRegion], 'src') !== element.src
			&& get(this.currentlyPlaying[SMILEnums.defaultRegion], 'playing')) {
			debug('cancelling media: %s in default region from element: %s', this.currentlyPlaying[SMILEnums.defaultRegion].src, element.src);
			this.playingIntro = false;
			await this.cancelPreviousMedia(this.currentlyPlaying[SMILEnums.defaultRegion].regionInfo);
			return;
		}

		if (get(this.currentlyPlaying[regionInfo.regionName], 'src') !== element.src
			&& get(this.currentlyPlaying[regionInfo.regionName], 'playing')) {
			debug('cancelling media: %s from element: %s', this.currentlyPlaying[regionInfo.regionName].src, element.src);
			await this.cancelPreviousMedia(regionInfo);
			return;
		}

		// cancel if video is not same as previous one played in the parent region ( triggers case )
		if (parentRegion.regionName !== regionInfo.regionName
			&& get(this.currentlyPlaying[parentRegion.regionName], 'playing')) {
			debug('cancelling media from parent region: %s from element: %s', this.currentlyPlaying[regionInfo.regionName].src, element.src);
			await this.cancelPreviousMedia(parentRegion);
		}
	}

	/**
	 * determines which function to use to cancel previous content
	 * @param regionInfo - information about region when current video belongs to
	 * @param shouldWait - do not wait during playlist switch media cancellation
	 */
	private cancelPreviousMedia = async (regionInfo: RegionAttributes, shouldWait: boolean = true) => {
		debug('Cancelling media in region: %s with tag: %s', regionInfo.regionName, this.currentlyPlaying[regionInfo.regionName].media);
		if (shouldWait) {
			await sleep(200);
		}
		switch (this.currentlyPlaying[regionInfo.regionName].media) {
			case 'video':
				await this.cancelPreviousVideo(regionInfo);
				break;
			case 'html':
				await this.cancelPreviousImage(regionInfo);
				break;
			default:
				debug('Element not supported for cancellation');
				break;
		}
	}

	/**
	 * sets element which played in current region before currently playing element invisible ( image, widget, video )
	 * @param regionInfo - information about region when current video belongs to
	 */
	private cancelPreviousImage = async (regionInfo: RegionAttributes) => {
		try {
			debug('previous html element playing: %O', this.currentlyPlaying[regionInfo.regionName]);
			if (isNil(this.currentlyPlaying[regionInfo.regionName])) {
				debug('html element was already cancelled');
				return;
			}
			const element = <HTMLElement> document.getElementById((<SosHtmlElement> this.currentlyPlaying[regionInfo.regionName]).id);
			element.style.visibility = 'hidden';
			this.currentlyPlaying[regionInfo.regionName].player = 'stop';
			this.currentlyPlaying[regionInfo.regionName].playing = false;
		} catch (err) {
			await this.cancelPreviousVideo(regionInfo);
		}
	}

	/**
	 * updated currentlyPlaying object with new element
	 * @param element -  element which is currently playing in given region ( video or HtmlElement )
	 * @param tag - variable which specifies type of element ( video or HtmlElement )
	 * @param regionName -  name of the region of current media
	 */
	private setCurrentlyPlaying = (element: SMILVideo | SosHtmlElement, tag: string, regionName: string) => {
		debug('Setting currently playing: %O for region: %s with tag: %s', element, regionName, tag);
		const nextElement = cloneDeep(get(this.currentlyPlaying[regionName], 'nextElement'));
		this.currentlyPlaying[regionName] = <PlayingInfo> element;
		this.currentlyPlaying[regionName].media = tag;
		this.currentlyPlaying[regionName].playing = true;
		this.currentlyPlaying[regionName].nextElement = nextElement;
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
	 * @param value
	 * @param version - smil internal version of current playlist
	 * @param arrayIndex - at which index is playlist stored in currentlyPlayingPriority object
	 * @param priorityRegionName - name of currently playing region stored in currentlyPlayingPriority object
	 * @param currentIndex - current index in the currentlyPlayingPriority[priorityRegionName] array
	 * @param previousPlayingIndex - index of previously playing content in currentlyPlayingPriority[priorityRegionName] array
	 * @param endTime - when should playlist end, specified either in date in millis or how many times should playlist play
	 * @param isLast - if this media is last element in current playlist
	 */
	private playTimedMedia = async (
		value: SMILMediaNoVideo, version: number, arrayIndex: number,
		priorityRegionName: string, currentIndex: number, previousPlayingIndex: number, endTime: number, isLast: boolean,
	): Promise<void> => {
		const taskStartDate = moment().toDate();
		try {

			if (value.localFilePath === '') {
				debug('Html element: %O has empty localFilepath: %O', value);
				return;
			}

			let element = <HTMLElement> document.getElementById(<string> value.id);
			element.style.setProperty('z-index', `${parseInt(element.style.getPropertyValue('z-index')) + 1}`);

			// set correct duration
			const parsedDuration: number = setElementDuration(value.dur);

			debug(`%O`, value);
			// add query parameter to invalidate cache on devices
			if (element.getAttribute('src') === null) {
				let src = value.localFilePath;
				// BrightSign does not support query parameters in filesystem
				src = createVersionedUrl(src);
				// TODO this would not work & break BS. Solve it other way in future before merge
				src = copyQueryParameters(value.src, src);
				element.setAttribute('src', src);
			}

			const sosHtmlElement: SosHtmlElement = {
				src: <string> element.getAttribute('src'),
				id: element.id,
				regionInfo: value.regionInfo,
				localFilePath:  value.localFilePath,
			};

			if (!isNil(value.triggerValue)) {
				sosHtmlElement.triggerValue = value.triggerValue;
			}

			const parentRegion = value.regionInfo;
			let localRegionInfo = await this.handleTriggers(sosHtmlElement, element);

			if (!(await this.shouldWaitAndContinue(
				sosHtmlElement, localRegionInfo, priorityRegionName, arrayIndex, previousPlayingIndex, endTime, isLast, version,
			))) {
				return;
			}

			this.promiseAwaiting[localRegionInfo.regionName].promiseFunction! = [(async () => {
				let transitionDuration = 0;
				if (version < this.playlistVersion) {
					debug('not playing old version');
					this.handlePriorityWhenDone(priorityRegionName, currentIndex, endTime, isLast, version);
					return;
				}
				const hasTransition = value.hasOwnProperty('transitionInfo');
				if (hasTransition) {
					transitionDuration = setElementDuration(get(value, 'transitionInfo.dur'));
				}
				element.style.setProperty('z-index', `${parseInt(element.style.getPropertyValue('z-index')) + 1}`);
				element.style.visibility = 'visible';
				await this.waitMediaOnScreen(
					localRegionInfo, parentRegion, parsedDuration, sosHtmlElement, arrayIndex, element, transitionDuration, taskStartDate, version,
				);
				debug('Finished iteration of playlist: %O', this.currentlyPlayingPriority[priorityRegionName][currentIndex]);
				this.handlePriorityWhenDone(priorityRegionName, currentIndex, endTime, isLast, version);

				if (hasTransition) {
					removeTransitionCss(element);
				}

				element.style.setProperty('z-index', `${parseInt(element.style.getPropertyValue('z-index')) - 2}`);
			})()];
		} catch (err) {
			debug('Unexpected error: %O during html element playback: %s', err, value.localFilePath);
			await this.files.sendMediaReport(value, taskStartDate, value.localFilePath.indexOf('wLidgets') > -1 ? 'ref' : 'image', err.message);
		}
	}

	/**
	 * pauses function execution for given duration time =  how long should media stay visible on the screen
	 * @param regionInfo - information about region when current media belongs to
	 * @param parentRegion - region overlaping curernt region, trigger case
	 * @param duration - how long should media stay on screen
	 * @param element - displayed SOS HTML element
	 * @param arrayIndex - current index in the currentlyPlayingPriority[priorityRegionName] array
	 * @param elementHtml - actual HTML element visible on page
	 * @param transitionDuration - duration of transitions between images
	 * @param taskStartDate - date when element was dispalyed
	 * @param version - smil internal version of current playlist
	 */
	private waitMediaOnScreen = async (
		regionInfo: RegionAttributes, parentRegion: RegionAttributes, duration: number, element: SosHtmlElement, arrayIndex: number,
		elementHtml: HTMLElement, transitionDuration: number, taskStartDate: Date, version: number,
		): Promise<void> => {

		debug('Starting to play element: %O', element);

		await this.checkRegionsForCancellation(element, regionInfo, parentRegion, version);

		this.setCurrentlyPlaying(element, 'html', regionInfo.regionName);

		// create currentlyPlayingPriority for trigger nested region
		if (regionInfo.regionName !== parentRegion.regionName) {
			this.currentlyPlayingPriority[regionInfo.regionName] = this.currentlyPlayingPriority[parentRegion.regionName];
		}
		debug('waiting image duration: %s from element: %s', duration, element.id);
		// pause function for how long should media stay on display screen
		while (duration > 0 && !get(this.currentlyPlayingPriority, `${regionInfo.regionName}`)[arrayIndex].player.stop
		// @ts-ignore
		&& get(this.currentlyPlaying, `${regionInfo.regionName}.player`) !== 'stop') {
			while (get(this.currentlyPlayingPriority, `${regionInfo.regionName}`)[arrayIndex].player.contentPause !== 0) {
				await sleep(100);
				// if playlist is paused and new smil file version is detected, cancel pause behaviour and cancel playlist
				if (this.getCancelFunction()) {
					await this.cancelPreviousMedia(regionInfo);
				}
			}
			if (transitionDuration !== 0 && duration === transitionDuration
			&& this.currentlyPlaying[regionInfo.regionName].nextElement.type === 'html') {
				setTransitionCss(elementHtml, this.currentlyPlaying[regionInfo.regionName].nextElement.id, transitionDuration);
			}
			duration -= 100;
			await sleep(100);
		}

		debug('element playing finished: %O', element);

		await this.files.sendMediaReport(element, taskStartDate, element.localFilePath.indexOf('widgets') > -1 ? 'ref' : 'image');

	}

	/**
	 * function used to await for content to appear based on wallclock definitions, can be interupted earlier by updates in smil file
	 * @param timeout - how long should function wait
	 */
	private waitTimeoutOrFileUpdate = async (timeout: number): Promise<boolean> => {
		const promises = [];
		let fileUpdated = false;
		promises.push(sleep(timeout));
		promises.push(new Promise(async (resolve) => {
			while (!this.getCancelFunction()) {
				await sleep(1000);
			}
			fileUpdated = true;
			resolve();
		}));
		await Promise.race(promises);
		return fileUpdated;
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

	/**
	 * Function responsible for dynamic assigment of nested regions for trigger playlists
	 * @param media - playlist to be played
	 * @param element - html element in DOM ( image, widget )
	 */
	private handleTriggers = async (media: SMILVideo | SosHtmlElement, element: HTMLElement | undefined = undefined) => {
		let regionInfo = media.regionInfo;
		await sleep(50);
		while (await this.isRegionOrNestedActive(regionInfo) && !media.hasOwnProperty(SMILTriggersEnum.triggerValue)) {
			debug('Cant play media because its region is occupied by trigger. video: %O, region: %O', media, regionInfo);
			await sleep(150);
		}

		if (media.hasOwnProperty(SMILTriggersEnum.triggerValue) && regionInfo.hasOwnProperty('region')) {
			if (!Array.isArray(regionInfo.region)) {
				regionInfo.region = [regionInfo.region];
			}

			// if this trigger has already assigned region take it,
			// else find first free region in nested regions, if none is free, take first one
			regionInfo = !isNil(get(this.triggersEndless[<string> media.triggerValue], 'regionInfo')) ?
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
	 *
	 * @param media - video or SoSHTmlelement ( image or widget )
	 * @param regionInfo - information about region when current video belongs to
	 * @param priorityRegionName - name of currently playing region stored in currentlyPlayingPriority object
	 * @param currentIndex - current index in the currentlyPlayingPriority[priorityRegionName] array
	 * @param previousPlayingIndex - index of previously playing content in currentlyPlayingPriority[priorityRegionName] array
	 * @param endTime - when should playlist end, specified either in date in milis or how many times should playlist play
	 * @param isLast - if this media is last element in current playlist
	 * @param version - smil internal version of current playlist
	 */
	private shouldWaitAndContinue = async (
		media: SMILVideo | SosHtmlElement, regionInfo: RegionAttributes, priorityRegionName: string,
		currentIndex: number, previousPlayingIndex: number, endTime: number, isLast: boolean, version: number,
	): Promise<boolean> => {
		if (get(this.promiseAwaiting, `${regionInfo.regionName}`, 'default') === 'default') {
			this.promiseAwaiting[regionInfo.regionName] = <PlayingInfo> media;
			this.promiseAwaiting[regionInfo.regionName].promiseFunction = [];
		}

		if (get(this.promiseAwaiting, `${regionInfo.regionName}.promiseFunction`, 'default') === 'default') {
			this.promiseAwaiting[regionInfo.regionName].promiseFunction = [];
		}

		if (isNil(this.currentlyPlaying[regionInfo.regionName])) {
			this.currentlyPlaying[regionInfo.regionName] = <PlayingInfo> {};
		}

		if (this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex].behaviour !== 'pause'
		&& this.promiseAwaiting[regionInfo.regionName].promiseFunction.length > 0) {
			debug('waiting for previous promise: %O', media);
			this.currentlyPlaying[regionInfo.regionName].nextElement = media;
			this.currentlyPlaying[regionInfo.regionName].nextElement.type =
				get(media, 'localFilePath', 'default').indexOf(FileStructure.images) > -1 ? 'html' : 'video';
			await Promise.all(this.promiseAwaiting[regionInfo.regionName].promiseFunction!);
		}

		if (media.hasOwnProperty(SMILTriggersEnum.triggerValue) && !get(this.triggersEndless, `${media.triggerValue}.play`, false)) {
			debug('trigger was cancelled prematurely: %s', media.triggerValue);
			return false;
		}

		await this.handleTriggers(media);

		// nothing played before ( trigger case )
		if (isNil(this.currentlyPlayingPriority[regionInfo.regionName])) {
			return true;
		}

		// playlist was already stopped/paused during await
		if (get(this.currentlyPlayingPriority, `${regionInfo.regionName}`)[currentIndex].player.stop
			|| get(this.currentlyPlayingPriority, `${regionInfo.regionName}`)[currentIndex].player.contentPause !== 0
			|| get(this.currentlyPlayingPriority, `${regionInfo.regionName}`)[currentIndex].behaviour === 'pause') {
			// || this.getCancelFunction()) {
			debug(
				'Playlist was stopped/paused by higher priority during await: %O', this.currentlyPlayingPriority[priorityRegionName][currentIndex],
			);
			return false;
		}

		// during playlist pause was exceeded its endTime, dont play it and return from function, if endtime is 0, play indefinitely
		if ((this.currentlyPlayingPriority[priorityRegionName][currentIndex].player.endTime <= Date.now()
			&& this.currentlyPlayingPriority[priorityRegionName][currentIndex].player.endTime > 1000)
			|| (this.currentlyPlayingPriority[priorityRegionName][currentIndex].player.timesPlayed >= endTime
				&& endTime !== 0)) {

			this.handlePriorityWhenDone(priorityRegionName, currentIndex, endTime, isLast, version);
			debug('Playtime for playlist: %O was exceeded, exiting', this.currentlyPlayingPriority[priorityRegionName][currentIndex]);
			return false;
		}
		return true;
	}

	/**
	 * plays one video
	 * @param video - SMILVideo object
	 * @param version - smil internal version of current playlist
	 * @param priorityRegionName - name of currently playing region stored in currentlyPlayingPriority object
	 * @param currentIndex - current index in the currentlyPlayingPriority[priorityRegionName] array
	 * @param previousPlayingIndex - index of previously playing content in currentlyPlayingPriority[priorityRegionName] array
	 * @param endTime - when should playlist end, specified either in date in milis or how many times should playlist play
	 * @param isLast - if this media is last element in current playlist
	 */
	private playVideo = async (
		video: SMILVideo, version: number, priorityRegionName: string,
		currentIndex: number, previousPlayingIndex: number, endTime: number, isLast: boolean,
		) => {
		const taskStartDate = moment().toDate();
		try {
			// TODO: implement check to sos library
			if (video.localFilePath === '') {
				debug('Video: %O has empty localFilepath: %O', video);
				return;
			}

			// TODO: possible infinite loop
			if (isConditionalExpExpired(video, this.playerName, this.playerId)) {
				debug('Conditional expression: %s, for video: %O is false', video.expr!, video);
				return;
			}

			debug('Playing video: %O', video);

			const parentRegion = video.regionInfo;
			let regionInfo = await this.handleTriggers(video);

			const index = getIndexOfPlayingMedia(this.currentlyPlayingPriority[regionInfo.regionName]);

			// prepare if video is not same as previous one played
			if (get(this.currentlyPlaying[regionInfo.regionName], 'src') !== video.src
				&& get(this.videoPreparing[regionInfo.regionName], 'src') !== video.src) {
				debug('Preparing video: %O', video);
				await this.sos.video.prepare(
					video.localFilePath,
					regionInfo.left,
					regionInfo.top,
					regionInfo.width,
					regionInfo.height,
					config.videoOptions,
				);
				this.videoPreparing[regionInfo.regionName] = video;
			}

			if (!(await this.shouldWaitAndContinue(
				video, regionInfo, priorityRegionName, currentIndex, previousPlayingIndex, endTime, isLast, version,
				))) {
				return;
			}

			debug('Playing video after promise all: %O', video);

			this.promiseAwaiting[regionInfo.regionName].promiseFunction! = [(async () => {
				if (version < this.playlistVersion) {
					debug('not playing old version');
					this.handlePriorityWhenDone(priorityRegionName, currentIndex, endTime, isLast, version);
					return;
				}
				try {
					await this.sos.video.play(
						video.localFilePath,
						regionInfo.left,
						regionInfo.top,
						regionInfo.width,
						regionInfo.height,
					);

					await this.checkRegionsForCancellation(video, regionInfo, parentRegion, version);

					this.setCurrentlyPlaying(video, 'video', regionInfo.regionName);

					debug('Starting playing video onceEnded function - single video: %O', video);

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
					if (get(video, 'fullVideoDuration', SMILEnums.defaultVideoDuration) !== SMILEnums.defaultVideoDuration) {
						debug('Got fullVideoDuration: %s for video: %O', video.fullVideoDuration!, video);
						promiseRaceArray.push(sleep(video.fullVideoDuration! + SMILEnums.videoDurationOffset));
					}

					// if video has specified duration in smil file, cancel it after given duration passes
					if (get(video, 'dur', SMILEnums.defaultVideoDuration) !== SMILEnums.defaultVideoDuration) {
						const parsedDuration: number = setElementDuration(video.dur!);
						debug('Got dur: %s for video: %O', parsedDuration, video);
						promiseRaceArray.push(sleep(parsedDuration));
					}

					try {
						await Promise.race(promiseRaceArray);
					} catch (err) {
						debug('Unexpected error: %O during single video playback onceEnded at video: %O', err, video);
					}

					debug('Playing video finished: %O', video);

					await this.files.sendMediaReport(video, taskStartDate, 'video');

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

					// create currentlyPlayingPriority for trigger nested region
					if (regionInfo.regionName !== parentRegion.regionName) {
						this.currentlyPlayingPriority[regionInfo.regionName] = this.currentlyPlayingPriority[parentRegion.regionName];
					}

					while (!isNil(this.currentlyPlayingPriority[regionInfo.regionName])
					&& this.currentlyPlayingPriority[regionInfo.regionName][index].player.contentPause !== 0) {
						video.playing = false;
						await sleep(100);
						// if playlist is paused and new smil file version is detected, cancel pause behaviour and cancel playlist
						if (this.getCancelFunction()) {
							await this.cancelPreviousMedia(regionInfo);
							debug('Finished iteration of playlist: %O', this.currentlyPlayingPriority[priorityRegionName][currentIndex]);
							this.handlePriorityWhenDone(priorityRegionName, currentIndex, endTime, isLast, version);
							break;
						}
					}
					// no video.stop function so one video can be played gapless in infinite loop
					// stopping is handled by cancelPreviousMedia function
					// force stop video only when reloading smil file due to new version of smil
					if (this.getCancelFunction()) {
						await this.cancelPreviousMedia(regionInfo);
						debug('Finished iteration of playlist: %O', this.currentlyPlayingPriority[priorityRegionName][currentIndex]);
						this.handlePriorityWhenDone(priorityRegionName, currentIndex, endTime, isLast, version);
						return;
					}

					debug('Finished iteration of playlist: %O', this.currentlyPlayingPriority[priorityRegionName][currentIndex]);
					this.handlePriorityWhenDone(priorityRegionName, currentIndex, endTime, isLast, version);
				} catch (err) {
					debug('Unexpected error: %O occurred during single video playback: O%', err, video);
					await this.files.sendMediaReport(video, taskStartDate, 'video', err.message);
				}
			})()];
		} catch (err) {
			debug('Unexpected error: %O occurred during single video prepare: O%', err, video);
			await this.files.sendMediaReport(video, taskStartDate, 'video', err.message);
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

	private setupIntroImage = async (
		image: SMILImage, internalStorageUnit: IStorageUnit, region: RegionsObject, key: string,
	): Promise<HTMLElement> => {
		const currentImageDetails = <IFile> await this.files.getFileDetails(image, internalStorageUnit, FileStructure.images);
		image.regionInfo = getRegionInfo(region, image.region);
		image.localFilePath = currentImageDetails.localUri;
		debug('Setting-up intro image: %O', image);
		const element: HTMLElement = createHtmlElement(HtmlEnum.img, image.localFilePath, image.regionInfo, key);
		image.id = element.id;
		element.style.visibility = 'visible';
		element.setAttribute('src', image.localFilePath);
		document.body.appendChild(element);
		debug('Intro image prepared: %O', element);
		return element;
	}

	private playIntroLoop = async (
		media: string, intro: SMILIntro, downloadPromises: Promise<Function[]>[],
		smilObject: SMILFileObject, internalStorageUnit: IStorageUnit, smilUrl: string,
	): Promise<void> => {
		const promises = [];
		this.playingIntro = true;
		promises.push((async () => {
			while (this.playingIntro) {
				switch (removeDigits(media)) {
					case SMILEnums.img:
						await sleep(1000);
						break;
					default:
						await this.playIntroVideo(<SMILVideo> get(intro, `${media}`));
				}
			}
		})());

		promises.push((async () => {
			await Promise.all(downloadPromises).then(async () =>  {
				// prepares everything needed for processing playlist
				await this.manageFilesAndInfo(smilObject, internalStorageUnit, smilUrl);
				// all files are downloaded, stop intro
				debug('SMIL media files download finished, stopping intro');
			});
		})());

		await Promise.race(promises);
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

	/**
	 * iterate through array of images, widgets or audios
	 * @param value - object or array of object of type SMILAudio | SMILImage | SMILWidget
	 * @param version - smil internal version of current playlist
	 * @param parent - superordinate element of value
	 * @param htmlElement - which html element will be created in DOM
	 * @param priorityRegionName - name of currently playing region stored in currentlyPlayingPriority object
	 * @param currentIndex - current index in the currentlyPlayingPriority[priorityRegionName] array
	 * @param previousPlayingIndex - index of previously playing content in currentlyPlayingPriority[priorityRegionName] array
	 * @param endTime - when should playlist end, specified either in date in milis or how many times should playlist play
	 * @param isLast - if this media is last element in current playlist
	 */
	private playOtherMedia = async (
		value: SMILMediaNoVideo,
		version: number,
		parent: string,
		htmlElement: string,
		priorityRegionName: string, currentIndex: number, previousPlayingIndex: number, endTime: number, isLast: boolean,
	) => {

		const index = getIndexOfPlayingMedia(this.currentlyPlayingPriority[value.regionInfo.regionName]);

		debug('Playing media : %O with parent: %s', value, parent);
		if (isConditionalExpExpired(value, this.playerName, this.playerId)) {
			debug('Conditional expression: %s, for video: %O is false', value.expr!, value);
			return;
		}
		// widget with website url as datasource
		if (htmlElement === HtmlEnum.ref && getFileName(value.src).indexOf('.wgt') === -1) {
			value.localFilePath = value.src;
			await this.playTimedMedia(value, version, index, priorityRegionName, currentIndex, previousPlayingIndex, endTime, isLast);
			return;
		}
		if (htmlElement === 'audio') {
			await this.playAudio(value.localFilePath);
			return;
		}
		await this.playTimedMedia(value, version, index, priorityRegionName, currentIndex, previousPlayingIndex, endTime, isLast);
	}

	/**
	 * call actual playing functions for given elements
	 * @param value - json object or array of json objects of type SMILAudio | SMILImage | SMILWidget | SMILVideo
	 * @param version - smil internal version of current playlist
	 * @param key - defines which media will be played ( video, audio, image or widget )
	 * @param parent - superordinate element of value
	 * @param priorityRegionName - name of currently playing region stored in currentlyPlayingPriority object
	 * @param currentIndex - current index in the currentlyPlayingPriority[priorityRegionName] array
	 * @param previousPlayingIndex - index of previously playing content in currentlyPlayingPriority[priorityRegionName] array
	 * @param endTime - when should playlist end, specified either in date in milis or how many times should playlist play
	 * @param isLast - if this media is last element in current playlist
	 */
	private playElement = async (
		value: SMILMedia, version: number, key: string, parent: string, priorityRegionName: string,
		currentIndex: number, previousPlayingIndex: number, endTime: number, isLast: boolean,
	) => {
		// in case of array elements play it in sequential order or parent is empty ( trigger case )
		if (!isNaN(parseInt(parent)) || parent === '') {
			parent = 'seq';
		}
		debug('Playing element with key: %O, value: %O', key, value);
		switch (removeDigits(key)) {
			case 'video':
				await this.playVideo(<SMILVideo> value, version, priorityRegionName, currentIndex, previousPlayingIndex, endTime, isLast);
				break;
			case 'ref':
				await this.playOtherMedia(
					<SMILWidget> value, version, parent, HtmlEnum.ref, priorityRegionName, currentIndex, previousPlayingIndex, endTime, isLast,
				);
				break;
			case SMILEnums.img:
				await this.playOtherMedia(
					<SMILImage> value, version, parent, HtmlEnum.img, priorityRegionName, currentIndex, previousPlayingIndex, endTime, isLast,
				);
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
	 * @param version - smil internal version of current playlist
	 * @param key - defines which media will be played ( video, audio, image or widget )
	 * @param parent - parent specifying parent object in xml with randomly generated suffix (par-98324)
	 * @param endTime - time when should playlist end in millis or as repeatCount ( less than 1000 )
	 * @param priorityObject - information about priority rules for given playlist
	 * @param isLast - if current playlist is last in playlist chain ( could me multiple image, video, widgets playlists )
	 */
	private priorityBehaviour = async (
		value: SMILMedia, version: number, key: string, parent: string = '0', endTime: number = 0,
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
		await this.playElement(value, version, key, parent, priorityRegionName, currentIndex, previousPlayingIndex, endTime, isLast);
	}

	/**
	 * Determines which priority rule to use
	 * @param priorityObject - information about priority rules for given playlist
	 * @param priorityRegionName - regionName in which playlist will be played
	 * @param currentIndex - at which index is playlist stored in currentlyPlayingPriority object
	 * @param previousPlayingIndex - at which index is previously playing playlist stored in currentlyPlayingPriority object
	 * @param parent - parent specifying parent object in xml with randomly generated suffix (par-98324)
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
	 * @param parent - parent specifying parent object in xml with randomly generated suffix (par-98324)
	 * @param endTime - time when should playlist end in millis or as repeatCount ( less than 1000 )
	 */
	private handlePriorityBeforePlay = async (
			priorityObject: PriorityObject, priorityRegionName: string, currentIndex: number,
			previousPlayingIndex: number, parent: string, endTime: number,
		): Promise<void> => {
		// if attempted to play playlist which was stopped by higher priority, wait till end of higher priority playlist and try again
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

			// during playlist pause was exceeded its endTime, dont play it and return from function, if endtime is 0, play indefinitely
			if (this.currentlyPlayingPriority[priorityRegionName][currentIndex].player.endTime <= Date.now()
				&& this.currentlyPlayingPriority[priorityRegionName][currentIndex].player.endTime !== 0) {
				debug('Playtime for playlist: %O was exceeded, exiting', this.currentlyPlayingPriority[priorityRegionName][currentIndex]);
				return;
			}

			// wait for new potential playlist to appear
			await sleep((this.currentlyPlayingPriority[priorityRegionName].length - priorityObject.priorityLevel) * 100);
			this.currentlyPlayingPriority[priorityRegionName][currentIndex].behaviour = '';
			this.currentlyPlayingPriority[priorityRegionName][currentIndex].player.stop = false;

			debug('Stop behaviour lock released for playlist: %O', this.currentlyPlayingPriority[priorityRegionName][currentIndex]);

			// regenerate
			let newPreviousIndex = getIndexOfPlayingMedia(this.currentlyPlayingPriority[priorityRegionName]);

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
				<  priorityObject.priorityLevel) {
				debug('Stop behaviour: breaking from stop lock');
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
	 * @param parent - parent specifying parent object in xml with randomly generated suffix (par-98324)
	 * @param endTime - time when should playlist end in millis or as repeatCount ( less than 1000 )
	 */
	private handleDeferBehaviour = async (
			priorityObject: PriorityObject, priorityRegionName: string, currentIndex: number,
			previousPlayingIndex: number, parent: string, endTime: number,
		): Promise<void> => {
		debug('Handling defer behaviour for playlist: %O', this.currentlyPlayingPriority[priorityRegionName][currentIndex]);
		this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex].behaviour = 'defer';
		// set current deferred content to not playing
		this.currentlyPlayingPriority[priorityRegionName][currentIndex].player.playing = false;

		while (true) {
			while (this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex].player.playing) {
				await sleep(100);
			}

			// if playlist is paused and new smil file version is detected, cancel pause behaviour and cancel playlist
			if (this.getCancelFunction()) {
				return;
			}

			// during playlist pause was exceeded its endTime, dont play it and return from function, if endtime is 0, play indefinitely
			if (this.currentlyPlayingPriority[priorityRegionName][currentIndex].player.endTime <= Date.now()
				&& this.currentlyPlayingPriority[priorityRegionName][currentIndex].player.endTime !== 0) {
				debug('Playtime for playlist: %O was exceeded, exiting', this.currentlyPlayingPriority[priorityRegionName][currentIndex]);
				return;
			}

			// wait for new potential playlist to appear
			await sleep((this.currentlyPlayingPriority[priorityRegionName].length - priorityObject.priorityLevel) * 100);

			debug('Defer behaviour lock released for playlist: %O', this.currentlyPlayingPriority[priorityRegionName][currentIndex]);

			// regenerate
			let newPreviousIndex = getIndexOfPlayingMedia(this.currentlyPlayingPriority[priorityRegionName]);

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
	 * @param version - smil internal version of current playlist
	 */
	private handlePriorityWhenDone = (
		priorityRegionName: string, currentIndex: number, endTime: number, isLast: boolean, version: number,
		): void => {
		debug('Checking if playlist is finished: %O for region: %s'
			,    this.currentlyPlayingPriority[priorityRegionName][currentIndex], priorityRegionName);
		/*
			condition which determines if this was last iteration of playlist
			rule 1: if endTime in millis is lower as current time and at the same time is higher than 1000
				- endTime is specified in date in millis
			rule 2: if timesPlayed is bigger than endTime
				- endTime is specified as repeatCount ( <= 1000 )
			rule 3: is last part of current playlist chain
			rule 4: smil file was updated force end of playlist
			rule 5: smil file was updated force end of playlist based on version
		 */
		// TODO: refactor condition to separate rules
		if ((((this.currentlyPlayingPriority[priorityRegionName][currentIndex].player.endTime <= Date.now()
			&& this.currentlyPlayingPriority[priorityRegionName][currentIndex].player.endTime > 1000)
			|| this.currentlyPlayingPriority[priorityRegionName][currentIndex].player.timesPlayed >= endTime)
			&& isLast) || this.getCancelFunction() || version < this.playlistVersion) {
			debug('Finished playing playlist: %O for region: %s'
				,    this.currentlyPlayingPriority[priorityRegionName][currentIndex], priorityRegionName);
			// some playlist was paused by this one, unpause it
			const pausedIndex = this.currentlyPlayingPriority[priorityRegionName][currentIndex].controlledPlaylist;
			// reset counter for finished playlist
			this.currentlyPlayingPriority[priorityRegionName][currentIndex].player.timesPlayed = 0;
			if (!isNil(pausedIndex)) {
				debug('Un paused priority dependant playlist: %O for region: %s'
					,    this.currentlyPlayingPriority[priorityRegionName][pausedIndex], priorityRegionName);
				this.currentlyPlayingPriority[priorityRegionName][pausedIndex].player.contentPause = 0;
				this.currentlyPlayingPriority[priorityRegionName][pausedIndex].behaviour = '';
			}
			this.currentlyPlayingPriority[priorityRegionName][currentIndex].player.playing = false;
		}
	}
	/**
	 * Functions handles elements in currentlyPlayingPriority object, pushes new ones or replaces older ones when parent is same
	 * also copies necessary info from older playlists
	 * @param priorityRegionName - regionName in which playlist will be played
	 * @param value - actual playlist
	 * @param parent - parent specifying parent object in xml with randomly generated suffix (par-98324)
	 * @param endTime - time when should playlist end in millis or as repeatCount ( less than 1000 )
	 * @param priorityObject - information about priority rules for given playlist
	 */
	private handlePriorityInfoObject = (
			priorityRegionName: string, value: SMILMedia, parent: string, endTime: number, priorityObject: PriorityObject,
		): {
		currentIndex: number,
		previousPlayingIndex: number,
	} => {
		let skipLoop = false;
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
			// dont iterate over loop for the first element
			skipLoop = true;
		}

		let previousPlayingIndex = getIndexOfPlayingMedia(this.currentlyPlayingPriority[priorityRegionName]);

		previousPlayingIndex = previousPlayingIndex > -1 ? previousPlayingIndex : 0;

		let currentIndex = 0;

		if (!skipLoop) {
			let arrayIndex: number = 0;
			for (const elem of this.currentlyPlayingPriority[priorityRegionName]) {
				if (isEqual(elem.media, infoObject.media) && elem.parent === infoObject.parent) {
					// preserve behaviour of previous element from same parent
					infoObject.behaviour = elem.behaviour;
					infoObject.player.playing = elem.player.playing;
					infoObject.controlledPlaylist = <any> elem.controlledPlaylist;
					// same playlist is played again, increase count to track how many times it was already played
					// not for triggers or infinite playlists
					if (isNil(value.triggerValue) && endTime !== 0) {
						infoObject.player.timesPlayed = elem.player.timesPlayed + 1;
					}
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
					// not for triggers or infinite playlists
					if (isEqual(elem.isFirstInPlaylist, infoObject.media) && isNil(value.triggerValue) && endTime !== 0) {
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
					break;
				}
				arrayIndex += 1;
			}
		}
		return { currentIndex, previousPlayingIndex };
	}
}
