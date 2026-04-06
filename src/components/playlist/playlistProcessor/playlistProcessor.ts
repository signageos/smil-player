/* tslint:disable:Unnecessary semicolon missing whitespace indent  tab indentation expected align   arguments are not aligned*/
import isNil = require('lodash/isNil');
import isObject = require('lodash/isObject');
import cloneDeep = require('lodash/cloneDeep');
import get = require('lodash/get');
import set = require('lodash/set');
import { PlaylistCommon } from '../playlistCommon/playlistCommon';
import { Deferred } from '../tools/Deferred';
import { ensurePlayingDeferred } from '../tools/deferredTools';
import { PlaylistTriggers } from '../playlistTriggers/playlistTriggers';
import { PlaylistPriority } from '../playlistPriority/playlistPriority';
import { IPlaylistPriority } from '../playlistPriority/IPlaylistPriority';
import { PlayingInfo, PlaylistElement, PlaylistOptions } from '../../../models/playlistModels';
import { IFile, IStorageUnit } from '@signageos/front-applet/es6/FrontApplet/FileSystem/types';
import { ISos } from '../../../models/sosModels';
import { FilesManager } from '../../files/filesManager';
import { MergedDownloadList, SMILFile, SMILFileObject } from '../../../models/filesModels';
import { HtmlEnum } from '../../../enums/htmlEnums';
import { FileStructure, smilLogging } from '../../../enums/fileEnums';
import {
	SMILIntro,
	SMILMedia,
	SMILVideo,
	SMILImage,
	SMILWidget,
	SMILTicker,
	SosHtmlElement,
	VideoParams,
} from '../../../models/mediaModels';
import {
	debug,
	getConfigString,
	getDefaultVideoParams,
	getIndexOfPlayingMedia,
	getRegionInfo,
	logDebug,
	removeDigits,
	sleep,
} from '../tools/generalTools';
import { SMILEnums } from '../../../enums/generalEnums';
import { isConditionalExpExpired } from '../tools/conditionalTools';
import { SMILScheduleEnum } from '../../../enums/scheduleEnums';
import { setElementDuration } from '../tools/scheduleTools';
import { PriorityObject } from '../../../models/priorityModels';
import { PriorityBehaviour, WaitStatus } from '../../../enums/priorityEnums';
import { RegionAttributes, RegionsObject } from '../../../models/xmlJsonModels';
import { SMILTriggersEnum } from '../../../enums/triggerEnums';
import { findTriggerToCancel } from '../tools/triggerTools';
import {
	isPriorityBlockedOrPaused,
	isWallclockEndTimeExpired,
	isTriggerCancelled,
	isDynamicPlaylistCancelled,
	shouldCancelForVersionUpdate,
	shouldCancelParentRegion,
} from './playlistProcessorDecisions';
import moment from 'moment';
import {
	changeZIndex,
	createHtmlElement,
	extractAttributesByPrefix,
	generateElementSrc,
	removeTransitionCss,
	setTransitionCss,
} from '../tools/htmlTools';
import Video from '@signageos/front-applet/es6/FrontApplet/Video/Video';
import Stream from '@signageos/front-applet/es6/FrontApplet/Stream/Stream';
import { defaults as config } from '../../../../config/parameters';
import { StreamEnums } from '../../../enums/mediaEnums';
import { SmilEventEmitter, waitForSuccessOrFailEvents } from '../eventEmitter/eventEmitter';
import { createLocalFilePath, getSmilVersionUrl, isWidgetUrl } from '../../files/tools';
import StreamProtocol from '@signageos/front-applet/es6/FrontApplet/Stream/StreamProtocol';
import { IPlaylistProcessor } from './IPlaylistProcessor';
import { DynamicPlaylist, DynamicPlaylistElement } from '../../../models/dynamicModels';
import { SMILDynamicEnum } from '../../../enums/dynamicEnums';
import { getDynamicPlaylistAndId } from '../tools/dynamicPlaylistTools';
import { broadcastSyncValue, cancelDynamicPlaylistMaster, joinSyncGroup } from '../tools/dynamicTools';
import {
	broadcastEndActionToAllDynamics,
	connectSyncSafe,
	hasDynamicContent,
	joinAllSyncGroupsOnSmilStart,
} from '../tools/syncTools';
import { startTickerAnimation } from '../tools/tickerTools';
import { ResourceChecker } from '../../files/resourceChecker/resourceChecker';
import { getStrategy } from '../../files/fetchingStrategies/fetchingStrategies';
import { SMILElementController, ProcessAction } from './SMILElementController';
import { TimedDebugger } from './TimedDebugger';
import { PlaylistTraverser, IPlaylistEngine } from './playlistTraverser';

export class PlaylistProcessor extends PlaylistCommon implements IPlaylistProcessor {
	private checkFilesLoop: boolean = true;
	private introFinished: Deferred<void> = new Deferred<void>();
	private readonly playerName: string;
	private readonly playerId: string;
	private triggers: PlaylistTriggers;
	private priority: IPlaylistPriority;
	private foundNewPlaylist: boolean = false;
	private playlistVersion: number = 0;
	private internalStorageUnit: IStorageUnit;
	private smilObject: SMILFileObject;
	private elementController: SMILElementController;
	private traverser: PlaylistTraverser;
	private readonly smilEventEmitter: SmilEventEmitter;

	constructor(
		sos: ISos,
		files: FilesManager,
		options: PlaylistOptions,
		overrides?: {
			triggers?: PlaylistTriggers;
			priority?: IPlaylistPriority;
		},
	) {
		super(sos, files, options);
		this.priority = overrides?.priority ?? new PlaylistPriority(options, sos);
		this.triggers = overrides?.triggers ?? new PlaylistTriggers(sos, files, options, this.processPlaylist,
			(regionName, filter) => this.priority.stateManager.cancelAllInRegion(regionName, filter));
		this.playerName = getConfigString(this.sos.config, 'playerName') ?? '';
		this.playerId = getConfigString(this.sos.config, 'playerId') ?? '';
		this.elementController = new SMILElementController(this.synchronization);
		this.traverser = new PlaylistTraverser(this.createEngine());
		this.smilEventEmitter = new SmilEventEmitter(sos);
	}

	private createEngine(): IPlaylistEngine {
		const self = this;
		return {
			config: {
				get playerName() { return self.playerName; },
				get playerId() { return self.playerId; },
				get defaultRepeatCount() { return self.smilObject?.defaultRepeatCount ?? ''; },
				get shouldSync() { return self.synchronization.shouldSync; },
			},
			actions: {
				playElement: self.playElement,
				priorityBehaviour: (value, elementKey, version, parent, endTime, priorityObject) =>
					self.priority.priorityBehaviour(value, elementKey, version, parent, endTime, priorityObject),
				storePriorityBounds: self.storePriorityBounds,
				coordinatePlayModeSync: (regionName, syncParentId, playModeParentId, previousIndex, randomPlaylist) =>
					self.elementController.coordinatePlayModeSync(regionName, syncParentId, playModeParentId, previousIndex, randomPlaylist),
				processDynamicPlaylist: self.processDynamicPlaylist,
			},
			control: {
				get randomPlaylist() { return self.randomPlaylist; },
				get dynamicPlaylist() { return self.triggers.dynamicPlaylist; },
				sleep,
				waitTimeoutOrFileUpdate: self.waitTimeoutOrFileUpdate,
				runEndlessLoop: self.runEndlessLoop,
				getPlaylistVersion: self.getPlaylistVersion,
				getCancelFunction: self.getCancelFunction,
				cleanupExpiredPriority: (v: number, p: number) => self.priority.stateManager.cleanupExpiredPriority(v, p),
			},
		};
	}

	public setCheckFilesLoop = (checkFilesLoop: boolean) => {
		this.checkFilesLoop = checkFilesLoop;
	};

	public setSmilObject = (smilObject: SMILFileObject) => {
		this.smilObject = smilObject;
	};

	public setStorageUnit = (internalStorageUnit: IStorageUnit) => {
		this.internalStorageUnit = internalStorageUnit;
	};

	public getCheckFilesLoop = () => {
		return this.checkFilesLoop;
	};

	public setPlaylistVersion = (num: number) => {
		this.playlistVersion = num;
	};

	public getPlaylistVersion = () => {
		return this.playlistVersion;
	};

	public setCancelFunction = (value: boolean, index: number) => {
		this.cancelFunction[index] = value;
		if (value) {
			this.cancelDeferred.resolve();
			this.cancelDeferred = new Deferred<void>();
		}
	};

	/**
	 * downloads intro media before actual playlist starts, returns identifier if intro is video or image
	 */
	public downloadIntro = async (): Promise<string> => {
		let introMedia: string = '';
		let fileStructure: string = '';
		let downloadPromises: Promise<void>[] = [];

		for (const property in this.smilObject.intro[0]) {
			if (property.startsWith(HtmlEnum.video)) {
				introMedia = property;
				fileStructure = FileStructure.videos;
			}

			if (property.startsWith(HtmlEnum.img)) {
				introMedia = property;
				fileStructure = FileStructure.images;
			}
		}

		const result = await this.files.parallelDownloadAllFiles(
			[this.smilObject.intro[0][introMedia]] as MergedDownloadList[],
			fileStructure,
			this.smilObject.refresh.timeOut,
			[],
			[],
			getStrategy(SMILEnums.lastModified),
		);
		downloadPromises = downloadPromises.concat(result.promises);

		// Get the mediaInfoObject for this file
		const mediaInfoObject = await this.files.getOrCreateMediaInfoFile([
			this.smilObject.intro[0][introMedia],
		] as MergedDownloadList[]);

		// Update the mediaInfoObject after download completes
		await this.files.updateMediaInfoAfterDownloads(mediaInfoObject, result.filesToUpdate);

		await Promise.all(downloadPromises);
		debug('[processor] intro media downloaded: src=%s', this.smilObject.intro[0]?.src);
		return introMedia;
	};

	/**
	 * plays intro media before actual playlist starts, default behaviour is to play video as intro
	 * @param introMedia - identifier if intro is video or image
	 */
	public playIntro = async (introMedia: string): Promise<Promise<void>[]> => {
		let imageElement: HTMLElement = document.createElement(HtmlEnum.img);

		const intro: SMILIntro = this.smilObject.intro[0];

		debug('[processor] intro media object: type=%s', removeDigits(introMedia));
		switch (removeDigits(introMedia)) {
			case HtmlEnum.img:
				if (imageElement.getAttribute('src') === null) {
					const imageIntro = intro[introMedia] as SMILImage;
					imageElement = await this.setupIntroImage(imageIntro, this.smilObject, introMedia);
					this.setCurrentlyPlaying(imageIntro, 'html', SMILEnums.defaultRegion);
				}
				break;
			default:
				const videoIntro = intro[introMedia] as SMILVideo;
				await this.setupIntroVideo(videoIntro, this.smilObject);
				this.setCurrentlyPlaying(videoIntro, 'video', SMILEnums.defaultRegion);
		}

		return this.playIntroLoop(introMedia, intro);
	};

	public processingLoop = async (smilFile: SMILFile, firstIteration: boolean, restart: () => void): Promise<void> => {
		const version = firstIteration ? this.getPlaylistVersion() : this.getPlaylistVersion() + 1;

		// setup sync before everything else
		await this.handleSyncSetup(firstIteration);

		const promises = [
			// File checking process
			this.handleFileChecking(smilFile, restart),
			// Playlist processing loop
			this.handlePlaylistLoop(version),

			// Trigger watching process
			this.triggers.watchTriggers(this.smilObject, this.getPlaylistVersion, this.getCheckFilesLoop),

			// Custom endpoint reports processing
			this.runEndlessLoop(async () => {
				await this.files.watchCustomEndpointReports();
			}, version),
		];

		await Promise.all(promises);
	};

	/**
	 * Recursively extracts all syncIndex values from a playlist element tree.
	 * Used to determine the min/max syncIndex bounds for a priority playlist.
	 * @param elem - The playlist element to traverse
	 * @returns Array of {syncIndex, regionName} objects found in the element tree
	 */
	private extractSyncIndicesFromElement = (
		elem: PlaylistElement | PlaylistElement[],
	): Array<{ syncIndex: number; regionName: string }> => {
		const indices: Array<{ syncIndex: number; regionName: string }> = [];

		if (Array.isArray(elem)) {
			for (const child of elem) {
				indices.push(...this.extractSyncIndicesFromElement(child));
			}
			return indices;
		}

		// Check if this element has a syncIndex and regionInfo (it's a media element)
		// Cast to Record for property check since PlaylistElement doesn't include media properties
		const record = elem as Record<string, unknown>;
		if ('syncIndex' in record && 'regionInfo' in record) {
			const syncIndex = record.syncIndex as number;
			const regionInfo = record.regionInfo as { regionName?: string };
			if (syncIndex !== undefined && regionInfo?.regionName) {
				indices.push({
					syncIndex,
					regionName: regionInfo.regionName,
				});
			}
		}

		// Recursively check all object properties for nested elements
		for (const value of Object.values(elem)) {
			if (isObject(value)) {
				indices.push(...this.extractSyncIndicesFromElement(value as PlaylistElement));
			}
		}

		return indices;
	};

	/**
	 * Extracts and stores the syncIndex bounds (min/max) for a priority playlist.
	 * Called during processPriorityTag to populate syncIndexBoundsPerPriority.
	 * @param elem - The priority class element containing media elements
	 * @param priorityLevel - The priority level for this element
	 */
	private storePriorityBounds = (elem: PlaylistElement, priorityLevel: number): void => {
		const indices = this.extractSyncIndicesFromElement(elem);
		if (indices.length === 0) {
			return;
		}

		// Group indices by region
		const indicesByRegion: { [regionName: string]: number[] } = {};
		for (const { syncIndex, regionName } of indices) {
			if (!indicesByRegion[regionName]) {
				indicesByRegion[regionName] = [];
			}
			indicesByRegion[regionName].push(syncIndex);
		}

		// Store min/max for each region
		for (const [regionName, regionIndices] of Object.entries(indicesByRegion)) {
			const min = Math.min(...regionIndices);
			const max = Math.max(...regionIndices);

			if (!this.synchronization.syncIndexBoundsPerPriority) {
				this.synchronization.syncIndexBoundsPerPriority = {};
			}
			if (!this.synchronization.syncIndexBoundsPerPriority[regionName]) {
				this.synchronization.syncIndexBoundsPerPriority[regionName] = {};
			}

			this.synchronization.syncIndexBoundsPerPriority[regionName][priorityLevel] = { min, max };
			debug(
				'[processor] stored priority bounds: region=%s, priority=%d, min=%d, max=%d',
				regionName,
				priorityLevel,
				min,
				max,
			);
		}
	};

	public processPriorityTag = async (
		value: PlaylistElement | PlaylistElement[],
		version: number,
		parent: string = '',
		endTime: number = 0,
		conditionalExpr: string = '',
	): Promise<Promise<void>[]> => {
		return this.traverser.processPriorityTag(value, version, parent, endTime, conditionalExpr);
	};

	public processExclTag = async (
		value: PlaylistElement | PlaylistElement[],
		version: number,
		parent: string = '',
		endTime: number = 0,
		conditionalExpr: string = '',
	): Promise<Promise<void>[]> => {
		return this.traverser.processExclTag(value, version, parent, endTime, conditionalExpr);
	};

	public processDynamicPlaylist = async (
		dynamicPlaylistConfig: DynamicPlaylist,
		version: number,
		parent: string = '',
		endTime: number = 0,
		priorityObject: PriorityObject = {} as PriorityObject,
		conditionalExpr: string = '',
	) => {
		try {
			debug('[processor] detected dynamic playlist: version=%s', version);
			if (!dynamicPlaylistConfig?.data) {
				debug('[processor] dynamic playlist config data is undefined, skipping');
				return;
			}

			if (version < this.getPlaylistVersion()) {
				debug('[processor] dynamic playlist version is older than current, skipping');
				await sleep(SMILScheduleEnum.defaultAwait);
				return;
			}

			const { dynamicPlaylistId, dynamicMedia } = getDynamicPlaylistAndId(dynamicPlaylistConfig, this.smilObject);

			if (!dynamicPlaylistId || !dynamicMedia) {
				debug('[processor] dynamic playlist not found: data=%s', `${dynamicPlaylistConfig.data}`);
				return;
			}

			if (!this.triggers.dynamicPlaylist[dynamicPlaylistId]) {
				this.triggers.dynamicPlaylist[dynamicPlaylistId] = {} as DynamicPlaylistElement;
			}

			if (this.triggers.dynamicPlaylist[dynamicPlaylistId]?.play) {
				debug('[processor] dynamic playlist already playing: id=%s, version=%s', dynamicPlaylistId, version);
				await sleep(300);
				return;
			}

			this.triggers.dynamicPlaylist[dynamicPlaylistId].isMaster = true;

			if (dynamicPlaylistConfig.syncId) {
				const syncGroupName = `${this.synchronization.syncGroupName}-fullScreenTrigger-${dynamicPlaylistConfig.syncId}`;
				await joinSyncGroup(this.sos, this.synchronization, syncGroupName);
				debug(
					'[processor] master dynamic playlist joining sync group: group=%s',
					syncGroupName,
				);
			}
			await broadcastSyncValue(
				this.sos,
				dynamicPlaylistConfig,
				`${this.synchronization.syncGroupName}-fullScreenTrigger`,
				'start',
			);

			const intervalId = setInterval(async () => {
				if (version >= this.getPlaylistVersion()) {
					await broadcastSyncValue(
						this.sos,
						dynamicPlaylistConfig,
						`${this.synchronization.syncGroupName}-fullScreenTrigger`,
						'start',
					);
				} else {
					clearInterval(intervalId);
				}
			}, 1000);

			// clear old interval, used in priority cancellations
			if (this.triggers.dynamicPlaylist[dynamicPlaylistId].intervalId) {
				clearInterval(this.triggers.dynamicPlaylist[dynamicPlaylistId].intervalId);
			}
			this.triggers.dynamicPlaylist[dynamicPlaylistId].intervalId = intervalId;

			try {
				await this.triggers.handleDynamicPlaylist(
					dynamicPlaylistId,
					dynamicPlaylistConfig,
					dynamicMedia,
					version,
					parent,
					endTime,
					priorityObject,
					conditionalExpr,
				);
			} catch (err) {
				debug('[processor] unexpected error during dynamic playlist trigger handling: %O', err);
				clearInterval(intervalId);
			}
		} catch (err) {
			debug('[processor] unexpected error during dynamic playlist playback: %O', err);
		}
	};

	public processPlaylist = async (
		playlist: PlaylistElement | PlaylistElement[],
		version: number,
		parent: string = '',
		endTime: number = 0,
		priorityObject: PriorityObject = {} as PriorityObject,
		conditionalExpr: string = '',
	): Promise<string | void> => {
		return this.traverser.processPlaylist(playlist, version, parent, endTime, priorityObject, conditionalExpr);
	};


	/**
	 * Processes a playlist version update - cancels old content and updates version tracking.
	 * Called BEFORE waiting for old promises to prevent V2 from getting stuck waiting for V1.
	 * This fixes a race condition where the new playlist would wait for old content's promises
	 * before reaching the version update code, causing the update to never happen.
	 * @param version - The new version that's starting
	 * @returns true if an update was processed, false otherwise
	 */
	protected processVersionUpdate = async (version: number): Promise<boolean> => {
		// Check if this is a version update: checkFilesLoop is false (update pending) and version is newer
		if (shouldCancelForVersionUpdate(this.getCheckFilesLoop(), version, this.getPlaylistVersion())) {
			debug(
				'[processor] processing version update: version=%s, playlistVersion=%s',
				version,
				this.getPlaylistVersion(),
			);

			// Update playlist version
			this.setPlaylistVersion(version);

			// Set cancel function for old version
			if (this.getPlaylistVersion() > 0) {
				debug('[processor] setting up cancel function for index: %s', this.getPlaylistVersion() - 1);
				this.setCancelFunction(true, this.getPlaylistVersion() - 1);
			}

			// Reset checkFilesLoop to indicate update was processed
			this.setCheckFilesLoop(true);

			// Reset foundNewPlaylist flag
			this.foundNewPlaylist = false;

			// Stop all currently playing content
			await this.stopAllContent();

			// Clear old promises for ALL regions since we just cancelled everything
			debug('[processor] clearing old promises for all regions after version update');
			this.priority.stateManager.resetAllPromiseAwaiting();

			// Cancel all playing entries to unblock any waiters (triggers notifyWaiters)
			for (const region in this.currentlyPlayingPriority) {
				this.priority.stateManager.cancelAllInRegion(region);
			}

			return true;
		}
		return false;
	};

	private checkRegionsForCancellation = async (
		element: SMILVideo | SosHtmlElement,
		regionInfo: RegionAttributes,
		parentRegion: RegionAttributes,
		version: number,
		timedDebug: TimedDebugger,
	) => {
		timedDebug.log('[processor] checking regions for cancellation: region=%s', regionInfo?.regionName);
		// failover fullscreen trigger or dynamic playlist
		if (
			regionInfo.regionName === 'fullScreenTrigger' &&
			(this.synchronization.shouldCancelAll ||
				(element.hasOwnProperty(SMILDynamicEnum.dynamicValue) && !this.currentlyPlaying.fullScreenTrigger))
		) {
			timedDebug.log('[processor] cancelling all content due to fullScreenTrigger: shouldCancelAll=%s, hasDynamic=%s',
				this.synchronization.shouldCancelAll, element.hasOwnProperty(SMILDynamicEnum.dynamicValue));
			this.synchronization.shouldCancelAll = false;
			await this.stopAllContent(false);
		}
		// newer playlist starts its playback, cancel older one
		// NOTE: This is a fallback path - version updates are now primarily handled in processVersionUpdate()
		// called from shouldWaitAndContinue() BEFORE waiting for old promises
		if (shouldCancelForVersionUpdate(this.getCheckFilesLoop(), version, this.getPlaylistVersion())) {
			timedDebug.log(
				'[processor] cancelling older playlist (fallback): version=%s, playlistVersion=%s',
				version,
				this.getPlaylistVersion(),
			);
			this.setPlaylistVersion(version);
			if (this.getPlaylistVersion() > 0) {
				timedDebug.log('[processor] setting up cancel function for index: %s', this.getPlaylistVersion() - 1);
				this.setCancelFunction(true, this.getPlaylistVersion() - 1);
			}
			this.setCheckFilesLoop(true);
			this.foundNewPlaylist = false;
			await this.stopAllContent();
			return;
		}

		// cancel if video is not same as previous one played in the parent region ( triggers case )
		if (shouldCancelParentRegion(
			parentRegion.regionName,
			regionInfo.regionName,
			!!this.currentlyPlaying[parentRegion.regionName]?.playing,
		)) {
			timedDebug.log(
				'[processor] cancelling media in parent region: current=%s, new=%s',
				this.currentlyPlaying[regionInfo.regionName].src,
				element.src,
			);
			await this.cancelPreviousMedia(parentRegion);
			return;
		}

		// cancel element played in default region
		if (
			this.currentlyPlaying[SMILEnums.defaultRegion]?.src !== element.src &&
			this.currentlyPlaying[SMILEnums.defaultRegion]?.playing
		) {
			timedDebug.log(
				'[processor] cancelling media in default region: current=%s, new=%s',
				this.currentlyPlaying[SMILEnums.defaultRegion].src,
				element.src,
			);
			this.introFinished.resolve();
			await this.cancelPreviousMedia(this.currentlyPlaying[SMILEnums.defaultRegion].regionInfo);
			return;
		}

		// cancel dynamic from dynamic even if its marked as not playing to avoid race condition
		if (
			(this.currentlyPlaying[regionInfo.regionName]?.src !== element.src &&
				this.currentlyPlaying[regionInfo.regionName]?.playing) ||
			(this.currentlyPlaying[regionInfo.regionName]?.src !== element.src &&
				this.currentlyPlaying[regionInfo.regionName]?.dynamicValue &&
				element.dynamicValue)
		) {
			timedDebug.log(
				'[processor] cancelling media in region: region=%s, current=%s, new=%s',
				regionInfo.regionName,
				this.currentlyPlaying[regionInfo.regionName]?.src,
				element.src,
			);

			// trigger cancels trigger
			if (
				!isNil(this.currentlyPlaying[regionInfo.regionName][SMILTriggersEnum.triggerValue]) &&
				!isNil(element.triggerValue) &&
				this.currentlyPlaying[regionInfo.regionName][SMILTriggersEnum.triggerValue] !== element.triggerValue
			) {
				let triggerValueToCancel = findTriggerToCancel(
					this.triggers.triggersEndless,
					regionInfo.regionName,
					element.triggerValue,
				);
				timedDebug.log(
					'[processor] cancelling trigger: id=%s, current=%s, new=%s',
					triggerValueToCancel,
					this.currentlyPlaying[regionInfo.regionName].src,
					element.src,
				);
				// stop trigger
				set(this.triggers.triggersEndless, `${triggerValueToCancel}.play`, false);
			}

			await this.cancelPreviousMedia(regionInfo);
			return;
		}

		// TODO: weird behaviour, one item dynamic playlist has dynamicValue directly
		//  in fullScreenTrigger object, multi-item has it in nextElement
		const precedingDynamicValue = this.currentlyPlaying.fullScreenTrigger?.dynamicValue
			? this.currentlyPlaying.fullScreenTrigger?.dynamicValue!
			: this.currentlyPlaying.fullScreenTrigger?.nextElement?.dynamicValue!;

		// normal playlist is cancelling preceding dynamic content
		if (this.currentlyPlaying?.fullScreenTrigger && !element.dynamicValue) {
			timedDebug.log(
				'[processor] cancelling dynamic media: current=%s, new=%s',
				this.currentlyPlaying[this.triggers.dynamicPlaylist[precedingDynamicValue]?.regionInfo?.regionName]
					?.src,
				element.src,
			);
			if (this.triggers.dynamicPlaylist[precedingDynamicValue]?.regionInfo) {
				await this.cancelPreviousMedia(this.triggers.dynamicPlaylist[precedingDynamicValue]?.regionInfo);
			}
			return;
		}
	};

	/**
	 * updated currentlyPlaying object with new element
	 * @param element -  element which is currently playing in given region ( video or HtmlElement )
	 * @param tag - variable which specifies type of element ( video or HtmlElement )
	 * @param regionName -  name of the region of current media
	 */
	protected setCurrentlyPlaying = (
		element: SMILVideo | SosHtmlElement,
		tag: string,
		regionName: string,
		timedDebug?: TimedDebugger,
	) => {
		logDebug(timedDebug, '[processor] setting currently playing: region=%s, tag=%s, src=%s', regionName, tag, element.src);
		const nextElement = cloneDeep(this.currentlyPlaying[regionName]?.nextElement);
		this.currentlyPlaying[regionName] = <PlayingInfo>cloneDeep(element);
		this.currentlyPlaying[regionName].media = tag;
		this.currentlyPlaying[regionName].playing = true;
		this.currentlyPlaying[regionName].nextElement = nextElement;
		// dynamic playlist
		if (element.dynamicValue) {
			logDebug(timedDebug, '[processor] setting dynamic value: %s', element.dynamicValue);
			this.currentlyPlaying[regionName].dynamicValue = element.dynamicValue;
			this.currentlyPlaying[regionName].syncGroupName = element.syncGroupName;
		} else {
			delete this.currentlyPlaying[regionName].dynamicValue;
			delete this.currentlyPlaying[regionName].syncGroupName;
		}
	};

	/**
	 * plays images, widgets and audio, creates htmlElement, appends to DOM and waits for specified duration before resolving function
	 * @param value
	 * @param version - smil internal version of current playlist
	 * @param arrayIndex - at which index is playlist stored in currentlyPlayingPriority object
	 * @param currentIndex - current index in the currentlyPlayingPriority[priorityRegionName] array
	 * @param endTime - when should playlist end, specified either in date in millis or how many times should playlist play
	 * @param isLast - if this media is last element in current playlist
	 * @param currentRegionInfo
	 * @param parentRegionInfo
	 * @param timedDebug - TimedDebugger instance for tracking timing
	 */
	protected playHtmlContent = async (
		value: SMILImage | SMILWidget | SMILTicker,
		version: number,
		arrayIndex: number,
		currentIndex: number,
		endTime: number,
		isLast: boolean,
		currentRegionInfo: RegionAttributes,
		parentRegionInfo: RegionAttributes,
		timedDebug: TimedDebugger,
	): Promise<void> => {
		const taskStartDate = moment().toDate();
		const handlePriorityWhenDone = () =>
			this.priority.handlePriorityWhenDone(
				value as SMILMedia,
				currentRegionInfo.regionName,
				currentIndex,
				endTime,
				isLast,
				version,
				this.playlistVersion,
				this.triggers,
			);
		try {
			let element = <HTMLElement>document.getElementById(value.id!);

			let sosHtmlElement: SosHtmlElement = {
				src: element.getAttribute('src')!,
				id: element.id,
				dur: value.dur,
				syncIndex: value.syncIndex ?? undefined,
				regionInfo: value.regionInfo,
				localFilePath: value.localFilePath,
				dynamicValue: value.dynamicValue,
				transitionInfo: value.transitionInfo ?? undefined,
				...extractAttributesByPrefix(value, smilLogging.proofOfPlayPrefix),
			};

			if (!isNil(value.triggerValue)) {
				sosHtmlElement.triggerValue = value.triggerValue;
			}

			this.priority.stateManager.setPromiseFunction(currentRegionInfo.regionName, [
				(async () => {
					try {
						let transitionDuration = 0;

						// widget detected with attribute preload set to false, reset before play
						if (element.nodeName === 'IFRAME' && value.preload === false) {
							let src = generateElementSrc(value.src, value.localFilePath, version);
							element.setAttribute('src', src);
							sosHtmlElement.src = src;
						}

						const hasTransition = 'transitionInfo' in value;
						if (hasTransition) {
							transitionDuration = setElementDuration(value.transitionInfo!.dur);
						}
						changeZIndex(value, element, +1, false);

						if (
							(this.currentlyPlaying[currentRegionInfo.regionName]?.media !== 'ticker' ||
								this.currentlyPlaying[currentRegionInfo.regionName]?.id !== element.id) &&
							element.id.indexOf('ticker') > -1
						) {
							startTickerAnimation(element, value as SMILTicker);
						}

						// Coordinate play synchronization before element becomes visible
						if (this.shouldCoordinateSync(value.syncIndex)) {
							const playPriorityLevel = this.getSyncPriorityLevel(currentRegionInfo.regionName, currentIndex);
							const shouldContinue = await this.coordinatePlaySync(
								currentRegionInfo.regionName,
								value.syncIndex,
								timedDebug,
								playPriorityLevel,
							);
							if (!shouldContinue) {
								return; // Skip this element during resync
							}
						}

						element.style.visibility = 'visible';
						await this.waitMediaOnScreen(
							currentRegionInfo,
							parentRegionInfo,
							sosHtmlElement,
							arrayIndex,
							element,
							transitionDuration,
							taskStartDate,
							version,
							timedDebug,
						);

						timedDebug.log(
							'[processor] finished iteration of playlist: region=%s, index=%d',
							currentRegionInfo.regionName,
							currentIndex,
						);

						// Coordinate finish synchronization after element playback completes
						if (this.shouldCoordinateSync(value.syncIndex)) {
							const finishPriorityLevel = this.getSyncPriorityLevel(currentRegionInfo.regionName, arrayIndex);
							await this.coordinateFinishSync(
								currentRegionInfo.regionName,
								value.syncIndex,
								timedDebug,
								finishPriorityLevel,
							);
						}

						await handlePriorityWhenDone();
						timedDebug.log(
							'[processor] finished checking iteration of playlist: region=%s, index=%d',
							currentRegionInfo.regionName,
							currentIndex,
						);

						if (hasTransition) {
							removeTransitionCss(element);
						}

						changeZIndex(value, element, -2);

						timedDebug.log('[processor] finished playing html element: src=%s', value.localFilePath);
					} catch (err) {
						timedDebug.log(
							'[processor] unexpected error during html element playback promise: src=%s, err=%O',
							value.localFilePath,
							err,
						);

						// Coordinate finish synchronization even on error to maintain sync consistency
						if (this.shouldCoordinateSync(value.syncIndex)) {
							const finishPriorityLevel = this.getSyncPriorityLevel(currentRegionInfo.regionName, arrayIndex);
							await this.coordinateFinishSync(
								currentRegionInfo.regionName,
								value.syncIndex,
								timedDebug,
								finishPriorityLevel,
							);
						}

						await handlePriorityWhenDone();

						// no await to not to block playback when server takes too long to respond
						this.files.sendMediaReport(
							value,
							taskStartDate,
							value.localFilePath.indexOf('widgets') > -1 ? 'ref' : 'image',
							!!value.syncIndex && this.synchronization.shouldSync,
							err.message,
						);
					}
				})(),
			]);
		} catch (err) {
			timedDebug.log('[processor] unexpected error during html element playback: src=%s, err=%O', value.localFilePath, err);

			await handlePriorityWhenDone();

			// no await to not to block playback when server takes too long to respond
			this.files.sendMediaReport(
				value,
				taskStartDate,
				value.localFilePath.indexOf('widgets') > -1 ? 'ref' : 'image',
				!!value.syncIndex && this.synchronization.shouldSync,
				err.message,
			);
		}
	};

	/**
	 * pauses function execution for given duration time =  how long should media stay visible on the screen
	 * @param currentRegionInfo - information about region when current media belongs to
	 * @param parentRegionInfo - region overlapping current region, trigger case
	 * @param element - displayed SOS HTML element
	 * @param arrayIndex - current index in the currentlyPlayingPriority[priorityRegionName] array
	 * @param elementHtml - actual HTML element visible on page
	 * @param transitionDuration - duration of transitions between images
	 * @param taskStartDate - date when element was displayed
	 * @param version - smil internal version of current playlist
	 * @param debugId
	 */
	protected waitMediaOnScreen = async (
		currentRegionInfo: RegionAttributes,
		parentRegionInfo: RegionAttributes,
		element: SosHtmlElement,
		arrayIndex: number,
		elementHtml: HTMLElement,
		transitionDuration: number,
		taskStartDate: Date,
		version: number,
		timedDebug: TimedDebugger,
	): Promise<void> => {
		timedDebug.log('[processor] starting wait media on screen: src=%s, id=%s', element.src, element.id);
		const duration = setElementDuration(element.dur);

		await this.checkRegionsForCancellation(element, currentRegionInfo, parentRegionInfo, version, timedDebug);

		// rare case during seamless update with only one widget in playlist.
		if (elementHtml.style.visibility !== 'visible') {
			elementHtml.style.visibility = 'visible';
			elementHtml.setAttribute('src', element.src);
		}
		const tag = element.id.indexOf('ticker') > -1 ? 'ticker' : 'html';

		this.setCurrentlyPlaying(element, tag, currentRegionInfo.regionName, timedDebug);

		timedDebug.log('[processor] waiting element duration: %sms, id=%s', duration, element.id);

		await this.waitElementDuration(
			duration, currentRegionInfo, arrayIndex, element, elementHtml, transitionDuration, timedDebug,
		);

		timedDebug.log('[processor] element playing finished: id=%s, src=%s', element.id, element.src);

		// no await to not to block playback when server takes too long to respond
		this.files.sendMediaReport(
			element,
			taskStartDate,
			tag === 'ticker' ? 'ticker' : element.localFilePath.indexOf('widgets') > -1 ? 'ref' : 'image',
			!!element.syncIndex && this.synchronization.shouldSync,
		);
	};

	/**
	 * function used to await for content to appear based on wallclock definitions, can be interrupted earlier by updates in smil file
	 * @param timeout - how long should function wait
	 */
	protected waitTimeoutOrFileUpdate = async (timeout: number): Promise<boolean> => {
		let fileUpdated = false;
		await Promise.race([
			sleep(timeout),
			this.waitForCancelFunction().then(() => { fileUpdated = true; }),
		]);
		return fileUpdated;
	};

	/**
	 * Waits for the given duration, interruptible by priority stop/pause or SMIL file update.
	 * Handles transition CSS timing and priority pause/unpause cycles.
	 */
	private waitElementDuration = async (
		duration: number,
		currentRegionInfo: RegionAttributes,
		arrayIndex: number,
		element: SosHtmlElement,
		elementHtml: HTMLElement,
		transitionDuration: number,
		timedDebug: TimedDebugger,
	): Promise<void> => {
		let transitionSet = false;

		while (
			duration > 0 &&
			!get(this.currentlyPlayingPriority, `${currentRegionInfo.regionName}`)[arrayIndex]?.player.stop
		) {
			// Check if paused — wait reactively for unpause, stop, or cancel
			if (
				this.currentlyPlayingPriority[currentRegionInfo.regionName][arrayIndex] &&
				get(this.currentlyPlayingPriority, `${currentRegionInfo.regionName}`)[arrayIndex]?.player
					.contentPause !== 0
			) {
				await Promise.race([
					this.priority.stateManager.waitUntil(currentRegionInfo.regionName, (e) =>
						!e[arrayIndex] || e[arrayIndex]?.player.contentPause === 0 || e[arrayIndex]?.player.stop === true),
					this.waitForCancelFunction(),
				]);
				if (this.getCancelFunction()) {
					await this.cancelPreviousMedia(currentRegionInfo);
					break;
				}
				continue;
			}

			// Guard: entry must exist
			const player = this.currentlyPlayingPriority[currentRegionInfo.regionName]?.[arrayIndex]?.player;
			if (!player) break;

			// Ensure a fresh interrupt deferred for this play cycle.
			// At most 1 unsettled Deferred exists per player at any time (no accumulation).
			ensurePlayingDeferred(player);

			// Set up transition timer if needed
			let transitionTimer: ReturnType<typeof setTimeout> | undefined;
			if (transitionDuration !== 0 && duration > transitionDuration && !transitionSet) {
				transitionTimer = setTimeout(() => {
					if (
						this.currentlyPlaying[currentRegionInfo.regionName]?.nextElement?.type === 'html' &&
						!transitionSet
					) {
						transitionSet = true;
						timedDebug.log(
							'[processor] setting transition css: id=%s, duration=%s, transitionDuration=%s',
							element.id,
							duration,
							transitionDuration,
						);
						setTransitionCss(
							element,
							elementHtml,
							this.currentlyPlaying[currentRegionInfo.regionName].nextElement.id!,
							transitionDuration,
						);
					}
				}, duration - transitionDuration);
			}

			// Cancellable sleep — clearTimeout prevents orphaned timers on early race exit
			let sleepTimer: ReturnType<typeof setTimeout>;
			const sleepPromise = new Promise<void>((resolve) => {
				sleepTimer = setTimeout(resolve, duration);
			});

			// Wait for: duration expires, stop/pause signal (via deferred), or cancel
			const startTime = Date.now();
			await Promise.race([
				sleepPromise,
				player.playingCompletionDeferred!.promise,
				this.waitForCancelFunction(),
			]);
			clearTimeout(sleepTimer!);
			if (transitionTimer) clearTimeout(transitionTimer);

			// Deduct elapsed time so remaining duration is correct after priority pause/unpause
			const elapsed = Date.now() - startTime;
			duration -= elapsed;

			// Handle cancel — exit immediately
			if (this.getCancelFunction()) {
				await this.cancelPreviousMedia(currentRegionInfo);
				break;
			}

			// Apply transition if we passed the threshold but timer didn't fire
			if (
				transitionDuration !== 0 &&
				duration <= transitionDuration &&
				!transitionSet &&
				this.currentlyPlaying[currentRegionInfo.regionName]?.nextElement?.type === 'html'
			) {
				transitionSet = true;
				setTransitionCss(
					element,
					elementHtml,
					this.currentlyPlaying[currentRegionInfo.regionName].nextElement.id!,
					transitionDuration,
				);
			}
		}
	};

	// audio currently not supported
	// private playAudio = async (filePath: string) => {
	// 	debug('Playing audio: %s', filePath);
	// 	return new Promise((resolve, reject) => {
	// 		const audioElement = <HTMLAudioElement> new Audio(filePath);
	// 		audioElement.onerror = reject;
	// 		audioElement.onended = resolve;
	// 		audioElement.play();
	// 	});
	// }

	/**
	 *
	 * @param media - video or SoSHtmlElement ( image or widget )
	 * @param regionInfo - information about region when current video belongs to
	 * @param parentRegionName
	 * @param currentIndex - current index in the currentlyPlayingPriority[priorityRegionName] array
	 * @param previousPlayingIndex - index of previously playing content in currentlyPlayingPriority[priorityRegionName] array
	 * @param endTime - when should playlist end, specified either in date in millis or how many times should playlist play
	 * @param isLast - if this media is last element in current playlist
	 * @param version - smil internal version of current playlist
	 * @param debugId
	 * @param priorityCoord - priority information for coordination during version updates
	 * @param timedDebug
	 */
	protected shouldWaitAndContinue = async (
		media: SMILMedia,
		regionInfo: RegionAttributes,
		parentRegionName: string,
		currentIndex: number,
		previousPlayingIndex: number,
		endTime: number,
		isLast: boolean,
		version: number,
		timedDebug: TimedDebugger,
		priorityCoord?: { version: number; priority: number },
	): Promise<WaitStatus> => {
		this.priority.stateManager.ensurePromiseAwaiting(regionInfo.regionName, version, media.triggerValue);

		if (isNil(this.currentlyPlaying[regionInfo.regionName])) {
			this.currentlyPlaying[regionInfo.regionName] = <PlayingInfo>{};
		}

		// Wait for previous promise to finish BEFORE claiming priority tracking
		// This prevents race condition where new priority claims tracking while stuck waiting
		const promiseAwaitingEntry = this.priority.stateManager.getPromiseAwaiting(regionInfo.regionName);
		if (
			this.currentlyPlayingPriority[parentRegionName][previousPlayingIndex].behaviour !== PriorityBehaviour.pause &&
			(promiseAwaitingEntry?.promiseFunction?.length ?? 0) > 0 &&
			(!media.hasOwnProperty(SMILTriggersEnum.triggerValue) ||
				media.triggerValue === promiseAwaitingEntry?.triggerValue)
		) {
			this.currentlyPlaying[regionInfo.regionName].nextElement = cloneDeep(media);
			this.currentlyPlaying[regionInfo.regionName].nextElement.type =
				get(media, 'localFilePath', 'default').indexOf(FileStructure.videos) === -1 ? 'html' : 'video';

			timedDebug.log('[processor] checking if playlist is newer version than currently playing');
			if (version > this.playlistVersion && !media.hasOwnProperty(SMILTriggersEnum.triggerValue)) {
				this.foundNewPlaylist = true;
			}
			if (promiseAwaitingEntry) {
				// Check for version update BEFORE waiting for old promises
				// This fixes race condition where V2 gets stuck waiting for V1's content
				const versionUpdateProcessed = await this.processVersionUpdate(version);

				if (versionUpdateProcessed) {
					timedDebug.log(
						'[processor] version update processed, skipping wait for old promises: region=%s',
						regionInfo.regionName,
					);
					// Continue without waiting - old promises were just cancelled
				} else {
					// Re-check after async call and use local variable for type safety
					const refreshedEntry = this.priority.stateManager.getPromiseAwaiting(regionInfo.regionName);
					const promisesToWait = refreshedEntry?.promiseFunction;
					if (promisesToWait && promisesToWait.length > 0) {
						// No version update - proceed with normal promise waiting
						timedDebug.log(
							'[processor] waiting for region promise: region=%s, promiseCount=%d',
							regionInfo.regionName,
							promisesToWait.length,
						);
						await Promise.all(promisesToWait);
						timedDebug.log(
							'[processor] region promise resolved: region=%s',
							regionInfo.regionName,
						);
					}
				}
				// Note: Priority tracking cleanup will happen after coordination below
			}
		}

		// Priority coordination for ALL elements (AFTER waiting for old promise)
		// This runs for every element to ensure proper priority sequencing within the same version

		if (priorityCoord) {
			const myPriority = priorityCoord.priority;

			const { currentHighest } = this.priority.stateManager.updatePriorityTracking(regionInfo.regionName, version, myPriority);
			timedDebug.log('[processor] priority tracking updated: version=%s, priority=%s, currentHighest=%s', version, myPriority, currentHighest);

			// If a higher priority (higher number) is already processing, wait reactively
			if (currentHighest > myPriority) {
				timedDebug.log(
					'[processor] priority %s waiting for higher priority %s', myPriority, currentHighest,
				);

				await this.priority.stateManager.waitForTurn(
					regionInfo.regionName,
					() => {
						const entry = this.priority.stateManager.getPromiseAwaiting(regionInfo.regionName);
						const tracked = entry?.highestProcessingPriority ?? -1;
						return tracked <= myPriority;
					},
					myPriority,
				);

				// Check if cancelled while waiting
				if (version < this.playlistVersion || this.getCancelFunction()) {
					this.priority.stateManager.cleanupPriorityTracking(
						regionInfo.regionName,
						priorityCoord.version,
						priorityCoord.priority,
					);
					return WaitStatus.SKIP;
				}

				timedDebug.log(
					'[processor] priority %s proceeding after reactive wait', myPriority,
				);
			} else {
				// Priority can proceed - no higher priority blocking
				timedDebug.log(
					'[processor] priority %s proceeding, no higher priority blocking', myPriority,
				);
			}
		}

		// wait for all
		if (
			this.triggers.dynamicPlaylist[media.dynamicValue!]?.isMaster &&
			this.currentlyPlayingPriority[parentRegionName][previousPlayingIndex].behaviour !== PriorityBehaviour.pause &&
			version >= this.getPlaylistVersion()
		) {
			timedDebug.log(
				'[processor] master dynamic playlist waiting for preceding content: dynamicValue=%s',
				media.dynamicValue,
			);
			let promises: Promise<void>[] = [];
			for (const [, promise] of Object.entries(this.promiseAwaiting)) {
				promises = promises.concat(promise.promiseFunction!);
			}
			await Promise.all(promises);
			timedDebug.log(
				'[processor] master dynamic playlist finished waiting for preceding content: dynamicValue=%s',
				media.dynamicValue,
			);
		}

		if (media.dynamicValue && !this.synchronization.shouldSync) {
			timedDebug.log(
				'[processor] dynamic playlist skipped, sync stopped: dynamicValue=%s',
				media.dynamicValue,
			);
			await cancelDynamicPlaylistMaster(
				this.triggers,
				this.sos,
				this.currentlyPlaying,
				this.synchronization,
				this.currentlyPlayingPriority,
				media.dynamicValue!,
				(regionName, filter) => this.priority.stateManager.cancelAllInRegion(regionName, filter),
			);
			// Clean up before skipping
			if (priorityCoord) {
				this.priority.stateManager.cleanupPriorityTracking(regionInfo.regionName, priorityCoord.version, priorityCoord.priority);
			}
			return WaitStatus.SKIP;
		}

		if (
			media.hasOwnProperty(SMILTriggersEnum.triggerValue) &&
			isTriggerCancelled(media.triggerValue as string, this.triggers.triggersEndless)
		) {
			timedDebug.log('[processor] trigger was cancelled prematurely: triggerValue=%s', media.triggerValue);
			// Clean up before skipping
			if (priorityCoord) {
				this.priority.stateManager.cleanupPriorityTracking(regionInfo.regionName, priorityCoord.version, priorityCoord.priority);
			}
			return WaitStatus.SKIP;
		}

		if (isDynamicPlaylistCancelled(
			media.dynamicValue,
			this.triggers.dynamicPlaylist,
			media.src,
			this.currentlyPlaying[regionInfo.regionName]?.src,
		)) {
			this.priority.stateManager.cancelAllInRegion(parentRegionName, (e) => !!e.media.dynamicValue);
			set(this.currentlyPlaying, `${regionInfo.regionName}.playing`, false);
			timedDebug.log('[processor] dynamic playlist was cancelled prematurely: dynamicValue=%s', media.dynamicValue);
			// Clean up before skipping
			if (priorityCoord) {
				this.priority.stateManager.cleanupPriorityTracking(regionInfo.regionName, priorityCoord.version, priorityCoord.priority);
			}
			return WaitStatus.SKIP;
		}

		await this.triggers.handleTriggers(media);

		// nothing played before ( trigger case )
		if (isNil(this.currentlyPlayingPriority[regionInfo.regionName])) {
			return WaitStatus.CONTINUE;
		}
		const currentIndexPriority = this.currentlyPlayingPriority[regionInfo.regionName][currentIndex];
		// playlist was already stopped/paused during await
		if (isPriorityBlockedOrPaused(currentIndexPriority)) {
			timedDebug.log(
				'[processor] playlist stopped/paused by higher priority: region=%s, src=%s',
				regionInfo.regionName,
				media.src,
			);
			// Clean up before skipping
			if (priorityCoord) {
				this.priority.stateManager.cleanupPriorityTracking(regionInfo.regionName, priorityCoord.version, priorityCoord.priority);
			}
			return WaitStatus.SKIP;
		}

		if (isWallclockEndTimeExpired(currentIndexPriority)) {
			timedDebug.log(
				'[processor] playtime exceeded, exiting: region=%s, src=%s',
				regionInfo.regionName,
				media.src,
			);
			await this.priority.handlePriorityWhenDone(
				media as SMILMedia,
				regionInfo.regionName,
				currentIndex,
				endTime,
				isLast,
				version,
				this.playlistVersion,
				this.triggers,
			);
			// Clean up before skipping
			if (priorityCoord) {
				this.priority.stateManager.cleanupPriorityTracking(regionInfo.regionName, priorityCoord.version, priorityCoord.priority);
			}
			return WaitStatus.SKIP;
		}

		timedDebug.log('[processor] playlist is ready to play: region=%s, src=%s', regionInfo.regionName, media.src);
		this.priority.stateManager.setPlaying(regionInfo.regionName, currentIndex);
		return WaitStatus.CONTINUE;
	};

	/**
	 * plays one video
	 * @param video - SMILVideo object
	 * @param version - smil internal version of current playlist
	 * @param currentIndex - current index in the currentlyPlayingPriority[priorityRegionName] array
	 * @param endTime - when should playlist end, specified either in date in millis or how many times should playlist play
	 * @param isLast - if this media is last element in current playlist
	 * @param currentRegionInfo
	 * @param arrayIndex
	 * @param parentRegionInfo
	 * @param sosVideoObject
	 * @param params
	 * @param timedDebug - TimedDebugger instance for tracking timing
	 */
	protected playVideo = async (
		video: SMILVideo,
		version: number,
		currentIndex: number,
		endTime: number,
		isLast: boolean,
		currentRegionInfo: RegionAttributes,
		arrayIndex: number,
		parentRegionInfo: RegionAttributes,
		sosVideoObject: Video | Stream,
		params: VideoParams,
		timedDebug: TimedDebugger,
	) => {
		const taskStartDate = moment().toDate();
		const handlePriorityWhenDone = () =>
			this.priority.handlePriorityWhenDone(
				video as SMILMedia,
				currentRegionInfo.regionName,
				currentIndex,
				endTime,
				isLast,
				version,
				this.playlistVersion,
				this.triggers,
			);

		try {
			timedDebug.log('[processor] playing video: src=%s, region=%s', video.localFilePath, currentRegionInfo.regionName);

			// trigger combined with video background
			if (config.videoOptions.background) {
				await sosVideoObject.prepare(...params);
			}

			this.priority.stateManager.setPromiseFunction(currentRegionInfo.regionName, [
				(async () => {
					try {
						if (isNil(video.isStream)) {
							await this.handleVideoPlay(
								video,
								params,
								sosVideoObject,
								currentRegionInfo,
								parentRegionInfo,
								version,
								arrayIndex,
								timedDebug,
							);
						} else {
							await this.handleStreamPlay(
								video,
								params,
								sosVideoObject,
								currentRegionInfo,
								parentRegionInfo,
								version,
								timedDebug,
							);
						}

						timedDebug.log('[processor] playing video finished: src=%s, version=%s', video.localFilePath, version);

						// no await to not to block playback when server takes too long to respond
						this.files.sendMediaReport(
							video,
							taskStartDate,
							'video',
							!!video.syncIndex && this.synchronization.shouldSync,
						);

						// create currentlyPlayingPriority for trigger nested region
						if (currentRegionInfo.regionName !== parentRegionInfo.regionName) {
							this.priority.stateManager.aliasRegion(parentRegionInfo.regionName, currentRegionInfo.regionName);
						}

						if (
							!isNil(this.currentlyPlayingPriority[currentRegionInfo.regionName]) &&
							this.currentlyPlayingPriority[currentRegionInfo.regionName][arrayIndex] &&
							this.currentlyPlayingPriority[currentRegionInfo.regionName][arrayIndex]?.player
								.contentPause !== 0
						) {
							video.playing = false;
							await Promise.race([
								this.priority.stateManager.waitUntil(currentRegionInfo.regionName, (e) =>
									!e[arrayIndex] || e[arrayIndex]?.player.contentPause === 0 || e[arrayIndex]?.player.stop === true),
								(async () => {
									await this.waitForCancelFunction();
									await this.cancelPreviousMedia(currentRegionInfo);
									timedDebug.log(
										'[processor] finished video iteration (cancelled): region=%s, index=%d',
										currentRegionInfo.regionName,
										currentIndex,
									);
									await handlePriorityWhenDone();
								})(),
							]);
						}

						if (this.getCancelFunction()) {
							await this.cancelPreviousMedia(currentRegionInfo);
							timedDebug.log(
								'[processor] finished video iteration (cancel function): region=%s, index=%d',
								currentRegionInfo.regionName,
								currentIndex,
							);

							await handlePriorityWhenDone();
							return;
						}

						timedDebug.log(
							'[processor] finished video iteration: region=%s, index=%d',
							currentRegionInfo.regionName,
							currentIndex,
						);

						// Coordinate finish synchronization after video playback completes
						if (this.shouldCoordinateSync(video.syncIndex)) {
							const finishPriorityLevel = this.getSyncPriorityLevel(currentRegionInfo.regionName, arrayIndex);
							await this.coordinateFinishSync(
								currentRegionInfo.regionName,
								video.syncIndex,
								timedDebug,
								finishPriorityLevel,
							);
						}

						await handlePriorityWhenDone();
					} catch (err) {
						timedDebug.log('[processor] unexpected error during video playback: src=%s, err=%O', video.localFilePath, err);

						// Coordinate finish synchronization even on error to maintain sync consistency
						if (this.shouldCoordinateSync(video.syncIndex)) {
							const finishPriorityLevel = this.getSyncPriorityLevel(currentRegionInfo.regionName, arrayIndex);
							await this.coordinateFinishSync(
								currentRegionInfo.regionName,
								video.syncIndex,
								timedDebug,
								finishPriorityLevel,
							);
						}

						await handlePriorityWhenDone();

						// no await to not to block playback when server takes too long to respond
						this.files.sendMediaReport(
							video,
							taskStartDate,
							'video',
							!!video.syncIndex && this.synchronization.shouldSync,
							err.message,
						);
					}
					timedDebug.log('[processor] finished playing video element: src=%s', video.localFilePath);
				})(),
			]);

			// give time to smil player to play video before massive wallclock processing
			await sleep(1000);
		} catch (err) {
			timedDebug.log('[processor] unexpected error during video prepare: src=%s, err=%O', video.localFilePath, err);
			await handlePriorityWhenDone();
			// no await to not to block playback when server takes too long to respond
			this.files.sendMediaReport(
				video,
				taskStartDate,
				'video',
				!!video.syncIndex && this.synchronization.shouldSync,
				err.message,
			);
		}
	};

	protected handleVideoPlay = async (
		video: SMILVideo,
		params: VideoParams,
		sosVideoObject: Video | Stream,
		currentRegionInfo: RegionAttributes,
		parentRegionInfo: RegionAttributes,
		version: number,
		arrayIndex: number,
		timedDebug: TimedDebugger,
	) => {
		let promiseRaceArray = [];
		params.pop();
		if (
			this.currentlyPlaying[currentRegionInfo.regionName]?.src !== video.src &&
			this.currentlyPlaying[currentRegionInfo.regionName]?.playing &&
			(this.currentlyPlaying[currentRegionInfo.regionName] as any)?.isStream
		) {
			timedDebug.log(
				'[processor] cancelling stream: current=%s, new=%s',
				this.currentlyPlaying[currentRegionInfo.regionName].src,
				video.src,
			);
			await this.cancelPreviousMedia(currentRegionInfo);
			return;
		}

		// Coordinate play synchronization before video playback
		if (this.shouldCoordinateSync(video.syncIndex)) {
			const playPriorityLevel = this.getSyncPriorityLevel(currentRegionInfo.regionName, arrayIndex);
			const shouldContinue = await this.coordinatePlaySync(
				currentRegionInfo.regionName,
				video.syncIndex,
				timedDebug,
				playPriorityLevel,
			);
			if (!shouldContinue) {
				return; // Skip this element during resync
			}
		}

		try {
			timedDebug.log('[processor] calling video play: src=%s', video.localFilePath);
			await sosVideoObject.play(...params);
			timedDebug.log('[processor] video play returned: src=%s', video.localFilePath);
		} catch (err) {
			// no await to not to block playback when server takes too long to respond
			this.files.sendMediaReport(
				video,
				moment().toDate(),
				'video',
				!!video.syncIndex && this.synchronization.shouldSync,
				err.message,
			);
			await sosVideoObject.stop(
				params[0],
				currentRegionInfo.left,
				currentRegionInfo.top,
				currentRegionInfo.width,
				currentRegionInfo.height,
			);
			await sosVideoObject.play(...params);
		}

		await this.checkRegionsForCancellation(video, currentRegionInfo, parentRegionInfo, version, timedDebug);

		this.setCurrentlyPlaying(video, 'video', currentRegionInfo.regionName, timedDebug);

		timedDebug.log('[processor] waiting for video onceEnded: src=%s', video.localFilePath);
		promiseRaceArray.push(
			this.sos.video.onceEnded(
				params[0],
				currentRegionInfo.left,
				currentRegionInfo.top,
				currentRegionInfo.width,
				currentRegionInfo.height,
			),
		);

		// stop video when playlist was stopped by higher priority
		promiseRaceArray.push(
			this.priority.stateManager.waitUntil(currentRegionInfo.regionName, (e) =>
				e[arrayIndex]?.player.stop === true),
		);

		// due to webos bug when onceEnded function never resolves, add videoDuration + 1000ms function to resolve
		// so playback can continue
		// TODO: fix in webos app
		if ('fullVideoDuration' in video && video.fullVideoDuration !== SMILEnums.defaultVideoDuration) {
			timedDebug.log('[processor] got fullVideoDuration: %sms, src=%s', video.fullVideoDuration!, video.localFilePath);
			promiseRaceArray.push(sleep(video.fullVideoDuration! + SMILEnums.videoDurationOffset));
		}

		// if video has specified duration in smil file, cancel it after given duration passes
		if ('dur' in video) {
			const parsedDuration = setElementDuration(video.dur!);
			timedDebug.log('[processor] got dur: %sms, src=%s', parsedDuration, video.localFilePath);
			promiseRaceArray.push(sleep(parsedDuration));
		}

		try {
			await Promise.race(promiseRaceArray);
		} catch (err) {
			timedDebug.log('[processor] unexpected error during video onceEnded: src=%s, err=%O', video.localFilePath, err);
		}
	};

	protected handleStreamPlay = async (
		stream: SMILVideo,
		params: VideoParams,
		sosVideoObject: Video | Stream,
		currentRegionInfo: RegionAttributes,
		parentRegionInfo: RegionAttributes,
		version: number,
		timedDebug: TimedDebugger,
	) => {
		timedDebug.log('[processor] starting stream playback: src=%s', stream.src);
		let promiseRaceArray = [];

		if (stream.protocol === StreamEnums.internal) {
			timedDebug.log('[processor] removing protocol parameter for internal stream');
			params.pop();
		}

		await sosVideoObject.play(...params);

		await this.checkRegionsForCancellation(stream, currentRegionInfo, parentRegionInfo, version, timedDebug);

		this.setCurrentlyPlaying(stream, 'video', currentRegionInfo.regionName, timedDebug);

		if ('dur' in stream) {
			const parsedDuration: number = setElementDuration(stream.dur!);
			timedDebug.log('[processor] got dur: %sms for stream: src=%s', parsedDuration, stream.src);
			promiseRaceArray.push(sleep(parsedDuration));
		}

		promiseRaceArray.push(
			waitForSuccessOrFailEvents(this.smilEventEmitter, stream, StreamEnums.disconnectedEvent, StreamEnums.errorEvent),
		);

		try {
			await Promise.race(promiseRaceArray);
		} catch (err) {
			timedDebug.log('[processor] unexpected error during stream playback: src=%s, err=%O', stream.src, err);
		}
	};

	private setupIntroVideo = async (video: SMILVideo, region: RegionsObject) => {
		const currentVideoDetails = <IFile>(
			await this.files.getFileDetails(video, this.internalStorageUnit, FileStructure.videos)
		);
		video.regionInfo = getRegionInfo(region, video.region);
		video.localFilePath = currentVideoDetails.localUri;
		debug('[processor] setting up intro video: src=%s', video.src);
		await this.sos.video.prepare(
			video.localFilePath,
			video.regionInfo.left,
			video.regionInfo.top,
			video.regionInfo.width,
			video.regionInfo.height,
			config.videoOptions,
		);
		debug('[processor] intro video prepared: src=%s', video.src);
	};

	private setupIntroImage = async (image: SMILImage, region: RegionsObject, key: string): Promise<HTMLElement> => {
		const currentImageDetails = <IFile>(
			await this.files.getFileDetails(image, this.internalStorageUnit, FileStructure.images)
		);
		image.regionInfo = getRegionInfo(region, image.region);
		image.localFilePath = currentImageDetails.localUri;
		debug('[processor] setting up intro image: src=%s', image.src);
		const element: HTMLElement = createHtmlElement(
			image,
			HtmlEnum.img,
			image.localFilePath,
			image.regionInfo,
			key,
			image.src,
		);
		image.id = element.id;
		element.style.visibility = 'visible';
		element.setAttribute('src', image.localFilePath);
		document.body.appendChild(element);
		debug('[processor] intro image prepared: id=%s', element.id);
		return element;
	};

	private playIntroLoop = async (media: string, intro: SMILIntro): Promise<Promise<void>[]> => {
		const promises = [];
		this.introFinished = new Deferred<void>();
		promises.push(
			(async () => {
				while (!this.introFinished.isSettled) {
					switch (removeDigits(media)) {
						case SMILEnums.img:
							await this.introFinished.promise;
							break;
						default:
							await Promise.race([
								this.playIntroVideo(intro[media] as SMILVideo),
								this.introFinished.promise,
							]);
					}
				}
			})(),
		);

		return promises;
	};

	private playIntroVideo = async (video: SMILVideo) => {
		try {
			debug('[processor] playing intro video: src=%s', video.localFilePath);
			await this.sos.video.play(
				video.localFilePath,
				video.regionInfo.left,
				video.regionInfo.top,
				video.regionInfo.width,
				video.regionInfo.height,
			);

			debug('[processor] intro video waiting for onceEnded: src=%s', video.localFilePath);
			await this.sos.video.onceEnded(
				video.localFilePath,
				video.regionInfo.left,
				video.regionInfo.top,
				video.regionInfo.width,
				video.regionInfo.height,
			);

			debug('[processor] intro video onceEnded resolved: src=%s', video.localFilePath);
		} catch (err) {
			debug('[processor] error during intro video playback: src=%s', video.localFilePath);
		}
	};

	/**
	 * call actual playing functions for given elements
	 * @param value - json object or array of json objects of type SMILAudio | SMILImage | SMILWidget | SMILVideo | SMILTicker
	 * @param version - smil internal version of current playlist
	 * @param key - defines which media will be played ( video, audio, image or widget )
	 * @param parent - superordinate element of value
	 * @param currentIndex - current index in the currentlyPlayingPriority[priorityRegionName] array
	 * @param previousPlayingIndex - index of previously playing content in currentlyPlayingPriority[priorityRegionName] array
	 * @param endTime - when should playlist end, specified either in date in millis or how many times should playlist play
	 * @param isLast - if this media is last element in current playlist
	 */
	protected playElement = async (
		value: SMILMedia,
		version: number,
		key: string,
		parent: string,
		currentIndex: number,
		previousPlayingIndex: number,
		endTime: number,
		isLast: boolean,
		priorityCoord?: { version: number; priority: number },
	) => {
		const debugId = `playElement_${version}_${key}`;
		const timedDebug = new TimedDebugger(debugId, debug);
		timedDebug.log('[processor] starting to play element: src=%s, key=%s', value.src, key);

		// html page case
		if ('localFilePath' in value && removeDigits(key) === 'ref' && !isWidgetUrl(value.src)) {
			value.localFilePath = value.src;
			timedDebug.log('[processor] updated localFilePath for ref element: %s', value.localFilePath);
		}

		// TODO: implement check to sos library
		if (
			'localFilePath' in value &&
			value.localFilePath === '' &&
			isNil((value as SMILVideo).isStream) &&
			removeDigits(key) !== HtmlEnum.ticker
		) {
			timedDebug.log('[processor] element has empty localFilePath: src=%s', value.src);
			await sleep(100);
			return;
		}

		if (isConditionalExpExpired(value, this.playerName, this.playerId)) {
			timedDebug.log('[processor] conditional expression is false: expr=%s, src=%s', value.expr!, value.src);
			await sleep(100);
			return;
		}

		let sosVideoObject: Video | Stream = this.sos.video;
		let params: VideoParams = getDefaultVideoParams();
		let element = document.getElementById(value.id ?? '') as HTMLElement;

		const parentRegionInfo = value.regionInfo;
		timedDebug.log('[processor] handling triggers for element: src=%s', value.src);
		let currentRegionInfo = await this.triggers.handleTriggers(value, element);

		if (currentRegionInfo.regionName !== parentRegionInfo.regionName) {
			timedDebug.log('[processor] region changed from %s to %s', parentRegionInfo.regionName, currentRegionInfo.regionName);
			this.priority.stateManager.cloneRegion(parentRegionInfo.regionName, currentRegionInfo.regionName);
		}

		const index = getIndexOfPlayingMedia(this.currentlyPlayingPriority[currentRegionInfo.regionName]);

		// Coordinate preparation start - master sends cmd-prepare, slaves wait for it
		if (this.shouldCoordinateSync(value.syncIndex)) {
			const priorityLevel = this.getSyncPriorityLevel(currentRegionInfo.regionName, currentIndex);
			timedDebug.log('[processor-sync] coordinating preparation start');
			try {
				const action = await this.elementController.coordinatePrepareStart(
					currentRegionInfo.regionName,
					value.syncIndex,
					timedDebug,
					priorityLevel,
				);

				if (action === ProcessAction.RESYNC) {
					timedDebug.log('[processor-sync] resync needed, skipping element preparation: region=%s, index=%d',
						currentRegionInfo.regionName, currentIndex);
					await this.priority.handlePriorityWhenDone(
						value,
						currentRegionInfo.regionName,
						currentIndex,
						endTime,
						isLast,
						version,
						this.playlistVersion,
						this.triggers,
					);
					timedDebug.log('[processor-sync] handlePriorityWhenDone completed for resync: region=%s', currentRegionInfo.regionName);
					return; // Skip this element during resync
				}

				timedDebug.log('[processor-sync] preparation start coordination completed');
			} catch (error) {
				timedDebug.log('[processor-sync] error in coordinatePrepareStart: %s', error);
				debug('[processor-sync] coordinatePrepareStart failed: %O', error);
				this.resetSyncState();
			}
		}

		timedDebug.log('[processor] preparing element of type: %s', removeDigits(key));
		switch (removeDigits(key)) {
			case 'video':
				const result = await this.handleVideoPrepare(value as SMILVideo, currentRegionInfo, timedDebug);
				// video does not exist in local storage ( seamless update case )
				if (isNil(result)) {
					timedDebug.log('[processor] video does not exist in local storage');
					return;
				}
				({ sosVideoObject, params } = result);
				timedDebug.log('[processor] video preparation completed');
				break;
			case 'img':
				this.handleHtmlElementPrepare(value as SMILImage, element, version, timedDebug);
				timedDebug.log('[processor] image preparation completed');
				break;
			case 'ref':
				this.handleHtmlElementPrepare(value as SMILWidget, element, version, timedDebug, true);
				timedDebug.log('[processor] widget preparation completed');
				break;
			case 'ticker':
				timedDebug.log('[processor] ticker element - no preparation needed');
				break;
			default:
				timedDebug.log('[processor] tag not supported: %s', removeDigits(key));
		}

		// Coordinate preparation completion - master waits for ACKs, slaves wait for signal-ready
		if (this.shouldCoordinateSync(value.syncIndex)) {
			const preparePriorityLevel = this.getSyncPriorityLevel(currentRegionInfo.regionName, currentIndex);
			timedDebug.log('[processor-sync] coordinating preparation completion');
			try {
				await this.elementController.coordinatePrepareComplete(
					currentRegionInfo.regionName,
					value.syncIndex,
					timedDebug,
					preparePriorityLevel,
				);
				timedDebug.log('[processor-sync] preparation coordination completed');
			} catch (error) {
				timedDebug.log('[processor-sync] error in coordinatePrepareComplete: %s', error);
				debug('[processor-sync] coordinatePrepareComplete failed: %O', error);
				this.resetSyncState();
			}
		}

		timedDebug.log('[processor] checking if should wait and continue');

		const waitStatus = await this.shouldWaitAndContinue(
			value,
			currentRegionInfo,
			parentRegionInfo.regionName,
			currentIndex,
			previousPlayingIndex,
			endTime,
			isLast,
			version,
			timedDebug,
			priorityCoord,
		);

		if (waitStatus === WaitStatus.SKIP) {
			debug('[processor] element skipped based on wait status: debugId=%s', debugId);
			return;
		}
		timedDebug.log('[processor] should wait and continue check passed');

		if (waitStatus === WaitStatus.RETRY) {
			debug('[processor] element needs retry: debugId=%s', debugId);
			return 'RETRY'; // Signal to processPlaylist that retry is needed
		}

		if (!isNil(value.triggerValue)) {
			this.priority.stateManager.setTriggerValue(currentRegionInfo.regionName, value.triggerValue);
		}

		if (version < this.playlistVersion || (this.foundNewPlaylist && version <= this.playlistVersion)) {
			timedDebug.log('[processor] not playing old version: version=%s, currentVersion=%s, src=%s', version, this.playlistVersion, value.src);
			await this.priority.handlePriorityWhenDone(
				value as SMILMedia,
				currentRegionInfo.regionName,
				currentIndex,
				endTime,
				isLast,
				version,
				this.playlistVersion,
				this.triggers,
			);
			return;
		}

		timedDebug.log('[processor] playing element: key=%s, src=%s, parent=%s, version=%s', key, value.src, parent, version);
		switch (removeDigits(key)) {
			case 'video':
				await this.playVideo(
					value as SMILVideo,
					version,
					currentIndex,
					endTime,
					isLast,
					currentRegionInfo,
					index,
					parentRegionInfo,
					sosVideoObject,
					params,
					timedDebug,
				);
				break;
			case SMILEnums.img:
			case 'ref':
				await this.playHtmlContent(
					value as SMILImage | SMILWidget,
					version,
					index,
					currentIndex,
					endTime,
					isLast,
					currentRegionInfo,
					parentRegionInfo,
					timedDebug,
				);
				break;
			case 'ticker':
				await this.playHtmlContent(
					value as SMILTicker,
					version,
					index,
					currentIndex,
					endTime,
					isLast,
					currentRegionInfo,
					parentRegionInfo,
					timedDebug,
				);
				break;
			// case 'audio':
			// 	await this.playAudio(value.localFilePath);
			// 	break;
			default:
				timedDebug.log('[processor] unsupported element type: %s', key);
		}
	};

	protected handleVideoPrepare = async (
		value: SMILVideo,
		regionInfo: RegionAttributes,
		timedDebug: TimedDebugger,
	): Promise<
		| {
				sosVideoObject: Video | Stream;
				params: VideoParams;
		  }
		| undefined
	> => {
		timedDebug.log('[processor] starting video preparation: src=%s, region=%s', value.src, regionInfo.regionName);

		const sosVideoObject = isNil(value.isStream) ? this.sos.video : this.sos.stream;
		const options = isNil(value.isStream) ? config.videoOptions : value.protocol;
		const videoPath = isNil(value.isStream) ? value.localFilePath : value.src;
		const params: VideoParams = [
			videoPath,
			regionInfo.left,
			regionInfo.top,
			regionInfo.width,
			regionInfo.height,
			options as keyof typeof StreamProtocol,
		];

		if (!isNil(this.currentlyPlaying[regionInfo.regionName])) {
			timedDebug.log('[processor] currently playing video exists, waiting 50ms');
			await sleep(50);
		}

		// prepare if video is not same as previous one played or if video should be played in background
		if (
			(this.currentlyPlaying[regionInfo.regionName]?.src !== value.src &&
				this.videoPreparing[regionInfo.regionName]?.src !== value.src) ||
			!this.currentlyPlaying[regionInfo.regionName]?.playing ||
			(config.videoOptions.background &&
				value.protocol !== StreamEnums.internal &&
				this.videoPreparing[regionInfo.regionName]?.src !== value.src)
		) {
			if (
				!(await this.files.fileExists(createLocalFilePath(FileStructure.videos, value.src))) &&
				!value.isStream
			) {
				timedDebug.log('[processor] video does not exist in local storage: src=%s', value.src);
				return undefined;
			}

			timedDebug.log('[processor] preparing video: src=%s, region=%s', value.src, regionInfo.regionName);
			await sosVideoObject.prepare(...params);
			this.videoPreparing[regionInfo.regionName] = cloneDeep(value);
			timedDebug.log('[processor] video prepared successfully');
		}
		return {
			sosVideoObject,
			params,
		};
	};

	protected handleHtmlElementPrepare = (
		value: SMILImage | SMILWidget,
		element: HTMLElement,
		version: number,
		timedDebug: TimedDebugger,
		isWidget: boolean = false,
	) => {
		timedDebug.log('[processor] starting html element preparation: src=%s, id=%s', value.src, value.id);

		changeZIndex(value, element, +1);
		timedDebug.log('[processor] changed z-index for element');

		// value.wasUpdated is there for a case when file updates in localstorage under same url,
		// player needs to regenerate src to update it in browser cache
		const smilUrlVersion = getSmilVersionUrl(element.getAttribute('src'));
		let src = generateElementSrc(
			value.src,
			value.localFilePath,
			version,
			smilUrlVersion,
			isWidget,
			value.wasUpdated,
		);
		timedDebug.log('[processor] generated source URL: %s', src);

		if (value.transitionInfo?.type === 'billboard' && !element.style.backgroundImage) {
			timedDebug.log('[processor] setting up billboard transition');
			element.childNodes.forEach((child: HTMLElement) => {
				child.childNodes.forEach((div: HTMLElement) => {
					div.style.backgroundImage = `url(${src})`;
				});
			});
		}
		// add query parameter to invalidate cache on devices
		if ((element.getAttribute('src') === null || element.getAttribute('src') !== src) && value.preload !== false) {
			// src after file update was already regenerated, set to false so
			value.wasUpdated = false;
			timedDebug.log('[processor] updating element src: old=%s, new=%s', element.getAttribute('src'), src);
			element.setAttribute('src', src);
		}
		timedDebug.log('[processor] html element preparation completed');
	};

	private async handleFileChecking(smilFile: SMILFile, restart: () => void): Promise<void> {
		const resources = await this.files.prepareLastModifiedSetup(this.smilObject, smilFile);
		const resourceChecker = new ResourceChecker(
			resources,
			this.synchronization.shouldSync,
			() => this.setCheckFilesLoop(false),
			restart,
		);
		resourceChecker.start();
	}

	/**
	 * Coordinate play synchronization before element playback starts
	 * @returns true if playback should continue, false if element should be skipped (resync)
	 */
	private async coordinatePlaySync(
		regionName: string,
		syncIndex: number,
		timedDebug: TimedDebugger,
		priorityLevel?: number,
	): Promise<boolean> {
		// Coordinate play start - master sends cmd-play, slaves wait for it
		timedDebug.log('[processor-sync] coordinating play start');
		try {
			const action = await this.elementController.coordinatePlayStart(
				regionName,
				syncIndex,
				timedDebug,
				priorityLevel,
			);

			if (action === ProcessAction.RESYNC) {
				timedDebug.log('[processor-sync] resync needed, skipping play coordination');
				return false; // Skip this element during resync
			}

			timedDebug.log('[processor-sync] play start coordination completed');
		} catch (error) {
			timedDebug.log('[processor-sync] error in coordinatePlayStart: %s', error);
			debug('[processor-sync] coordinatePlayStart failed: %O', error);
			this.resetSyncState();
		}

		// Coordinate play complete - master waits for ACKs, slaves wait for signal-ready
		timedDebug.log('[processor-sync] coordinating play completion');
		try {
			await this.elementController.coordinatePlayComplete(
				regionName,
				syncIndex,
				timedDebug,
				priorityLevel,
			);
			timedDebug.log('[processor-sync] play coordination completed, starting synchronized playback');
		} catch (error) {
			timedDebug.log('[processor-sync] error in coordinatePlayComplete: %s', error);
			debug('[processor-sync] coordinatePlayComplete failed: %O', error);
			this.resetSyncState();
		}

		return true; // Continue with playback
	}

	/**
	 * Coordinate finish synchronization after element playback completes
	 * @returns true if should continue, false if element should be skipped (resync)
	 */
	private async coordinateFinishSync(
		regionName: string,
		syncIndex: number,
		timedDebug: TimedDebugger,
		priorityLevel?: number,
	): Promise<boolean> {
		// Coordinate finish start - master sends cmd-finish, slaves wait for it
		timedDebug.log('[processor-sync] coordinating finish start');
		try {
			const action = await this.elementController.coordinateFinishStart(
				regionName,
				syncIndex,
				timedDebug,
				priorityLevel,
			);

			if (action === ProcessAction.RESYNC) {
				timedDebug.log('[processor-sync] resync needed, skipping finish coordination');
				return false;
			}

			timedDebug.log('[processor-sync] finish start coordination completed');
		} catch (error) {
			timedDebug.log('[processor-sync] error in coordinateFinishStart: %s', error);
			debug('[processor-sync] coordinateFinishStart failed: %O', error);
			this.resetSyncState();
		}

		// Coordinate finish complete - master waits for ACKs, slaves wait for signal-ready
		timedDebug.log('[processor-sync] coordinating finish completion');
		try {
			await this.elementController.coordinateFinishComplete(
				regionName,
				syncIndex,
				timedDebug,
				priorityLevel,
			);
			timedDebug.log('[processor-sync] finish coordination completed, all devices synchronized');
		} catch (error) {
			timedDebug.log('[processor-sync] error in coordinateFinishComplete: %s', error);
			debug('[processor-sync] coordinateFinishComplete failed: %O', error);
			this.resetSyncState();
		}

		return true;
	}

	/**
	 * Reset sync state to safe defaults after an error
	 * This prevents corrupted state from affecting subsequent elements
	 */
	private resetSyncState(): void {
		if (this.synchronization.syncingInAction) {
			this.synchronization.syncingInAction = false;
		}
		if (this.synchronization.resyncTargets) {
			delete this.synchronization.resyncTargets.prepare;
			delete this.synchronization.resyncTargets.play;
			delete this.synchronization.resyncTargets.finish;
		}
	}

	/**
	 * Checks if sync coordination should be performed for an element.
	 * Returns true if sync is enabled and the element has a valid syncIndex.
	 */
	private shouldCoordinateSync(syncIndex: number | undefined): boolean {
		return this.synchronization.shouldSync && syncIndex !== undefined;
	}

	/**
	 * Gets the priority level for the currently playing element in a region.
	 */
	private getSyncPriorityLevel(regionName: string, index: number): number | undefined {
		return this.currentlyPlayingPriority[regionName]?.[index]?.priority?.priorityLevel;
	}

	private async handleSyncSetup(firstIteration: boolean): Promise<void> {
		try {
			if (this.sos.config.syncGroupName) {
				debug('[processor-sync] syncGroupName is defined, starting sync setup');
				if (firstIteration) {
					await connectSyncSafe(this.sos);
				}

				await joinAllSyncGroupsOnSmilStart(this.sos, this.synchronization, this.smilObject);

				if (firstIteration && hasDynamicContent(this.smilObject)) {
					await broadcastEndActionToAllDynamics(this.sos, this.synchronization, this.smilObject);
				}
				// give some time for master selection
				await sleep(500);
			} else {
				debug('[processor-sync] no syncGroupName defined, skipping sync setup');
			}
		} catch (error) {
			debug('[processor-sync] sync setup failed: %O', error);
		}
	}

	private async handlePlaylistProcessing(version: number): Promise<void> {
		try {
			const dateTimeBegin = Date.now();
			await this.processPlaylist(this.smilObject.playlist, version);
			debug('[processor] playlist iteration finished: version=%d', version);
			const dateTimeEnd = Date.now();
			if (dateTimeEnd - dateTimeBegin < SMILScheduleEnum.defaultAwait) {
				await sleep(2000);
			}
		} catch (err) {
			debug('[processor] unexpected error during playlist processing: %O', err);
			await sleep(SMILScheduleEnum.defaultAwait);
		}
	}

	private async handlePlaylistLoop(version: number): Promise<void> {
		await this.runEndlessLoop(async () => await this.handlePlaylistProcessing(version), version);
	}
}
