/* tslint:disable:Unnecessary semicolon missing whitespace */
import { SMILMedia } from '../../../models/mediaModels';
import { Deferred } from '../tools/Deferred';
import { getConfigString, sleep } from '../tools/generalTools';
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
import { ISos } from '../../../models/sosModels';
import { FilesManager } from '../../files/filesManager';
import set = require('lodash/set');
import Debug from 'debug';
import { PlaylistCommon } from '../playlistCommon/playlistCommon';
import { PlaylistElement, PlaylistOptions } from '../../../models/playlistModels';
import { BinaryOperatorChar } from '../../../enums/conditionalEnums';
import { IPlaylistTriggers } from './IPlaylistTriggers';
import { PriorityObject } from '../../../models/priorityModels';
import { PriorityRule } from '../../../enums/priorityEnums';
import { DynamicPlaylist, DynamicPlaylistElement, DynamicPlaylistEndless } from '../../../models/dynamicModels';
import { SMILDynamicEnum } from '../../../enums/dynamicEnums';
import { CurrentlyPlayingRegion } from '../../../models/playlistModels';
import { StatusEvent } from '@signageos/front-applet/es6/FrontApplet/Sync/syncEvents';
import { getDynamicPlaylistAndId } from '../tools/dynamicPlaylistTools';
import { joinSyncGroup } from '../tools/dynamicTools';

const debug = Debug('@signageos/smil-player:playlistTriggers');

export class PlaylistTriggers extends PlaylistCommon implements IPlaylistTriggers {
	public readonly triggersEndless: TriggerEndless = {};
	public readonly dynamicPlaylist: DynamicPlaylistEndless = {};
	public smilObject: SMILFileObject;
	private readonly processPlaylist: Function;

	private cancelAllInRegion?: (regionName: string, filter?: (entry: CurrentlyPlayingRegion) => boolean) => void;

	constructor(
		sos: ISos,
		files: FilesManager,
		options: PlaylistOptions,
		processPlaylist: Function,
		cancelAllInRegion?: (regionName: string, filter?: (entry: CurrentlyPlayingRegion) => boolean) => void,
	) {
		super(sos, files, options);
		this.processPlaylist = processPlaylist;
		this.cancelAllInRegion = cancelAllInRegion;
	}

	public watchTriggers = async (
		smilObject: SMILFileObject,
		playlistVersion: () => number,
		filesLoop: () => boolean,
	) => {
		this.smilObject = smilObject;
		this.watchKeyboardInput();
		this.watchOnTouchOnClick();
		this.watchWidgetTriggers();
		await this.watchRfidAntena();
		// handles if some devices dies in sync
		await this.watchSyncTriggers();
		// handles slaves dynamic playback
		await this.watchUdpRequest(playlistVersion, filesLoop);
		// stops slave dynamic playback if master stops sending messages
		await this.watchIfDynamicStillActive();
		// restarts applet if node.js service in background dies
		await this.watchSyncServerError();
	};

	/**
	 * Function responsible for dynamic assigment of nested regions for trigger playlists
	 * @param media - playlist to be played
	 * @param element - html element in DOM ( image, widget )
	 */
	public handleTriggers = async (media: SMILMedia, element: HTMLElement | undefined = undefined) => {
		let regionInfo = media.regionInfo;
		await sleep(50);
		while (
			!(
				media.hasOwnProperty(SMILTriggersEnum.triggerValue) ||
				media.hasOwnProperty(SMILDynamicEnum.dynamicValue)
			) &&
			this.isRegionOrNestedActive(regionInfo)
		) {
			await this.waitForRegionChange();
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
				const cachedRegion = this.triggersEndless[media.triggerValue as string]?.regionInfo;
				regionInfo = cachedRegion ?? regionInfo.region[this.findFirstFreeRegion(regionInfo.region)];

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

			debug('[trigger] found free region: region=%s, src=%s', regionInfo.regionName, media.src);

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
		this.dynamicPlaylist[dynamicPlaylistId].dynamicPlaylistId = dynamicPlaylistId;

		const currentDynamicPlaylist = this.dynamicPlaylist[dynamicPlaylistId];
		const dynamicRandom = getRandomInt(100000);

		for (const [key, value] of Object.entries(this.smilObject.dynamic)) {
			if (value.seq?.end === dynamicPlaylistId && this.dynamicPlaylist[key]?.play) {
				this.dynamicPlaylist[key].play = false;
				debug('[trigger-dynamic] cancelling previous: id=%s, replacedBy=%s', key, dynamicPlaylistId);
				await this.cancelPreviousMedia(this.dynamicPlaylist[key].regionInfo);
			}
		}

		currentDynamicPlaylist.dynamicRandom = dynamicRandom;
		currentDynamicPlaylist.play = true;
		debug('[trigger-dynamic] starting: id=%s', dynamicPlaylistId);
		await this.processPlaylist(dynamicMedia, version, parent, endTime, priorityObject, conditionalExpr);
		debug('[trigger-dynamic] finished: id=%s', dynamicPlaylistId);
	};

	private cancelDynamicPlaylistSlave = async (dynamicPlaylistId: string, dynamicPlaylistConfig?: DynamicPlaylist) => {
		const currentDynamicPlaylist = this.dynamicPlaylist[dynamicPlaylistId];
		// masters sends end to all at the start even when it was not played yet
		if (!currentDynamicPlaylist || !currentDynamicPlaylist.play) {
			debug('[trigger-dynamic] already cancelled: id=%s', dynamicPlaylistId);
			return;
		}
		currentDynamicPlaylist.play = false;

		// cancel wait for dynamic playlist sync to avoid deadlocks
		if (dynamicPlaylistConfig?.syncId) {
			try {
				await this.sos.sync.cancelWait(
					`${this.synchronization.syncGroupName}-fullScreenTrigger-${dynamicPlaylistConfig.syncId}`,
				);
			} catch (err) {
				debug('[trigger-dynamic] cancel wait failed: id=%s, error=%O', dynamicPlaylistId, err);
			}
		}

		const dynamicData = dynamicPlaylistConfig?.data;
		const dynamicFilter = (e: CurrentlyPlayingRegion) => !!e.media.dynamicValue && e.media.dynamicValue === dynamicData;

		if (this.cancelAllInRegion) {
			if (currentDynamicPlaylist?.regionInfo?.regionName) {
				this.cancelAllInRegion(currentDynamicPlaylist.regionInfo.regionName, dynamicFilter);
			}
			if (currentDynamicPlaylist?.parentRegion) {
				this.cancelAllInRegion(currentDynamicPlaylist.parentRegion, dynamicFilter);
			}
		}
		set(this.currentlyPlaying, `${currentDynamicPlaylist?.regionInfo?.regionName}.playing`, false);
		this.notifyRegionChange();
		return;
	};

	private watchIfDynamicStillActive = async () => {
		while (true) {
			for (const dynamic of Object.values(this.dynamicPlaylist)) {
				if (dynamic.play && dynamic.latestEventFired + 2500 < Date.now() && !dynamic.isMaster && dynamic.dynamicConfig) {
					debug('[trigger-dynamic] inactive: id=%s', dynamic.dynamicPlaylistId);
					await this.cancelDynamicPlaylistSlave(dynamic.dynamicPlaylistId, dynamic.dynamicConfig);
				}
			}
			await sleep(1000);
		}
	};

	private watchSyncServerError = async () => {
		this.sos.sync.onClosed(async (error?: Error) => {
			if (error) {
				try {
					await this.files.sendGeneralErrorReport(`Sync closed with error ${error}`);
					await sleep(5e3);
					await this.sos.management.power.appRestart();
				} catch (e) {
					debug('[trigger] restart failed: error=%O', e);
				}
			}
		});
	};

	private watchUdpRequest = async (playlistVersion: () => number, filesLoop: () => boolean) => {
		this.sos.sync.onValue(async (_key, dynamicPlaylistConfig: DynamicPlaylist) => {
			debug(
				'[trigger-dynamic] received udp request: action=%s, data=%s, requestId=%s',
				dynamicPlaylistConfig.action,
				dynamicPlaylistConfig.data,
				dynamicPlaylistConfig.requestUid ?? 'unknown',
			);

			if (!dynamicPlaylistConfig?.data) {
				debug('[trigger-dynamic] skipping udp request: data is undefined');
				return;
			}

			const { dynamicPlaylistId, dynamicMedia } = getDynamicPlaylistAndId(dynamicPlaylistConfig, this.smilObject);

			if (!dynamicPlaylistId || !dynamicMedia) {
				debug('[trigger-dynamic] playlist not found: data=%s', dynamicPlaylistConfig.data);
				return;
			}

			// turn on sync for slave device if master starts sending sync events
			this.synchronization.shouldSync = true;

			if (!this.dynamicPlaylist[dynamicPlaylistId]) {
				this.dynamicPlaylist[dynamicPlaylistId] = {} as DynamicPlaylistElement;
			}

			if (this.dynamicPlaylist[dynamicPlaylistId]?.isMaster) {
				return;
			}

			if (dynamicPlaylistConfig.action === 'start') {
				// record last call from master
				this.dynamicPlaylist[dynamicPlaylistId].latestEventFired = Date.now();
				if (this.dynamicPlaylist[dynamicPlaylistId]?.play) {
					debug('[trigger-dynamic] already playing, skipping: id=%s', dynamicPlaylistId);
					return;
				}
			}

			const currentDynamicPlaylist = this.dynamicPlaylist[dynamicPlaylistId];
			currentDynamicPlaylist.play = true;

			if (dynamicPlaylistConfig.action === 'end') {
				await this.cancelDynamicPlaylistSlave(dynamicPlaylistId, dynamicPlaylistConfig);
				return;
			}

			const priorityObject: PriorityObject = {
				priorityLevel: 1000,
				maxPriorityLevel: 1000,
				higher: PriorityRule.stop,
				lower: PriorityRule.defer,
				peer: PriorityRule.defer,
			};

			// if another dynamic playlist is playing, wait for timeout to avoid race condition with default content
			for (const [, elem] of Object.entries(this.dynamicPlaylist)) {
				if (elem?.play && elem?.dynamicPlaylistId !== dynamicPlaylistId) {
					debug(
						'[trigger-dynamic] found active playlist: id=%s, waiting before starting: id=%s',
						elem.dynamicPlaylistId,
						dynamicPlaylistId,
					);
					await sleep(300);
				}
			}

			if (dynamicPlaylistConfig.action === 'start' && dynamicPlaylistConfig.syncId) {
				// join sync group, fullScreenTrigger is default region for dynamic playlist right now
				await joinSyncGroup(
					this.sos,
					this.synchronization,
					`${this.synchronization.syncGroupName}-fullScreenTrigger-${dynamicPlaylistConfig.syncId}`,
				);
				debug(
					'[trigger-dynamic] joined sync group: group=%s',
					`${this.synchronization.syncGroupName}-fullScreenTrigger-${dynamicPlaylistConfig.syncId}`,
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
			try {
				debug('[trigger-sync] received status: group=%s, peers=%d', onStatus.groupName, onStatus.connectedPeers?.length ?? 0);
				if (!onStatus.connectedPeers) {
					// debug('received undefined connectedPeers: %O', onStatus);
					return;
				}

				onStatus.connectedPeers = onStatus.connectedPeers
					.filter((el: string) => el !== null && el !== 'null')
					.sort();

				if (onStatus.connectedPeers.length === 0) {
					return;
				}

				// smil xml file has failover triggers defined, use it if one or more devices are not connected in sync group
				if (Object.keys(this.triggersEndless).length > 0) {
					await this.handleSyncTriggersFailover(onStatus);
					return;
				}

				// turn off sync and play default content if one or more devices are not connected in sync group
				await this.handleSyncTriggers(onStatus);
			} catch (err) {
				debug('[trigger-sync] error processing status: error=%O', err);
			}
		});
	};

	private handleSyncTriggers = async (onStatus: StatusEvent) => {
		if (
			onStatus.groupName &&
			onStatus.groupName.indexOf('fullScreenTrigger') > -1 &&
			onStatus.groupName !== `${this.synchronization.syncGroupName}-fullScreenTrigger`
		) {
			debug('[trigger-sync] skipping non-root group: group=%s', onStatus.groupName);
			return;
		}

		if (onStatus.connectedPeers.length === this.synchronization.syncGroupIds.length) {
			debug(
				'[trigger-sync] all devices connected, enabling sync: peers=%d, expected=%d',
				onStatus.connectedPeers.length,
				this.synchronization.syncGroupIds.length,
			);
			this.synchronization.shouldSync = true;
			return;
		}

		if (
			onStatus.connectedPeers.length < this.synchronization.syncGroupIds.length &&
			this.synchronization.shouldSync
		) {
			debug(
				'[trigger-sync] devices disconnected, disabling sync: peers=%d, expected=%d',
				onStatus.connectedPeers.length,
				this.synchronization.syncGroupIds.length,
			);
			this.synchronization.shouldSync = false;
			for (const [, currentDynamicPlaylist] of Object.entries(this.dynamicPlaylist)) {
				clearInterval(currentDynamicPlaylist.intervalId);
				debug('[trigger-sync] clearing interval: id=%s', currentDynamicPlaylist.dynamicPlaylistId);
				if (!currentDynamicPlaylist || !currentDynamicPlaylist.play) {
					debug('[trigger-sync] already cancelled: id=%s', currentDynamicPlaylist?.dynamicPlaylistId);
					return;
				}
				currentDynamicPlaylist.play = false;

				const dynamicData = currentDynamicPlaylist.dynamicConfig?.data;
				const dynamicFilter = (e: CurrentlyPlayingRegion) => !!e.media.dynamicValue && e.media.dynamicValue === dynamicData;

				if (this.cancelAllInRegion) {
					if (currentDynamicPlaylist?.regionInfo?.regionName) {
						this.cancelAllInRegion(currentDynamicPlaylist.regionInfo.regionName, dynamicFilter);
					}
					if (currentDynamicPlaylist?.parentRegion) {
						this.cancelAllInRegion(currentDynamicPlaylist.parentRegion, dynamicFilter);
					}
				}
				set(this.currentlyPlaying, `${currentDynamicPlaylist?.regionInfo?.regionName}.playing`, false);
				this.notifyRegionChange();
				if (!currentDynamicPlaylist.isMaster) {
					debug('[trigger-sync] cancelling on slave: id=%s', currentDynamicPlaylist.dynamicPlaylistId);
					await this.cancelPreviousMedia({
						regionName: 'fullScreenTrigger',
					} as RegionAttributes);
				}
			}
		}
	};

	private handleSyncTriggersFailover = async (onStatus: StatusEvent) => {
		// back to normal, cancel all triggers - chickFile behaviour
		if (onStatus.connectedPeers.length === this.synchronization.syncGroupIds.length) {
			for (const trigger in this.triggersEndless) {
				this.triggersEndless[trigger].play = false;
				this.triggersEndless[trigger].cancelDeferred?.resolve();
				this.triggersEndless[trigger].syncCanceled = true;
				// stop fullscreen trigger
				set(this.currentlyPlaying, `fullScreenTrigger.player`, 'stop');
			}
			this.notifyRegionChange();
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
					debug('[trigger-sync] starting failover trigger: trigger=%s', triggerInfo.trigger);
					set(this.triggersEndless, `${triggerInfo.trigger}.latestEventFired`, Date.now());

					const triggerMedia = this.smilObject.triggers[triggerInfo.trigger];
					const stringDuration = findDuration(triggerMedia);
					if (!isNil(stringDuration)) {
						await this.processTriggerDuration(triggerInfo, triggerMedia, stringDuration!);
					} else {
						await this.processTriggerRepeatCount(triggerInfo, triggerMedia);
					}
				} else {
					debug('[trigger-sync] failover trigger already playing, skipping');
				}
			} else {
				debug('[trigger-sync] no matching trigger found, cancelling active triggers');
				for (const trigger in this.triggersEndless) {
					this.triggersEndless[trigger].play = false;
					this.triggersEndless[trigger].syncCanceled = true;
					set(this.currentlyPlaying, `fullScreenTrigger.player`, 'stop');
				}
				this.notifyRegionChange();
			}
		}
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

	private watchWidgetTriggers = () => {
		debug('[trigger-widget] watching widget triggers');
		window.addEventListener(
			'sosEvent',
			async (event: CustomEvent) => {
				if (!event.detail || isObject(event.detail)) {
					debug('[trigger-widget] invalid widget event data: detail=%O', event.detail);
					return;
				}

				const triggerId =
					this.smilObject.triggerSensorInfo[`${SMILTriggersEnum.widgetPrefix}-${event.detail}`].trigger;
				// Widgets triggers do not have info specified in smil xml header, only in playlist
				const triggerInfo = {
					trigger: triggerId,
				};

				const triggerMedia = this.smilObject.triggers[triggerId];
				debug('[trigger-widget] received widget event: trigger=%s', triggerId);

				set(this.triggersEndless, `${triggerId}.latestEventFired`, Date.now());

				// Already playing — handle end-condition toggle or skip
				if (this.triggersEndless[triggerId]?.play) {
					if (triggerMedia.seq?.end === triggerId) {
						debug('[trigger-widget] cancelling via end-condition toggle: trigger=%s, region=%s', triggerId, this.triggersEndless[triggerId]?.regionInfo?.regionName);
						const currentTrigger = this.triggersEndless[triggerId];
						currentTrigger.play = false;
						currentTrigger.cancelDeferred?.resolve();
						if (currentTrigger.regionInfo) {
							debug('[trigger-widget] stopping media in region: region=%s, trigger=%s', currentTrigger.regionInfo.regionName, triggerId);
							await this.cancelPreviousMedia(currentTrigger.regionInfo);
						}
					} else {
						debug('[trigger-widget] already playing, skipping: trigger=%s', triggerId);
					}
					return;
				}

				const stringDuration = findDuration(triggerMedia);
				if (!isNil(stringDuration)) {
					debug('[trigger-widget] starting with duration: trigger=%s, duration=%s', triggerId, stringDuration);
					await this.processTriggerDuration(triggerInfo, triggerMedia, stringDuration);
					return;
				}
				debug('[trigger-widget] starting with repeatCount: trigger=%s', triggerId);
				await this.processTriggerRepeatCount(triggerInfo, triggerMedia);
			},
			false,
		);
	};

	private watchRfidAntena = async () => {
		let serialPort;
		try {
			if (this.smilObject.sensors.length === 0) {
				throw new Error(
					'No sensors specified for nexmosphere triggers: ' + JSON.stringify(this.smilObject.sensors),
				);
			}

			serialPort = await this.sos.hardware.openSerialPort({
				device: getConfigString(this.sos.config, 'serialPortDevice') ?? SMILTriggersEnum.nexmoDevice,
				baudRate: SMILTriggersEnum.nexmoBaudRate as number,
			});
		} catch (err) {
			debug('[trigger-rfid] initialization failed: error=%O', err);
			await this.files.sendGeneralErrorReport(err.message);
			return;
		}

		// @ts-ignore
		const nexmosphere = new Nexmosphere(serialPort);
		const sensorArray = [];

		for (const sensor of this.smilObject.sensors) {
			if (sensor.driver === SMILTriggersEnum.sensorNexmo && sensor.type === SMILTriggersEnum.sensorRfid) {
				// sensor does not have address
				if (isNil(sensor.address)) {
					debug('[trigger-rfid] sensor missing address: id=%s', sensor.id);
					continue;
				}

				sensorArray.push(nexmosphere.createRfidAntenna(parseInt(sensor.address!)));

				sensorArray[sensorArray.length - 1].on(RfidAntennaEvent.PICKED, async (tag: number) => {
					try {
						await this.processRfidAntenna(this.smilObject, sensor, tag, RfidAntennaEvent.PICKED);
					} catch (err) {
						debug('[trigger-rfid] error processing tag: sensor=%s, tag=%s, action=picked', sensor.id, tag);
						await this.files.sendGeneralErrorReport(err.message);
					}
				});
				sensorArray[sensorArray.length - 1].on(RfidAntennaEvent.PLACED, async (tag: number) => {
					try {
						await this.processRfidAntenna(this.smilObject, sensor, tag, RfidAntennaEvent.PLACED);
					} catch (err) {
						debug('[trigger-rfid] error processing tag: sensor=%s, tag=%s, action=placed', sensor.id, tag);
						await this.files.sendGeneralErrorReport(err.message);
					}
				});
			}
		}
	};

	private watchOnTouchOnClick = () => {
		try {
			window.parent.document.addEventListener(SMILTriggersEnum.mouseEventType, async () => {
				await this.processOnTouchOnClick();
			});

			window.parent.document.addEventListener(SMILTriggersEnum.touchEventType, async () => {
				await this.processOnTouchOnClick();
			});
		} catch (err) {
			debug('[trigger-mouse] failed to add event listener: error=%O', err);
		}

		document.addEventListener(SMILTriggersEnum.mouseEventType, async () => {
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
			debug('[trigger-mouse] no mouse trigger configured, skipping');
			return;
		}

		set(this.triggersEndless, `${triggerInfo.trigger}.latestEventFired`, Date.now());

		const triggerMedia = this.smilObject.triggers[triggerInfo.trigger];

		if (this.triggersEndless[triggerInfo.trigger]?.play) {
			if (triggerMedia.seq?.end === triggerInfo.trigger) {
				const currentTrigger = this.triggersEndless[triggerInfo.trigger];
				currentTrigger.play = false;
				currentTrigger.cancelDeferred?.resolve();
				if (currentTrigger.regionInfo) {
					await this.cancelPreviousMedia(currentTrigger.regionInfo);
				}
			}
			return;
		}

		if (!isNil(this.smilObject.triggerSensorInfo[`${SMILTriggersEnum.mousePrefix}`]) && !isNil(triggerMedia)) {
			addEventOnTriggerWidget(triggerMedia, this.triggersEndless, triggerInfo);
			const stringDuration = findDuration(triggerMedia);
			debug('[trigger-mouse] starting: trigger=%s, duration=%s', triggerInfo.trigger, stringDuration);
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

		try {
			window.parent.document.addEventListener(SMILTriggersEnum.keyboardEventType, async (event) => {
				state = await this.processKeyDownEvent(event, state);
			});
		} catch (err) {
			debug('[trigger-keyboard] failed to add event listener: error=%O', err);
		}

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
			if (bufferString.length > 0) {
				debug('[trigger-keyboard] buffering keystrokes: buffer=%s', bufferString);
			}
			state = { buffer: buffer, lastKeyTime: currentTime };
			return state;
		}

		debug('[trigger-keyboard] sequence matched: trigger=%s, buffer=%s', triggerInfo.trigger, bufferString);

		// regenerate time when was trigger last called
		set(this.triggersEndless, `${triggerInfo.trigger}.latestEventFired`, Date.now());
		const triggerMedia = this.smilObject.triggers[triggerInfo.trigger];

		if (!this.triggersEndless[triggerInfo.trigger]?.play) {
			buffer = [];
			debug('[trigger-keyboard] starting: trigger=%s', triggerInfo.trigger);

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
			currentTrigger.cancelDeferred?.resolve();
			if (currentTrigger.regionInfo) {
				await this.cancelPreviousMedia(currentTrigger.regionInfo);
			}
		}

		if (!FunctionKeys[key]) {
			state = { buffer: buffer, lastKeyTime: currentTime };
		}
		return state;
	};

	private processTriggerDuration = async (
		triggerInfo: { trigger: string },
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
		currentTrigger.cancelDeferred = new Deferred<void>();
		delete currentTrigger.regionInfo;

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
				// Re-check deadline after each sleep — latestEventFired is updated on re-trigger,
				// extending the deadline (e.g., 5s trigger re-fired at 3s plays until 8s total)
				while (currentTrigger.latestEventFired + durationMillis > Date.now() && currentTrigger.play) {
					const remaining = currentTrigger.latestEventFired + durationMillis - Date.now();
					await Promise.race([
						sleep(Math.max(0, remaining)),
						currentTrigger.cancelDeferred!.promise,
					]);
				}
				play = false;
			})(),
		);

		await Promise.race(promises);

		// trigger finished playing by itself, cancel it
		debug('[trigger-duration] cancelling, duration expired: trigger=%s', triggerInfo.trigger);
		const regionInfo = currentTrigger.regionInfo;
		if (regionInfo && currentTrigger.triggerRandom === triggerRandom && (currentTrigger.play || currentTrigger.syncCanceled)) {
			currentTrigger.play = false;
			currentTrigger.cancelDeferred?.resolve();
			await this.cancelPreviousMedia(regionInfo);
		}
	};

	private processTriggerRepeatCount = async (
		triggerInfo: { trigger: string },
		triggerMedia: TriggerObject,
		priorityObject: PriorityObject = {} as PriorityObject,
	) => {
		const triggerRandom = getRandomInt(100000);
		const currentTrigger = this.triggersEndless[triggerInfo.trigger];

		currentTrigger.play = true;
		currentTrigger.syncCanceled = false;
		currentTrigger.triggerRandom = triggerRandom;
		delete currentTrigger.regionInfo;

		await this.processPlaylist(triggerMedia, SMILScheduleEnum.triggerPlaylistVersion, '', 0, priorityObject);

		// Re-read from object — regionInfo was repopulated by handleTriggers() during processPlaylist
		const regionInfo = this.triggersEndless[triggerInfo.trigger]?.regionInfo;
		if (!regionInfo) return;

		await Promise.all(this.promiseAwaiting[regionInfo.regionName].promiseFunction!);

		// trigger finished playing by itself, cancel it
		debug('[trigger-repeatCount] cancelling, repeat count exhausted: trigger=%s', triggerInfo.trigger);

		if (currentTrigger.triggerRandom === triggerRandom && (currentTrigger.play || currentTrigger.syncCanceled)) {
			currentTrigger.play = false;
			currentTrigger.cancelDeferred?.resolve();
			await this.cancelPreviousMedia(regionInfo);
		}
	};

	private processRfidAntenna = async (
		smilObject: SMILFileObject,
		sensor: ParsedSensor,
		tag: number,
		action: string,
	) => {
		debug('[trigger-rfid] tag event: tag=%s, action=%s, sensor=%s', tag, action, sensor.id);
		const triggerInfo = smilObject.triggerSensorInfo[`${sensor.id}-${tag}`];
		// check if some conditions equals emitted parameters
		if (this.areTriggerConditionsMet(triggerInfo.condition, triggerInfo.stringCondition, action)) {
			const triggerMedia = smilObject.triggers[triggerInfo.trigger];
			await this.processTriggerRepeatCount(triggerInfo, triggerMedia);
			return;
		}

		// if no condition to activate trigger was found, stop it if its already running
		if (!isNil(this.triggersEndless[triggerInfo.trigger])) {
			debug('[trigger-rfid] cancelling trigger, condition changed: trigger=%s', triggerInfo.trigger);
			const regionInfo = this.triggersEndless[triggerInfo.trigger].regionInfo;
			set(this.triggersEndless, `${triggerInfo.trigger}.play`, false);
			if (regionInfo) {
				await this.cancelPreviousMedia(regionInfo);
			}
			return;
		}

		debug('[trigger-rfid] no matching condition: trigger=%s, action=%s', triggerInfo.trigger, action);
	};

	private areTriggerConditionsMet(
		conditions: ParsedTriggerCondition[],
		logicCondition: string,
		action: string,
	): boolean {
		debug('[trigger] evaluating conditions: operator=%s, action=%s, count=%d', logicCondition, action, conditions.length);
		switch (logicCondition) {
			case BinaryOperatorChar.or:
				for (const condition of conditions) {
					if (condition.action === action) {
						debug('[trigger] condition result: matched=true, action=%s', action);
						return true;
					}
				}
				break;
			default:
				debug('[trigger] unsupported logic condition: operator=%s', logicCondition);
		}
		debug('[trigger] condition result: matched=false, action=%s', action);
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

		// check if any dynamic playlist is being played or prepared
		for (const [, value] of Object.entries(this.dynamicPlaylist)) {
			if (value.play && regionInfo.regionName === value.parentRegion) {
				return true;
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
				(!currentRegion[SMILTriggersEnum.triggerValue] &&
				!currentRegion[SMILDynamicEnum.dynamicValue])
			) {
				set(this.currentlyPlaying, `${region.regionName}.playing`, true);
				return index;
			}
			index += 1;
		}
		return 0;
	}
}
