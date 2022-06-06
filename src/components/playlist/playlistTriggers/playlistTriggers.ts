/* tslint:disable:Unnecessary semicolon missing whitespace */
import { SMILMedia } from '../../../models/mediaModels';
import { sleep } from '../tools/generalTools';
import { FunctionKeys, SMILTriggersEnum } from '../../../enums/triggerEnums';
import { isNil } from 'lodash';
import { RegionAttributes } from '../../../models/xmlJsonModels';
import { SMILFileObject } from '../../../models/filesModels';
import { findDuration, setElementDuration } from '../tools/scheduleTools';
import Nexmosphere from '@signageos/front-applet-extension-nexmosphere/es6';
import { RfidAntennaEvent } from '@signageos/front-applet/es6/Sensors/IRfidAntenna';
import { addEventOnTriggerWidget } from '../tools/htmlTools';
import { ParsedSensor, ParsedTriggerCondition, TriggerEndless, TriggerObject } from '../../../models/triggerModels';
import { getRandomInt } from '../../files/tools';
import { SMILScheduleEnum } from '../../../enums/scheduleEnums';
import FrontApplet from '@signageos/front-applet/es6/FrontApplet/FrontApplet';
import { FilesManager } from '../../files/filesManager';
import set = require('lodash/set');
import Debug from 'debug';
import { PlaylistCommon } from '../playlistCommon/playlistCommon';
import { PlaylistOptions } from '../../../models/playlistModels';
import { BinaryOperatorChar } from '../../../enums/conditionalEnums';
import { IPlaylistTriggers } from './IPlaylistTriggers';

const debug = Debug('@signageos/smil-player:playlistTriggers');

export class PlaylistTriggers extends PlaylistCommon implements IPlaylistTriggers {
	public readonly triggersEndless: TriggerEndless = {};
	private readonly processPlaylist: Function;

	constructor(sos: FrontApplet, files: FilesManager, options: PlaylistOptions, processPlaylist: Function) {
		super(sos, files, options);
		this.processPlaylist = processPlaylist;
	}

	public watchTriggers = async (smilObject: SMILFileObject) => {
		this.watchKeyboardInput(smilObject);
		this.watchOnTouchOnClick(smilObject);
		await this.watchRfidAntena(smilObject);
		await sleep(2000);
		await this.watchSyncTriggers(smilObject);
	};

	/**
	 * Function responsible for dynamic assigment of nested regions for trigger playlists
	 * @param media - playlist to be played
	 * @param element - html element in DOM ( image, widget )
	 */
	public handleTriggers = async (media: SMILMedia, element: HTMLElement | undefined = undefined) => {
		let regionInfo = media.regionInfo;
		await sleep(50);
		while (this.isRegionOrNestedActive(regionInfo) && !media.hasOwnProperty(SMILTriggersEnum.triggerValue)) {
			// debug('Cant play media because its region is occupied by trigger. video: %O, region: %O', media, regionInfo);
			await sleep(150);
		}

		if (media.hasOwnProperty(SMILTriggersEnum.triggerValue) && regionInfo.hasOwnProperty('region')) {
			if (!Array.isArray(regionInfo.region)) {
				regionInfo.region = [regionInfo.region];
			}

			// if this trigger has already assigned region take it,
			// else find first free region in nested regions, if none is free, take first one
			regionInfo = !isNil(this.triggersEndless[<string>media.triggerValue]?.regionInfo)
				? this.triggersEndless[<string>media.triggerValue].regionInfo
				: regionInfo.region[this.findFirstFreeRegion(regionInfo.region)];

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
	};

	private watchSyncTriggers = async (smilObject: SMILFileObject) => {
		this.sos.sync.onStatus(async (onStatus) => {
			onStatus.connectedPeers = onStatus.connectedPeers
				.filter((el: string) => el !== null && el !== 'null')
				.sort();

			if (onStatus.connectedPeers.length === 0) {
				return;
			}
			// back to normal, cancel all triggers
			if (onStatus.connectedPeers.length === this.synchronization.syncGroupIds.length) {
				for (const trigger in this.triggersEndless) {
					this.triggersEndless[trigger].play = false;
					this.triggersEndless[trigger].syncCanceled = true;
					// stop fullscreen trigger
					set(this.currentlyPlaying, `fullScreenTrigger.player`, 'stop');
				}
				this.synchronization.shouldSync = true;
				this.synchronization.shouldCancelAll = true;
				return;
			}
			if (onStatus.connectedPeers.length < this.synchronization.syncGroupIds.length) {
				this.synchronization.shouldSync = false;
				const missingIds = this.synchronization.syncGroupIds
					.filter((elem) => !onStatus.connectedPeers.includes(elem))
					.sort();
				const shouldTakeOver: { [key: string]: string[] } = {};

				for (const deviceId of missingIds) {
					const missingIdIndex = this.synchronization.syncGroupIds.indexOf(deviceId);
					const missingIdsArray: string[] = [];

					let counter = missingIdIndex;
					// find first active device which should take over inactive devices
					while (!onStatus.connectedPeers.includes(this.synchronization.syncGroupIds[counter])) {
						missingIdsArray.push(this.synchronization.syncGroupIds[counter]);
						counter = (counter + 1) % this.synchronization.syncGroupIds.length;
					}

					const responsibleDisplay = this.synchronization.syncGroupIds[counter];

					shouldTakeOver[responsibleDisplay] = shouldTakeOver[responsibleDisplay] ?? [];
					shouldTakeOver[responsibleDisplay] = shouldTakeOver[responsibleDisplay].concat(missingIdsArray);

					shouldTakeOver[responsibleDisplay] = shouldTakeOver[responsibleDisplay].filter(
						(value: string, index: number) => shouldTakeOver[responsibleDisplay].indexOf(value) === index,
					);
				}

				if (!isNil(shouldTakeOver[this.synchronization.syncDeviceId])) {
					let syncTriggerId = shouldTakeOver[this.synchronization.syncDeviceId].sort().join('');

					const triggerInfo = smilObject.triggerSensorInfo[`${SMILTriggersEnum.syncPrefix}-${syncTriggerId}`];

					if (
						!isNil(smilObject.triggerSensorInfo[`${SMILTriggersEnum.syncPrefix}-${syncTriggerId}`]) &&
						!this.triggersEndless[triggerInfo.trigger]?.play
					) {
						debug('Starting trigger: %O', triggerInfo.trigger);
						set(this.triggersEndless, `${triggerInfo.trigger}.latestEventFired`, Date.now());

						const triggerMedia = smilObject.triggers[triggerInfo.trigger];
						const stringDuration = findDuration(triggerMedia);
						if (!isNil(stringDuration)) {
							await this.processTriggerDuration(triggerInfo, triggerMedia, stringDuration);
						} else {
							await this.processTriggerRepeatCount(triggerInfo, triggerMedia);
						}
					} else {
						debug('Trigger is already playing');
					}
				} else {
					debug('no active trigger found, cancel current trigger if playing');
					for (const trigger in this.triggersEndless) {
						this.triggersEndless[trigger].play = false;
						this.triggersEndless[trigger].syncCanceled = true;
						set(this.currentlyPlaying, `fullScreenTrigger.player`, 'stop');
					}
				}
			}
		});
	};

	private watchRfidAntena = async (smilObject: SMILFileObject) => {
		let serialPort;
		try {

			if (smilObject.sensors.length === 0) {
				throw new Error('No sensors specified for nexmosphere triggers: ' + JSON.stringify(smilObject.sensors));
			}

			serialPort = await this.sos.hardware.openSerialPort({
				device: this.sos.config.serialPortDevice ?? SMILTriggersEnum.nexmoDevice,
				baudRate: SMILTriggersEnum.nexmoBaudRate as number,
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
				if (isNil(sensor.address)) {
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
	};

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
	};

	private processOnTouchOnClick = async (smilObject: SMILFileObject) => {
		const triggerInfo = smilObject.triggerSensorInfo[`${SMILTriggersEnum.mousePrefix}`];

		// smil file does not support mouse/touch events
		if (isNil(triggerInfo)) {
			return;
		}

		set(this.triggersEndless, `${triggerInfo.trigger}.latestEventFired`, Date.now());

		const triggerMedia = smilObject.triggers[triggerInfo.trigger];

		if (this.triggersEndless[triggerInfo.trigger]?.play) {
			if (triggerMedia.seq?.end === triggerInfo.trigger) {
				const currentTrigger = this.triggersEndless[triggerInfo.trigger];
				currentTrigger.play = false;
				await this.cancelPreviousMedia(currentTrigger.regionInfo);
			}
			return;
		}

		if (!isNil(smilObject.triggerSensorInfo[`${SMILTriggersEnum.mousePrefix}`]) && !isNil(triggerMedia)) {
			debug('Starting trigger: %O', triggerInfo.trigger);
			addEventOnTriggerWidget(triggerMedia, this.triggersEndless, triggerInfo);
			const stringDuration = findDuration(triggerMedia);
			if (!isNil(stringDuration)) {
				await this.processTriggerDuration(triggerInfo, triggerMedia, stringDuration);
				return;
			}

			await this.processTriggerRepeatCount(triggerInfo, triggerMedia);
		}
	};

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
	};

	private processKeyDownEvent = async (
		event: KeyboardEvent,
		smilObject: SMILFileObject,
		state: any,
	): Promise<any> => {
		const key: string = event.key;
		const currentTime = Date.now();
		let buffer: any = [];
		let bufferString: string = '';

		if (!FunctionKeys[key]) {
			if (currentTime - state.lastKeyTime > SMILTriggersEnum.keyStrokeDelay) {
				buffer = [key];
			} else {
				buffer = [...state.buffer, key];
			}
			bufferString = buffer.join('');

			for (let [triggerId] of Object.entries(smilObject.triggerSensorInfo)) {
				const trimmedTriggerId = triggerId.replace(`${SMILTriggersEnum.keyboardPrefix}-`, '');
				if (bufferString.startsWith(trimmedTriggerId)) {
					bufferString = trimmedTriggerId;
				}
			}
		}

		const triggerInfo = smilObject.triggerSensorInfo[`${SMILTriggersEnum.keyboardPrefix}-${bufferString}`];

		// smil file does not support mouse/touch events
		if (isNil(triggerInfo)) {
			state = { buffer: buffer, lastKeyTime: currentTime };
			return state;
		}

		// regenerate time when was trigger last called
		set(this.triggersEndless, `${triggerInfo.trigger}.latestEventFired`, Date.now());
		const triggerMedia = smilObject.triggers[triggerInfo.trigger];

		if (!this.triggersEndless[triggerInfo.trigger]?.play) {
			buffer = [];
			debug('Starting trigger: %O', triggerInfo.trigger);

			const stringDuration = findDuration(triggerMedia);
			if (!isNil(stringDuration)) {
				await this.processTriggerDuration(triggerInfo, triggerMedia, stringDuration);
			} else {
				await this.processTriggerRepeatCount(triggerInfo, triggerMedia);
			}
		}

		// trigger has end condition defined and was cancelled during playback
		if (this.triggersEndless[triggerInfo.trigger]?.play && triggerMedia.seq?.end === triggerInfo.trigger) {
			const currentTrigger = this.triggersEndless[triggerInfo.trigger];
			currentTrigger.play = false;
			await this.cancelPreviousMedia(currentTrigger.regionInfo);
		}

		if (!FunctionKeys[key]) {
			state = { buffer: buffer, lastKeyTime: currentTime };
		}
		return state;
	};

	private processTriggerDuration = async (
		triggerInfo: { condition: ParsedTriggerCondition[]; stringCondition: string; trigger: string },
		triggerMedia: TriggerObject,
		stringDuration: string,
	) => {
		const durationMillis = setElementDuration(stringDuration);
		const triggerRandom = getRandomInt(100000);
		const currentTrigger = this.triggersEndless[triggerInfo.trigger];

		currentTrigger.play = true;
		currentTrigger.syncCanceled = false;
		currentTrigger.triggerRandom = triggerRandom;

		let play = true;
		const promises = [];

		promises.push(
			(async () => {
				while (play) {
					await this.processPlaylist(triggerMedia, SMILScheduleEnum.triggerPlaylistVersion);
				}
			})(),
		);

		promises.push(
			(async () => {
				while (currentTrigger?.latestEventFired + durationMillis > Date.now() && currentTrigger.play) {
					await sleep(100);
				}
				play = false;
			})(),
		);

		await Promise.race(promises);

		// trigger finished playing by itself, cancel it
		debug('Cancelling trigger: %O', triggerInfo.trigger);
		const regionInfo = currentTrigger.regionInfo;
		if (currentTrigger.triggerRandom === triggerRandom && (currentTrigger.play || currentTrigger.syncCanceled)) {
			currentTrigger.play = false;
			await this.cancelPreviousMedia(regionInfo);
		}
	};

	private processTriggerRepeatCount = async (
		triggerInfo: { condition: ParsedTriggerCondition[]; stringCondition: string; trigger: string },
		triggerMedia: TriggerObject,
	) => {
		const triggerRandom = getRandomInt(100000);
		const currentTrigger = this.triggersEndless[triggerInfo.trigger];

		currentTrigger.play = true;
		currentTrigger.syncCanceled = false;
		currentTrigger.triggerRandom = triggerRandom;

		await this.processPlaylist(triggerMedia, SMILScheduleEnum.triggerPlaylistVersion);
		await Promise.all(this.promiseAwaiting[currentTrigger.regionInfo.regionName].promiseFunction!);

		// trigger finished playing by itself, cancel it
		debug('Cancelling trigger: %O', triggerInfo.trigger);

		const regionInfo = currentTrigger.regionInfo;
		if (currentTrigger.triggerRandom === triggerRandom && (currentTrigger.play || currentTrigger.syncCanceled)) {
			currentTrigger.play = false;
			await this.cancelPreviousMedia(regionInfo);
		}
	};

	private processRfidAntenna = async (
		smilObject: SMILFileObject,
		sensor: ParsedSensor,
		tag: number,
		action: string,
	) => {
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
	};

	private areTriggerConditionsMet(
		conditions: ParsedTriggerCondition[],
		logicCondition: string,
		action: string,
	): boolean {
		switch (logicCondition) {
			case BinaryOperatorChar.or:
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

	private isRegionOrNestedActive = (regionInfo: RegionAttributes): boolean => {
		const currentRegion = this.currentlyPlaying[regionInfo.regionName];
		if (currentRegion?.playing && currentRegion[SMILTriggersEnum.triggerValue]) {
			return true;
		}

		// failover fullscreen trigger
		if (this.currentlyPlaying.fullScreenTrigger?.playing === true) {
			return true;
		}

		if (regionInfo.hasOwnProperty('region')) {
			for (const region of regionInfo.region as RegionAttributes[]) {
				if (this.currentlyPlaying[region.regionName]?.playing) {
					return true;
				}
			}
		}
		return false;
	};

	private findFirstFreeRegion(regions: RegionAttributes[]): number {
		let index = 0;
		for (const region of regions) {
			const currentRegion = this.currentlyPlaying[region.regionName];
			// region is empty or media playing in it are not defined as trigger media
			if (!currentRegion?.playing || !currentRegion[SMILTriggersEnum.triggerValue]) {
				set(this.currentlyPlaying, `${region.regionName}.playing`, true);
				return index;
			}
			index += 1;
		}
		return 0;
	}
}
