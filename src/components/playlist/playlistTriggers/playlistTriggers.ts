/* tslint:disable:Unnecessary semicolon missing whitespace */
import { SMILMedia } from '../../../models/mediaModels';
import { sleep } from '../tools/generalTools';
import { FunctionKeys, SMILTriggersEnum } from '../../../enums/triggerEnums';
import { isNil, isObject } from 'lodash';
import { RegionAttributes } from '../../../models/xmlJsonModels';
import { SMILFileObject } from '../../../models/filesModels';
import { findDuration, setElementDuration } from '../tools/scheduleTools';
import Nexmosphere from '@signageos/front-applet-extension-nexmosphere/es6';
import { RfidAntennaEvent } from '@signageos/front-applet/es6/Sensors/IRfidAntenna';
import { addEventOnTriggerWidget } from '../tools/htmlTools';
import {
	DynamicPlaylistObject,
	ParsedSensor,
	ParsedTriggerCondition,
	TriggerEndless,
	TriggerObject,
} from '../../../models/triggerModels';
import { getRandomInt } from '../../files/tools';
import { SMILScheduleEnum } from '../../../enums/scheduleEnums';
import FrontApplet from '@signageos/front-applet/es6/FrontApplet/FrontApplet';
import { FilesManager } from '../../files/filesManager';
import set = require('lodash/set');
import Debug from 'debug';
import { PlaylistCommon } from '../playlistCommon/playlistCommon';
import { PlaylistElement, PlaylistOptions } from '../../../models/playlistModels';
import { BinaryOperatorChar } from '../../../enums/conditionalEnums';
import { IPlaylistTriggers } from './IPlaylistTriggers';
import { PriorityObject } from '../../../models/priorityModels';
// @ts-ignore
import { DynamicPlaylist, DynamicPlaylistElement, DynamicPlaylistEndless } from '../../../models/dynamicModels';
import { SMILDynamicEnum } from '../../../enums/dynamicEnums';
// @ts-ignore
import { getDynamicPlaylistAndId } from '../tools/dynamicPlaylistTools';
import { joinSyncGroup } from '../tools/dynamicTools';

const debug = Debug('@signageos/smil-player:playlistTriggers');

export class PlaylistTriggers extends PlaylistCommon implements IPlaylistTriggers {
	public readonly triggersEndless: TriggerEndless = {};
	public readonly dynamicPlaylist: DynamicPlaylistEndless = {};
	public smilObject: SMILFileObject;
	private readonly processPlaylist: Function;

	constructor(sos: FrontApplet, files: FilesManager, options: PlaylistOptions, processPlaylist: Function) {
		super(sos, files, options);
		this.processPlaylist = processPlaylist;
	}

	public watchTriggers = async (
		smilObject: SMILFileObject,
		playlistVersion: () => number,
		filesLoop: () => boolean,
	) => {
		this.smilObject = smilObject;
		this.watchKeyboardInput();
		this.watchOnTouchOnClick();
		await this.watchRfidAntena();
		// handles if some devices dies in sync
		await this.watchSyncTriggers();
		// handles slaves dynamic playback
		await this.watchUdpRequest(playlistVersion, filesLoop);
		this.sos.sync.onClosed(async (error?: Error) => {
			console.log('SYNC CLOSED', error);
			if (error) {
				try {
					console.log('will restart');
					await this.files.sendGeneralErrorReport(`Sync closed with error ${error}`);
					await sleep(5e3);
					await this.sos.management.power.appRestart();
				} catch (e) {
					console.log('error while restarting', e);
				}
			}
		});
	};

	/**
	 * Function responsible for dynamic assigment of nested regions for trigger playlists
	 * @param media - playlist to be played
	 * @param element - html element in DOM ( image, widget )
	 */
	public handleTriggers = async (media: SMILMedia, element: HTMLElement | undefined = undefined) => {
		let regionInfo = media.regionInfo;
		// TODO: was 50 and no dynamic check
		if (!media.dynamicValue) {
			console.log('WAITING TIMEOUT TO AVOID RACE CONDITION', media);
			await sleep(250);
		}
		console.log('HOVNO', this.isRegionOrNestedActive(regionInfo));
		while (
			this.isRegionOrNestedActive(regionInfo) &&
			!(media.hasOwnProperty(SMILTriggersEnum.triggerValue) || media.hasOwnProperty(SMILDynamicEnum.dynamicValue))
		) {
			// debug(
			// 	'Cant play media because its region is occupied by trigger. video: %O, region: %O',
			// 	media,
			// 	regionInfo,
			// );
			await sleep(25);
		}

		if (
			(media.hasOwnProperty(SMILTriggersEnum.triggerValue) ||
				media.hasOwnProperty(SMILDynamicEnum.dynamicValue)) &&
			regionInfo.hasOwnProperty('region')
		) {
			if (!Array.isArray(regionInfo.region)) {
				regionInfo.region = [regionInfo.region];
			}

			// if this trigger has already assigned region take it,
			// else find first free region in nested regions, if none is free, take first one
			if (media.hasOwnProperty(SMILTriggersEnum.triggerValue)) {
				regionInfo = !isNil(this.triggersEndless[media.triggerValue as string]?.regionInfo)
					? this.triggersEndless[media.triggerValue as string].regionInfo
					: regionInfo.region[this.findFirstFreeRegion(regionInfo.region)];

				set(this.triggersEndless, `${media.triggerValue}.regionInfo`, regionInfo);
			}

			if (media.hasOwnProperty(SMILDynamicEnum.dynamicValue)) {
				const index = this.findFirstFreeRegion(regionInfo.region as RegionAttributes[]);
				regionInfo = !isNil(this.dynamicPlaylist[media.dynamicValue!]?.regionInfo)
					? this.dynamicPlaylist[media.dynamicValue!].regionInfo
					: (regionInfo.region as RegionAttributes[])[index];

				set(this.dynamicPlaylist, `${media.dynamicValue}.regionInfo`, regionInfo);
				set(this.dynamicPlaylist, `${media.dynamicValue}.parentRegion`, media.regionInfo.regionName);
			}

			debug('Found free region: %s for playlist: %O', regionInfo.regionName, media);

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

	public handleDynamicPlaylist = async (
		dynamicPlaylistId: string,
		dynamicPlaylistConfig: DynamicPlaylist,
		dynamicMedia: DynamicPlaylistObject,
		version: number,
		parent: string = '',
		endTime: number = 0,
		priorityObject: PriorityObject = {} as PriorityObject,
		conditionalExpr: string = '',
	) => {
		this.dynamicPlaylist[dynamicPlaylistId].latestEventFired = Date.now();
		this.dynamicPlaylist[dynamicPlaylistId].syncId = dynamicPlaylistConfig.syncId;
		this.dynamicPlaylist[dynamicPlaylistId].dynamicConfig = dynamicPlaylistConfig;
		this.dynamicPlaylist[dynamicPlaylistId].version = version;

		const currentDynamicPlaylist = this.dynamicPlaylist[dynamicPlaylistId];
		const dynamicRandom = getRandomInt(100000);

		for (const [key, value] of Object.entries(this.smilObject.dynamic)) {
			if (value.seq?.end === dynamicPlaylistId && this.dynamicPlaylist[key]?.play) {
				this.dynamicPlaylist[key].play = false;
				await this.cancelPreviousMedia(this.dynamicPlaylist[key].regionInfo);
			}
		}

		currentDynamicPlaylist.dynamicRandom = dynamicRandom;
		currentDynamicPlaylist.play = true;
		console.log('PLAYING DYNAMIC PLAYLIST: ', dynamicPlaylistId);
		await this.processPlaylist(dynamicMedia, version, parent, endTime, priorityObject, conditionalExpr);
		console.log('PLAYING DYNAMIC PLAYLIST FINISHED: ', dynamicPlaylistId);
	};

	private watchUdpRequest = async (playlistVersion: () => number, filesLoop: () => boolean) => {
		this.sos.sync.onValue(async (_key, dynamicPlaylistConfig: DynamicPlaylist) => {
			console.log(
				`received udp request ${JSON.stringify(
					dynamicPlaylistConfig,
				)}, with timestamp ${Date.now()} and request id ${dynamicPlaylistConfig.requestUid}`,
			);

			const { dynamicPlaylistId, dynamicMedia } = getDynamicPlaylistAndId(dynamicPlaylistConfig, this.smilObject);

			if (!dynamicPlaylistId || !dynamicMedia) {
				debug('Dynamic playlist for %s was not found', `${dynamicPlaylistConfig.data}`);
				return;
			}

			if (!this.synchronization.shouldSync) {
				debug(
					'Synchronization is turned off for playlist: %s with sync set to: %s',
					dynamicPlaylistId,
					this.synchronization.shouldSync,
				);
			}

			if (!this.dynamicPlaylist[dynamicPlaylistId]) {
				this.dynamicPlaylist[dynamicPlaylistId] = {} as DynamicPlaylistElement;
			}

			if (this.dynamicPlaylist[dynamicPlaylistId]?.isMaster) {
				return;
			}

			if (this.dynamicPlaylist[dynamicPlaylistId]?.play && dynamicPlaylistConfig.action === 'start') {
				console.log('Dynamic playlist is already playing: ', dynamicPlaylistId);
				return;
			}

			const currentDynamicPlaylist = this.dynamicPlaylist[dynamicPlaylistId];
			currentDynamicPlaylist.play = true;

			if (dynamicPlaylistConfig.action === 'end') {
				// masters sends end to all at the start even when it was not played yet
				if (!currentDynamicPlaylist || !currentDynamicPlaylist.play) {
					debug('Dynamic playlist was already cancelled');
					return;
				}
				currentDynamicPlaylist.play = false;

				// cancel wait for dynamic playlist sync to avoid deadlocks
				await this.sos.sync.cancelWait(
					`${this.synchronization.syncGroupName}-fullScreenTrigger-${dynamicPlaylistConfig.syncId}`,
				);

				if (this.currentlyPlayingPriority[currentDynamicPlaylist?.regionInfo?.regionName]) {
					for (const elem of this.currentlyPlayingPriority[currentDynamicPlaylist?.regionInfo?.regionName]) {
						if (elem && elem.media.dynamicValue === dynamicPlaylistConfig.data) {
							debug('Cancelling dynamic playlist with dynamic value %s', dynamicPlaylistConfig.data);
							elem.player.playing = false;
						}
					}
				}

				if (this.currentlyPlayingPriority[currentDynamicPlaylist?.parentRegion]) {
					for (const elem of this.currentlyPlayingPriority[currentDynamicPlaylist?.parentRegion]) {
						if (elem && elem.media.dynamicValue === dynamicPlaylistConfig.data) {
							debug('Cancelling dynamic playlist with dynamic value %s', dynamicPlaylistConfig.data);
							elem.player.playing = false;
						}
					}
				}
				set(this.currentlyPlaying, `${currentDynamicPlaylist?.regionInfo?.regionName}.playing`, false);
				console.log(
					'LEAVING GROUP SLAVE: ',
					`${this.synchronization.syncGroupName}-fullScreenTrigger-${dynamicPlaylistConfig.syncId}`,
				);
				return;
			}

			const priorityObject: PriorityObject = {
				priorityLevel: 1000,
				higher: 'stop',
				lower: 'defer',
				peer: 'defer',
			};

			// if another dynamic playlist is playing, wait for timeout to avoid race condition with default content
			for (const [, elem] of Object.entries(this.dynamicPlaylist)) {
				if (elem?.play) {
					debug('found active dynamic playlist: %O, waiting for timeout', elem);
					await sleep(300);
				}
			}

			if (dynamicPlaylistConfig.action === 'start') {
				// join sync group, fullScreenTrigger is default region for dynamic playlist right now
				await joinSyncGroup(
					this.sos,
					this.synchronization,
					`${this.synchronization.syncGroupName}-fullScreenTrigger-${dynamicPlaylistConfig.syncId}`,
				);
				console.log(
					'joined group 2',
					`${this.synchronization.syncGroupName}-fullScreenTrigger-${dynamicPlaylistConfig.syncId}`,
					Date.now(),
				);
			}

			const version = filesLoop() ? playlistVersion() : playlistVersion() + 1;

			await this.handleDynamicPlaylist(
				dynamicPlaylistId,
				dynamicPlaylistConfig,
				dynamicMedia,
				version,
				'',
				0,
				priorityObject,
			);
		});
	};

	private watchSyncTriggers = async () => {
		this.sos.sync.onStatus(async (onStatus) => {
			// TODO: fix in sync server, connectedPeers is undefined
			debug('received onStatus: %O', onStatus);
			// if (onStatus.groupName !== 'samsung-fullScreenTrigger') {
			// 	return;
			// }
			// if (!onStatus.connectedPeers) {
			// 	// debug('received undefined connectedPeers: %O', onStatus);
			// 	return;
			// }
			// onStatus.connectedPeers = onStatus.connectedPeers
			// 	.filter((el: string) => el !== null && el !== 'null')
			// 	.sort();
			//
			// if (onStatus.connectedPeers.length === 0) {
			// 	return;
			// }
			//
			// // // bp - behaviour
			// if (onStatus.connectedPeers.length === this.synchronization.syncGroupIds.length) {
			// 	debug(
			// 		'All devices are connected, starting sync',
			// 		onStatus.connectedPeers,
			// 		this.synchronization.syncGroupIds,
			// 	);
			// 	this.synchronization.shouldSync = true;
			// 	return;
			// }
			//
			// // bp - behaviour
			// if (
			// 	onStatus.connectedPeers.length < this.synchronization.syncGroupIds.length &&
			// 	this.synchronization.shouldSync
			// ) {
			// 	debug(
			// 		'Some devices disconnected, stopping sync',
			// 		onStatus.connectedPeers,
			// 		this.synchronization.syncGroupIds,
			// 	);
			// 	this.synchronization.shouldSync = false;
			// 	for (const [, currentDynamicPlaylist] of Object.entries(this.dynamicPlaylist)) {
			// 		if (!currentDynamicPlaylist || !currentDynamicPlaylist.play) {
			// 			debug('Dynamic playlist was already cancelled');
			// 			return;
			// 		}
			// 		clearInterval(currentDynamicPlaylist.intervalId);
			// 		currentDynamicPlaylist.play = false;
			//
			// 		if (this.currentlyPlayingPriority[currentDynamicPlaylist?.regionInfo?.regionName]) {
			// 			for (const elem of this.currentlyPlayingPriority[
			// 				currentDynamicPlaylist?.regionInfo?.regionName
			// 			]) {
			// 				if (elem && elem.media.dynamicValue === currentDynamicPlaylist.dynamicConfig.data) {
			// 					debug(
			// 						'Cancelling dynamic playlist with dynamic value %s',
			// 						currentDynamicPlaylist.dynamicConfig.data,
			// 					);
			// 					elem.player.playing = false;
			// 				}
			// 			}
			// 		}
			//
			// 		if (this.currentlyPlayingPriority[currentDynamicPlaylist?.parentRegion]) {
			// 			for (const elem of this.currentlyPlayingPriority[currentDynamicPlaylist?.parentRegion]) {
			// 				if (elem && elem.media.dynamicValue === currentDynamicPlaylist.dynamicConfig.data) {
			// 					debug(
			// 						'Cancelling dynamic playlist with dynamic value %s',
			// 						currentDynamicPlaylist.dynamicConfig.data,
			// 					);
			// 					elem.player.playing = false;
			// 				}
			// 			}
			// 		}
			// 		set(this.currentlyPlaying, `${currentDynamicPlaylist?.regionInfo?.regionName}.playing`, false);
			// 		if (!currentDynamicPlaylist.isMaster) {
			// 			debug('Cancelling dynamic playlist on slave device: %O', currentDynamicPlaylist);
			// 			await this.cancelPreviousMedia({
			// 				regionName: 'fullScreenTrigger',
			// 			} as RegionAttributes);
			// 		}
			// 	}
			// }

			// no chickfile behaviour
			return;

			// back to normal, cancel all triggers - chickFile behaviour
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

			// chickFile behaviour
			if (onStatus.connectedPeers.length < this.synchronization.syncGroupIds.length) {
				this.synchronization.shouldSync = false;
				const missingIds = this.synchronization.syncGroupIds
					.filter((elem) => !onStatus.connectedPeers.includes(elem))
					.sort();

				if (missingIds.length > 0) {
					let syncTriggerId = missingIds.sort().join('');

					const triggerInfo =
						this.smilObject.triggerSensorInfo[`${SMILTriggersEnum.syncPrefix}-${syncTriggerId}`];

					if (
						!isNil(this.smilObject.triggerSensorInfo[`${SMILTriggersEnum.syncPrefix}-${syncTriggerId}`]) &&
						!this.triggersEndless[triggerInfo.trigger]?.play
					) {
						debug('Starting trigger: %O', triggerInfo.trigger);
						set(this.triggersEndless, `${triggerInfo.trigger}.latestEventFired`, Date.now());

						const triggerMedia = this.smilObject.triggers[triggerInfo.trigger];
						const stringDuration = findDuration(triggerMedia);
						if (!isNil(stringDuration)) {
							await this.processTriggerDuration(triggerInfo, triggerMedia, stringDuration!);
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

	// @ts-ignore
	private findTriggerPlaylistRegionInfo(elem: PlaylistElement): RegionAttributes | undefined {
		let regionInfo: RegionAttributes | undefined;
		for (let [key, value] of Object.entries(elem)) {
			if (key === 'regionInfo') {
				regionInfo = value as RegionAttributes;
			}

			if (isObject(value)) {
				regionInfo = this.findTriggerPlaylistRegionInfo(value) ?? regionInfo;
			}
		}
		return regionInfo;
	}

	private watchRfidAntena = async () => {
		let serialPort;
		try {
			if (this.smilObject.sensors.length === 0) {
				throw new Error(
					'No sensors specified for nexmosphere triggers: ' + JSON.stringify(this.smilObject.sensors),
				);
			}

			serialPort = await this.sos.hardware.openSerialPort({
				device: this.sos.config.serialPortDevice ?? SMILTriggersEnum.nexmoDevice,
				baudRate: SMILTriggersEnum.nexmoBaudRate as number,
			});
		} catch (err) {
			debug('Error occurred during Nexmosphere trigger initialization: %O', err);
			// TODO: return back after debuging
			// await this.files.sendGeneralErrorReport(err.message);
			return;
		}

		// @ts-ignore
		const nexmosphere = new Nexmosphere(serialPort);
		const sensorArray = [];

		for (const sensor of this.smilObject.sensors) {
			if (sensor.driver === SMILTriggersEnum.sensorNexmo && sensor.type === SMILTriggersEnum.sensorRfid) {
				// sensor does not have address
				if (isNil(sensor.address)) {
					debug('Sensor %O does not have address specified.', sensor);
					continue;
				}

				sensorArray.push(nexmosphere.createRfidAntenna(parseInt(sensor.address!)));

				sensorArray[sensorArray.length - 1].on(RfidAntennaEvent.PICKED, async (tag: number) => {
					try {
						await this.processRfidAntenna(this.smilObject, sensor, tag, RfidAntennaEvent.PICKED);
					} catch (err) {
						debug('Unexpected error occurred at sensor: %O with tag: %s', sensor, tag);
						await this.files.sendGeneralErrorReport(err.message);
					}
				});
				sensorArray[sensorArray.length - 1].on(RfidAntennaEvent.PLACED, async (tag: number) => {
					try {
						await this.processRfidAntenna(this.smilObject, sensor, tag, RfidAntennaEvent.PLACED);
					} catch (err) {
						debug('Unexpected error occurred at sensor: %O with tag: %s', sensor, tag);
						await this.files.sendGeneralErrorReport(err.message);
					}
				});
			}
		}
	};

	private watchOnTouchOnClick = () => {
		window.parent.document.addEventListener(SMILTriggersEnum.mouseEventType, async () => {
			await this.processOnTouchOnClick();
		});

		document.addEventListener(SMILTriggersEnum.mouseEventType, async () => {
			await this.processOnTouchOnClick();
		});

		window.parent.document.addEventListener(SMILTriggersEnum.touchEventType, async () => {
			await this.processOnTouchOnClick();
		});

		document.addEventListener(SMILTriggersEnum.touchEventType, async () => {
			await this.processOnTouchOnClick();
		});
	};

	private processOnTouchOnClick = async () => {
		const triggerInfo = this.smilObject.triggerSensorInfo[`${SMILTriggersEnum.mousePrefix}`];

		// smil file does not support mouse/touch events
		if (isNil(triggerInfo)) {
			debug('Mouse trigger for %s was not found', `${SMILTriggersEnum.mousePrefix}`);
			return;
		}

		set(this.triggersEndless, `${triggerInfo.trigger}.latestEventFired`, Date.now());

		const triggerMedia = this.smilObject.triggers[triggerInfo.trigger];

		if (this.triggersEndless[triggerInfo.trigger]?.play) {
			if (triggerMedia.seq?.end === triggerInfo.trigger) {
				const currentTrigger = this.triggersEndless[triggerInfo.trigger];
				currentTrigger.play = false;
				await this.cancelPreviousMedia(currentTrigger.regionInfo);
			}
			return;
		}

		if (!isNil(this.smilObject.triggerSensorInfo[`${SMILTriggersEnum.mousePrefix}`]) && !isNil(triggerMedia)) {
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

	private watchKeyboardInput = () => {
		let state = {
			buffer: [],
			lastKeyTime: Date.now(),
		};

		window.parent.document.addEventListener(SMILTriggersEnum.keyboardEventType, async (event) => {
			state = await this.processKeyDownEvent(event, state);
		});

		document.addEventListener(SMILTriggersEnum.keyboardEventType, async (event) => {
			state = await this.processKeyDownEvent(event, state);
		});
	};

	private processKeyDownEvent = async (event: KeyboardEvent, state: any): Promise<any> => {
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

			for (let [triggerId] of Object.entries(this.smilObject.triggerSensorInfo)) {
				const trimmedTriggerId = triggerId.replace(`${SMILTriggersEnum.keyboardPrefix}-`, '');
				if (bufferString.startsWith(trimmedTriggerId)) {
					bufferString = trimmedTriggerId;
				}
			}
		}

		const triggerInfo = this.smilObject.triggerSensorInfo[`${SMILTriggersEnum.keyboardPrefix}-${bufferString}`];

		if (isNil(triggerInfo)) {
			state = { buffer: buffer, lastKeyTime: currentTime };
			return state;
		}

		// regenerate time when was trigger last called
		set(this.triggersEndless, `${triggerInfo.trigger}.latestEventFired`, Date.now());
		const triggerMedia = this.smilObject.triggers[triggerInfo.trigger];

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
		priorityObject: PriorityObject = {} as PriorityObject,
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
					await this.processPlaylist(
						triggerMedia,
						SMILScheduleEnum.triggerPlaylistVersion,
						'',
						0,
						priorityObject,
					);
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
		priorityObject: PriorityObject = {} as PriorityObject,
	) => {
		const triggerRandom = getRandomInt(100000);
		const currentTrigger = this.triggersEndless[triggerInfo.trigger];

		currentTrigger.play = true;
		currentTrigger.syncCanceled = false;
		currentTrigger.triggerRandom = triggerRandom;

		await this.processPlaylist(triggerMedia, SMILScheduleEnum.triggerPlaylistVersion, '', 0, priorityObject);
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
			// region is empty or media playing in it are not defined as trigger media or dynamic playlist
			if (
				!currentRegion?.playing ||
				!currentRegion[SMILTriggersEnum.triggerValue] ||
				!currentRegion[SMILDynamicEnum.dynamicValue]
			) {
				set(this.currentlyPlaying, `${region.regionName}.playing`, true);
				return index;
			}
			index += 1;
		}
		return 0;
	}
}
