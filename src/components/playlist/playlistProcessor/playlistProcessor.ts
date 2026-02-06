/* tslint:disable:Unnecessary semicolon missing whitespace indent  tab indentation expected align   arguments are not aligned*/
import isNil = require('lodash/isNil');
import isObject = require('lodash/isObject');
import cloneDeep = require('lodash/cloneDeep');
import get = require('lodash/get');
import set = require('lodash/set');
import { PlaylistCommon } from '../playlistCommon/playlistCommon';
import { PlaylistTriggers } from '../playlistTriggers/playlistTriggers';
import { PlaylistPriority } from '../playlistPriority/playlistPriority';
import { PlayingInfo, PlaylistElement, PlaylistOptions } from '../../../models/playlistModels';
import { IFile, IStorageUnit } from '@signageos/front-applet/es6/FrontApplet/FileSystem/types';
import FrontApplet from '@signageos/front-applet/es6/FrontApplet/FrontApplet';
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
	generateParentId,
	getConfigString,
	getDefaultVideoParams,
	getIndexOfPlayingMedia,
	getLastArrayItem,
	getRegionInfo,
	logDebug,
	processRandomPlayMode,
	removeDigits,
	sleep,
} from '../tools/generalTools';
import { SMILEnums, randomPlaylistPlayableTagsRegex } from '../../../enums/generalEnums';
import { isConditionalExpExpired } from '../tools/conditionalTools';
import { SMILScheduleEnum } from '../../../enums/scheduleEnums';
import { ExprTag } from '../../../enums/conditionalEnums';
import { setDefaultAwait, setElementDuration } from '../tools/scheduleTools';
import { createPriorityObject } from '../tools/priorityTools';
import { PriorityObject } from '../../../models/priorityModels';
import { WaitStatus } from '../../../enums/priorityEnums';
import { XmlTags } from '../../../enums/xmlEnums';
import { parseSmilSchedule } from '../tools/wallclockTools';
import { RegionAttributes, RegionsObject } from '../../../models/xmlJsonModels';
import { SMILTriggersEnum } from '../../../enums/triggerEnums';
import { findTriggerToCancel } from '../tools/triggerTools';
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
import { smilEventEmitter, waitForSuccessOrFailEvents } from '../eventEmitter/eventEmitter';
import { createLocalFilePath, getSmilVersionUrl, isWidgetUrl } from '../../files/tools';
import StreamProtocol from '@signageos/front-applet/es6/FrontApplet/Stream/StreamProtocol';
import { IPlaylistProcessor } from './IPlaylistProcessor';
import { DynamicPlaylist, DynamicPlaylistElement } from '../../../models/dynamicModels';
import { SMILDynamicEnum } from '../../../enums/dynamicEnums';
import { getDynamicPlaylistAndId } from '../tools/dynamicPlaylistTools';
import { broadcastSyncValue, cancelDynamicPlaylistMaster, joinSyncGroup } from '../tools/dynamicTools';
import { ensurePlayingDeferred, resolvePlayingDeferred } from '../tools/deferredTools';
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

export class PlaylistProcessor extends PlaylistCommon implements IPlaylistProcessor {
	private checkFilesLoop: boolean = true;
	private playingIntro: boolean = false;
	private readonly playerName: string;
	private readonly playerId: string;
	private triggers: PlaylistTriggers;
	private priority: PlaylistPriority;
	private foundNewPlaylist: boolean = false;
	private playlistVersion: number = 0;
	private internalStorageUnit: IStorageUnit;
	private smilObject: SMILFileObject;
	private elementController: SMILElementController;

	constructor(sos: FrontApplet, files: FilesManager, options: PlaylistOptions) {
		super(sos, files, options);
		this.triggers = new PlaylistTriggers(sos, files, options, this.processPlaylist);
		this.priority = new PlaylistPriority(sos, files, options);
		this.playerName = getConfigString(this.sos.config, 'playerName') ?? '';
		this.playerId = getConfigString(this.sos.config, 'playerId') ?? '';
		this.elementController = new SMILElementController(this.synchronization);
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
		debug('Intro media downloaded: %O', this.smilObject.intro[0]);
		return introMedia;
	};

	/**
	 * plays intro media before actual playlist starts, default behaviour is to play video as intro
	 * @param introMedia - identifier if intro is video or image
	 */
	public playIntro = async (introMedia: string): Promise<Promise<void>[]> => {
		let imageElement: HTMLElement = document.createElement(HtmlEnum.img);

		const intro: SMILIntro = this.smilObject.intro[0];

		debug('Intro media object: %O', intro);
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
				'Stored priority bounds for region=%s, priority=%d: min=%d, max=%d',
				regionName,
				priorityLevel,
				min,
				max,
			);
		}
	};

	/**
	 * excl and priorityClass are not supported in this version, they are processed as seq tags
	 * @param value - JSON object or array of objects
	 * @param version - smil internal version of current playlist
	 * @param parent - superordinate element of value
	 * @param endTime - date in millis when value stops playing
	 * @param conditionalExpr
	 */
	public processPriorityTag = async (
		value: PlaylistElement | PlaylistElement[],
		version: number,
		parent: string = '',
		endTime: number = 0,
		conditionalExpr: string = '',
	): Promise<Promise<void>[]> => {
		const promises: Promise<void>[] = [];
		if (!Array.isArray(value)) {
			value = [value];
		}
		let arrayIndex = value?.length - 1;
		for (let elem of value) {
			// wallclock has higher priority than conditional expression
			if (isConditionalExpExpired(elem, this.playerName, this.playerId)) {
				debug('Conditional expression: %s, for value: %O is false', elem[ExprTag]!, elem);
				if (
					arrayIndex === 0 &&
					setDefaultAwait(value, this.playerName, this.playerId) === SMILScheduleEnum.defaultAwait
				) {
					debug(
						'No active sequence find in conditional expression schedule, setting default await: %s',
						SMILScheduleEnum.defaultAwait,
					);
					await sleep(SMILScheduleEnum.defaultAwait);
				}
				arrayIndex -= 1;
				continue;
			}

			const priorityObject = createPriorityObject(elem as PriorityObject, arrayIndex, value?.length - 1);

			// Extract and store sync index bounds for this priority level
			this.storePriorityBounds(elem, priorityObject.priorityLevel);

			promises.push(
				(async () => {
					await this.processPlaylist(elem, version, parent, endTime, priorityObject, conditionalExpr);
				})(),
			);
			arrayIndex -= 1;
		}

		return promises;
	};

	public processExclTag = async (
		value: PlaylistElement | PlaylistElement[],
		version: number,
		parent: string = '',
		endTime: number = 0,
		conditionalExpr: string = '',
	): Promise<Promise<void>[]> => {
		const promises: Promise<void>[] = [];
		if (!Array.isArray(value)) {
			value = [value];
		}
		let arrayIndex = value?.length - 1;
		for (let elem of value) {
			// wallclock has higher priority than conditional expression
			if (isConditionalExpExpired(elem, this.playerName, this.playerId)) {
				debug('Conditional expression: %s, for value: %O is false', elem[ExprTag]!, elem);
				if (
					arrayIndex === 0 &&
					setDefaultAwait(value, this.playerName, this.playerId) === SMILScheduleEnum.defaultAwait
				) {
					debug(
						'No active sequence find in conditional expression schedule, setting default await: %s',
						SMILScheduleEnum.defaultAwait,
					);
					await sleep(SMILScheduleEnum.defaultAwait);
				}
				arrayIndex -= 1;
				continue;
			}

			promises.push(
				(async () => {
					await this.processPlaylist(elem, version, parent, endTime, {} as PriorityObject, conditionalExpr);
				})(),
			);
			arrayIndex -= 1;
		}

		return promises;
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
			debug('Dynamic playlist detected: %O with version: %s', dynamicPlaylistConfig, version);
			if (!dynamicPlaylistConfig?.data) {
				debug('Dynamic playlist config data is undefined, skipping');
				return;
			}

			if (version < this.getPlaylistVersion()) {
				debug('Dynamic playlist version is older than current playlist version, skipping');
				await sleep(SMILScheduleEnum.defaultAwait);
				return;
			}

			const { dynamicPlaylistId, dynamicMedia } = getDynamicPlaylistAndId(dynamicPlaylistConfig, this.smilObject);

			if (!dynamicPlaylistId || !dynamicMedia) {
				debug('Dynamic playlist for %s was not found', `${dynamicPlaylistConfig.data}`);
				return;
			}

			if (!this.triggers.dynamicPlaylist[dynamicPlaylistId]) {
				this.triggers.dynamicPlaylist[dynamicPlaylistId] = {} as DynamicPlaylistElement;
			}

			if (this.triggers.dynamicPlaylist[dynamicPlaylistId]?.play) {
				debug('Dynamic playlist: %O is already playing with playlist version: %s ', dynamicPlaylistId, version);
				await sleep(300);
				return;
			}

			this.triggers.dynamicPlaylist[dynamicPlaylistId].isMaster = true;

			if (dynamicPlaylistConfig.syncId) {
				const syncGroupName = `${this.synchronization.syncGroupName}-fullScreenTrigger-${dynamicPlaylistConfig.syncId}`;
				await joinSyncGroup(this.sos, this.synchronization, syncGroupName);
				debug(
					'Master dynamic playlist: %O is joining sync group: %s with timestamp: %s',
					dynamicPlaylistConfig,
					syncGroupName,
					Date.now(),
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
				debug('Unexpected error during dynamic playlist playback: %O', err);
				clearInterval(intervalId);
			}
		} catch (err) {
			debug('Unexpected error during dynamic playlist playback: %O', err);
		}
	};

	/**
	 * recursive function which goes through the playlist and process supported tags
	 * is responsible for calling functions which handles actual playing of elements
	 * @param playlist - JSON representation of SMIL parsed playlist
	 * @param version - smil internal version of current playlist
	 * @param parent - superordinate element of value
	 * @param endTime - date in millis when value stops playing
	 * @param priorityObject - contains data about priority behaviour for given playlist
	 * @param conditionalExpr
	 */
	public processPlaylist = async (
		playlist: PlaylistElement | PlaylistElement[],
		version: number,
		parent: string = '',
		endTime: number = 0,
		priorityObject: PriorityObject = {} as PriorityObject,
		conditionalExpr: string = '',
	) => {
		for (let [key, loopValue] of Object.entries(playlist)) {
			// skips processing attributes of elements like repeatCount or wallclock
			if (!isObject(loopValue)) {
				debug('Skipping playlist element with key: %O is not object. value: %O', key, loopValue);
				continue;
			}

			let value: PlaylistElement | PlaylistElement[] | SMILMedia = loopValue;
			debug(
				'Processing playlist element with key: %O, value: %O, parent: %s, endTime: %s, version: %s',
				key,
				value,
				parent,
				endTime,
				version,
			);
			// dont play intro in the actual playlist
			if (XmlTags.extractedElements.concat(XmlTags.textElements).includes(removeDigits(key))) {
				if (isNil((value as SMILMedia).regionInfo)) {
					debug('Invalid element with no regionInfo: %O', value);
					continue;
				}

				const lastPlaylistElem: string = getLastArrayItem(Object.entries(playlist))[0];
				const isLast = lastPlaylistElem === key;
				// Retry loop for priority coordination
				const MAX_RETRIES = 10;
				let retryCount = 0;
				let shouldRetry = true;

				// Create priority coordination object for new version handling
				const priorityCoord =
					priorityObject?.priorityLevel !== undefined
						? {
								version,
								priority: priorityObject.priorityLevel,
						  }
						: undefined;

				while (shouldRetry && retryCount < MAX_RETRIES) {
					// Call priorityBehaviour inside the loop to re-evaluate on each retry
					const { currentIndex, previousPlayingIndex } = await this.priority.priorityBehaviour(
						value as SMILMedia,
						key,
						version,
						parent,
						endTime,
						priorityObject,
					);

					const result = await this.playElement(
						value as SMILMedia,
						version,
						key,
						parent,
						currentIndex,
						previousPlayingIndex,
						endTime,
						isLast,
						priorityCoord,
					);

					if (result === 'RETRY') {
						retryCount++;
						debug(`processPlaylist: Retrying element (attempt ${retryCount}/${MAX_RETRIES}): %O`, value);
						// Small delay before retry
						await sleep(100);
					} else {
						shouldRetry = false;
					}
				}

				if (retryCount >= MAX_RETRIES) {
					debug(`processPlaylist: Max retries reached for element: %O`, value);
				}

				continue;
			}

			let promises: Promise<void>[] = [];

			if (value.hasOwnProperty(ExprTag)) {
				conditionalExpr = value[ExprTag]!;
			}

			if (key === 'excl') {
				// priority is temporary turned off for slab playlist due to sync issue with priority
				promises = await this.processExclTag(
					value,
					version,
					parent === '' ? 'seq' : parent,
					endTime,
					conditionalExpr,
				);

				// promises = await this.processPriorityTag(value, version, parent ?? 'seq', endTime, conditionalExpr);
			}

			if (key === 'priorityClass') {
				promises = await this.processPriorityTag(
					value,
					version,
					parent === '' ? 'seq' : parent,
					endTime,
					conditionalExpr,
				);
			}

			if (
				(removeDigits(key) === SMILDynamicEnum.emitDynamic ||
					removeDigits(key) === SMILDynamicEnum.emitDynamicLegacy) &&
				this.synchronization.shouldSync
			) {
				await this.processDynamicPlaylist(
					value as DynamicPlaylist,
					version,
					parent,
					endTime,
					priorityObject,
					conditionalExpr,
				);
				continue;
			}

			// in case smil has only dynamic content and sync is off, wait for defaultAwait to avoid infinite loop
			if (
				(removeDigits(key) === SMILDynamicEnum.emitDynamic ||
					removeDigits(key) === SMILDynamicEnum.emitDynamicLegacy) &&
				!this.synchronization.shouldSync
			) {
				await sleep(1000);
				continue;
			}

			if (removeDigits(key) === 'par') {
				let newParent = generateParentId(key, value);
				if (Array.isArray(value)) {
					if (parent.startsWith('seq')) {
						for (const elem of value) {
							await this.createDefaultPromise(
								elem,
								version,
								priorityObject,
								newParent,
								elem.repeatCount ? parseInt(elem.repeatCount as string) : 0,
								-1,
								conditionalExpr,
							);
						}
						continue;
					}

					for (const elem of value) {
						if (elem.hasOwnProperty(ExprTag)) {
							conditionalExpr = elem[ExprTag];
						}
						promises.push(
							this.createDefaultPromise(
								elem,
								version,
								priorityObject,
								newParent,
								endTime,
								-1,
								conditionalExpr,
							),
						);
					}
					await Promise.all(promises);
					continue;
				}

				if (value.hasOwnProperty('begin') && value.begin!.indexOf('wallclock') > -1) {
					const { timeToStart, timeToEnd } = parseSmilSchedule(value.begin!, value.end);
					if (timeToEnd === SMILScheduleEnum.neverPlay || timeToEnd < Date.now()) {
						if (
							setDefaultAwait(<PlaylistElement[]>value, this.playerName, this.playerId) ===
							SMILScheduleEnum.defaultAwait
						) {
							debug(
								'No active sequence find in wallclock schedule, setting default await: %s',
								SMILScheduleEnum.defaultAwait,
							);
							await sleep(SMILScheduleEnum.defaultAwait);
						}
						continue;
					}

					// wallclock has higher priority than conditional expression
					if (await this.checkConditionalDefaultAwait(value)) {
						continue;
					}

					if (value.hasOwnProperty(ExprTag)) {
						conditionalExpr = value[ExprTag] as string;
					}

					if (
						!Number.isNaN(parseInt(value.repeatCount as string)) ||
						(isNil(value.repeatCount) && this.smilObject.defaultRepeatCount === '1')
					) {
						promises.push(
							this.createRepeatCountDefinitePromise(
								value,
								priorityObject,
								version,
								'par',
								timeToStart,
								conditionalExpr,
							),
						);
						await Promise.all(promises);
						continue;
					}

					if (
						value.repeatCount === 'indefinite' ||
						(isNil(value.repeatCount) && this.smilObject.defaultRepeatCount === 'indefinite')
					) {
						promises.push(
							this.createRepeatCountIndefinitePromise(
								value,
								priorityObject,
								version,
								parent,
								timeToEnd,
								key,
								conditionalExpr,
								timeToStart,
							),
						);
						await Promise.all(promises);
						continue;
					}

					promises.push(
						this.createDefaultPromise(
							value,
							version,
							priorityObject,
							newParent,
							timeToEnd,
							timeToStart,
							conditionalExpr,
						),
					);
					await Promise.all(promises);
					continue;
				}

				// wallclock has higher priority than conditional expression
				if (await this.checkConditionalDefaultAwait(value)) {
					continue;
				}

				if (value.hasOwnProperty(ExprTag)) {
					conditionalExpr = value[ExprTag]!;
				}

				if (
					value.repeatCount === 'indefinite' ||
					(isNil(value.repeatCount) && this.smilObject.defaultRepeatCount === 'indefinite')
				) {
					promises.push(
						this.createRepeatCountIndefinitePromise(
							value,
							priorityObject,
							version,
							parent,
							endTime,
							key,
							conditionalExpr,
						),
					);
					await Promise.all(promises);
					continue;
				}

				if (
					!Number.isNaN(parseInt(value.repeatCount as string)) ||
					(isNil(value.repeatCount) && this.smilObject.defaultRepeatCount === '1')
				) {
					promises.push(
						this.createRepeatCountDefinitePromise(value, priorityObject, version, key, -1, conditionalExpr),
					);
					await Promise.all(promises);
					continue;
				}
				promises.push(
					this.createDefaultPromise(value, version, priorityObject, newParent, endTime, -1, conditionalExpr),
				);
			}

			if (removeDigits(key) === 'seq') {
				let newParent = generateParentId('seq', value);
				if (!Array.isArray(value)) {
					value = [value];
				}
				let arrayIndex = 0;
				for (let valueElement of value) {
					debug('processing seq element: %O', valueElement);

					if (valueElement.playMode) {
						const playModeParentId = generateParentId('seq', valueElement);
						debug('Processing random play mode: %O with parent: %s', valueElement, playModeParentId);

						// Coordinate playMode=one index BEFORE element selection
						if (valueElement.playMode.toLowerCase() === 'one' && this.synchronization.shouldSync && !this.synchronization.syncingInAction) {
							// Extract region from first playable child for sync group lookup
							const playableKey = Object.keys(valueElement).find((k) => randomPlaylistPlayableTagsRegex.test(k));
							const firstChild = playableKey ? valueElement[playableKey] : undefined;
							const regionName = (Array.isArray(firstChild) ? firstChild[0] : firstChild)?.regionInfo?.regionName;

							if (regionName) {
								if (!this.randomPlaylist[playModeParentId]) {
									this.randomPlaylist[playModeParentId] = { previousIndex: 0 };
								}
								const syncedIndex = await this.elementController.coordinatePlayModeSync(
									regionName,
									playModeParentId,
									this.randomPlaylist[playModeParentId].previousIndex,
									this.randomPlaylist,
								);
								this.randomPlaylist[playModeParentId].previousIndex = syncedIndex;
							}
						}

						valueElement = processRandomPlayMode(
							valueElement,
							this.randomPlaylist,
							playModeParentId,
						);
					}

					// debug('processing seq element: %O', valueElement);
					if (valueElement.hasOwnProperty(ExprTag)) {
						conditionalExpr = valueElement[ExprTag];
					}

					if (valueElement.hasOwnProperty('begin') && valueElement.begin.indexOf('wallclock') > -1) {
						const { timeToStart, timeToEnd } = parseSmilSchedule(valueElement.begin, valueElement.end);
						// if no playable element was found in array, set defaultAwait for last element to avoid infinite loop
						if (
							arrayIndex === value?.length - 1 &&
							setDefaultAwait(value, this.playerName, this.playerId) === SMILScheduleEnum.defaultAwait
						) {
							debug(
								'No active sequence find in wallclock schedule, setting default await: %s',
								SMILScheduleEnum.defaultAwait,
							);
							await sleep(SMILScheduleEnum.defaultAwait);
						}

						if (timeToEnd === SMILScheduleEnum.neverPlay || timeToEnd < Date.now()) {
							arrayIndex += 1;
							continue;
						}

						// wallclock has higher priority than conditional expression
						if (await this.checkConditionalDefaultAwait(valueElement, arrayIndex, value?.length)) {
							arrayIndex += 1;
							continue;
						}
						if (
							!Number.isNaN(parseInt(valueElement.repeatCount as string)) ||
							(isNil(valueElement.repeatCount) && this.smilObject.defaultRepeatCount === '1')
						) {
							if (timeToStart <= 0 || value?.length === 1) {
								promises.push(
									this.createRepeatCountDefinitePromise(
										valueElement,
										priorityObject,
										version,
										parent,
										timeToStart,
										conditionalExpr,
									),
								);
							}
							if (!parent.startsWith('par')) {
								await Promise.all(promises);
							}
							arrayIndex += 1;
							continue;
						}

						if (
							valueElement.repeatCount === 'indefinite' ||
							(isNil(valueElement.repeatCount) && this.smilObject.defaultRepeatCount === 'indefinite')
						) {
							if (timeToStart <= 0 || value?.length === 1) {
								if (value?.length === 1) {
									promises.push(
										this.createRepeatCountIndefinitePromise(
											valueElement,
											priorityObject,
											version,
											parent,
											timeToEnd,
											key,
											conditionalExpr,
											timeToStart,
										),
									);
								} else {
									// override combination of wallclock and repeatCount=indefinite in multiple seq tags to repeatCount=1
									promises.push(
										this.createRepeatCountDefinitePromise(
											valueElement,
											priorityObject,
											version,
											parent,
											timeToStart,
											conditionalExpr,
										),
									);
								}
							}
							if (!parent.startsWith('par')) {
								await Promise.all(promises);
							}
							arrayIndex += 1;
							continue;
						}

						// play at least one from array to avoid infinite loop
						if (value?.length === 1 || timeToStart <= 0) {
							promises.push(
								this.createDefaultPromise(
									valueElement,
									version,
									priorityObject,
									newParent,
									timeToEnd,
									timeToStart,
									conditionalExpr,
								),
							);
						}
						if (!parent.startsWith('par')) {
							await Promise.all(promises);
						}
						arrayIndex += 1;
						continue;
					}

					// wallclock has higher priority than conditional expression
					if (await this.checkConditionalDefaultAwait(valueElement, arrayIndex, value?.length)) {
						arrayIndex += 1;
						continue;
					}

					if (
						!Number.isNaN(parseInt(valueElement.repeatCount as string)) ||
						(isNil(valueElement.repeatCount) && this.smilObject.defaultRepeatCount === '1')
					) {
						promises.push(
							this.createRepeatCountDefinitePromise(
								valueElement,
								priorityObject,
								version,
								'seq',
								-1,
								conditionalExpr,
							),
						);
						if (!parent.startsWith('par')) {
							await Promise.all(promises);
						}
						continue;
					}

					if (
						valueElement.repeatCount === 'indefinite' ||
						(isNil(valueElement.repeatCount) && this.smilObject.defaultRepeatCount === 'indefinite')
					) {
						promises.push(
							this.createRepeatCountIndefinitePromise(
								valueElement,
								priorityObject,
								version,
								parent,
								endTime,
								key,
								conditionalExpr,
							),
						);

						if (!parent.startsWith('par')) {
							await Promise.all(promises);
						}
						continue;
					}

					promises.push(
						this.createDefaultPromise(
							valueElement,
							version,
							priorityObject,
							newParent,
							endTime,
							-1,
							conditionalExpr,
						),
					);

					if (!parent.startsWith('par')) {
						await Promise.all(promises);
					}
				}
			}

			await Promise.all(promises);
		}
	};

	private createDefaultPromise = (
		value: PlaylistElement,
		version: number,
		priorityObject: PriorityObject,
		parent: string,
		timeToEnd: number,
		timeToStart: number = -1,
		conditionalExpr: string = '',
	): Promise<void> => {
		return (async () => {
			// if smil file was updated during the timeout wait, cancel that timeout and reload smil again
			if (timeToStart > 0 && (await this.waitTimeoutOrFileUpdate(timeToStart))) {
				return;
			}
			await this.processPlaylist(value, version, parent, timeToEnd, priorityObject, conditionalExpr);
		})();
	};

	private createRepeatCountDefinitePromise = (
		value: PlaylistElement,
		priorityObject: PriorityObject,
		version: number,
		parent: string,
		timeToStart: number = -1,
		conditionalExpr: string = '',
	): Promise<void> => {
		debug('Processing playlist element with repeatCount definite. Value: %O', value);
		const repeatCount: number = Number.isNaN(parseInt(value.repeatCount as string))
			? 1
			: parseInt(value.repeatCount as string);

		let counter = 0;
		return (async () => {
			let newParent = generateParentId(parent, value);
			// if smil file was updated during the timeout wait, cancel that timeout and reload smil again
			if (timeToStart > 0 && (await this.waitTimeoutOrFileUpdate(timeToStart))) {
				return;
			}
			while (counter < repeatCount && version >= this.getPlaylistVersion()) {
				await this.processPlaylist(value, version, newParent, repeatCount, priorityObject, conditionalExpr);
				counter += 1;
			}
		})();
	};

	private createRepeatCountIndefinitePromise = (
		value: PlaylistElement,
		priorityObject: PriorityObject,
		version: number,
		parent: string,
		endTime: number,
		key: string,
		conditionalExpr: string = '',
		timeToStart: number = -1,
	): Promise<void> => {
		return (async () => {
			debug('Processing playlist element with repeatCount indefinite. Value: %O, endTime: %s', value, endTime);
			// if smil file was updated during the timeout wait, cancel that timeout and reload smil again
			if (timeToStart > 0 && (await this.waitTimeoutOrFileUpdate(timeToStart))) {
				return;
			}
			// when endTime is not set, play indefinitely
			if (endTime === 0) {
				let newParent = generateParentId(key, value);
				let dynamicPlaylistId = undefined;
				if (value.hasOwnProperty('begin') && value.begin?.startsWith(SMILDynamicEnum.dynamicFormat)) {
					dynamicPlaylistId = value.begin;
				}

				await this.runEndlessLoop(
					async () => {
						await this.processPlaylist(value, version, newParent, endTime, priorityObject, conditionalExpr);
					},
					version,
					conditionalExpr,
					this.triggers.dynamicPlaylist,
					dynamicPlaylistId,
				);
				// play N-times, is determined by higher level tag, because this one has repeatCount=indefinite
			} else if (endTime > 0 && endTime <= 1000 && version >= this.getPlaylistVersion()) {
				let newParent = generateParentId(key, value);
				if (key.startsWith('seq')) {
					newParent = parent.replace('par', 'seq');
				}
				await this.processPlaylist(value, version, newParent, endTime, priorityObject, conditionalExpr);
			} else {
				let newParent = generateParentId(key, value);
				while (Date.now() <= endTime && version >= this.getPlaylistVersion()) {
					await this.processPlaylist(value, version, newParent, endTime, priorityObject, conditionalExpr);
					// force stop because new version of smil file was detected
					if (this.getCancelFunction()) {
						return;
					}
				}
			}
		})();
	};

	/**
	 * checks if conditional expression is true or false and if there is other element
	 * which can be played in playlist, if not sets default await time
	 * @param value - current element in playlist
	 * @param arrayIndex - index of element in media array ( only for seq tag )
	 * @param length - length of media array
	 */
	private checkConditionalDefaultAwait = async (
		value: PlaylistElement,
		arrayIndex: number = -1,
		length: number = -1,
	): Promise<boolean> => {
		if (arrayIndex === -1) {
			if (isConditionalExpExpired(value, this.playerName, this.playerId)) {
				debug('Conditional expression : %s, for value: %O is false', value[ExprTag]!, value);
				if (
					setDefaultAwait(<PlaylistElement[]>value, this.playerName, this.playerId) ===
					SMILScheduleEnum.defaultAwait
				) {
					debug(
						'No active sequence find in conditional expression schedule, setting default await: %s',
						SMILScheduleEnum.defaultAwait,
					);
					await sleep(SMILScheduleEnum.defaultAwait);
				}
				return true;
			}
		} else {
			if (isConditionalExpExpired(value, this.playerName, this.playerId)) {
				debug('Conditional expression: %s, for value: %O is false', value[ExprTag]!, value);
				if (
					arrayIndex === length - 1 &&
					setDefaultAwait(<PlaylistElement[]>value, this.playerName, this.playerId) ===
						SMILScheduleEnum.defaultAwait
				) {
					debug(
						'No active sequence find in conditional expression schedule, setting default await: %s',
						SMILScheduleEnum.defaultAwait,
					);
					await sleep(SMILScheduleEnum.defaultAwait);
				}
				return true;
			}
		}
		return false;
	};

	/**
	 * Processes a playlist version update - cancels old content and updates version tracking.
	 * Called BEFORE waiting for old promises to prevent V2 from getting stuck waiting for V1.
	 * This fixes a race condition where the new playlist would wait for old content's promises
	 * before reaching the version update code, causing the update to never happen.
	 * @param version - The new version that's starting
	 * @returns true if an update was processed, false otherwise
	 */
	private processVersionUpdate = async (version: number): Promise<boolean> => {
		// Check if this is a version update: checkFilesLoop is false (update pending) and version is newer
		if (!this.getCheckFilesLoop() && version > this.getPlaylistVersion()) {
			debug(
				'Processing version update from shouldWaitAndContinue: version: %s, playlistVersion: %s',
				version,
				this.getPlaylistVersion(),
			);

			// Update playlist version
			this.setPlaylistVersion(version);

			// Set cancel function for old version
			if (this.getPlaylistVersion() > 0) {
				debug('setting up cancel function for index %s', this.getPlaylistVersion() - 1);
				this.setCancelFunction(true, this.getPlaylistVersion() - 1);
			}

			// Reset checkFilesLoop to indicate update was processed
			this.setCheckFilesLoop(true);

			// Reset foundNewPlaylist flag
			this.foundNewPlaylist = false;

			// Stop all currently playing content
			await this.stopAllContent();

			// Clear old promises for ALL regions since we just cancelled everything
			for (const region in this.promiseAwaiting) {
				if (this.promiseAwaiting[region]?.promiseFunction) {
					debug('Clearing old promises for region %s after version update', region);
					this.promiseAwaiting[region].promiseFunction = [];
					// Reset priority tracking for clean state
					if ((this.promiseAwaiting[region] as any).highestProcessingPriority !== undefined) {
						(this.promiseAwaiting[region] as any).highestProcessingPriority = -1;
					}
				}
			}

			// Resolve all playing deferreds to unblock any waiters
			for (const region in this.currentlyPlayingPriority) {
				for (const entry of this.currentlyPlayingPriority[region]) {
					resolvePlayingDeferred(entry.player);
				}
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
		timedDebug.log('Checking regions for cancellation: %O, %O, %O', element, regionInfo, parentRegion);
		// failover fullscreen trigger or dynamic playlist
		if (
			regionInfo.regionName === 'fullScreenTrigger' &&
			(this.synchronization.shouldCancelAll ||
				(element.hasOwnProperty(SMILDynamicEnum.dynamicValue) && !this.currentlyPlaying.fullScreenTrigger))
		) {
			this.synchronization.shouldCancelAll = false;
			await this.stopAllContent(false);
		}
		// newer playlist starts its playback, cancel older one
		// NOTE: This is a fallback path - version updates are now primarily handled in processVersionUpdate()
		// called from shouldWaitAndContinue() BEFORE waiting for old promises
		if (!this.getCheckFilesLoop() && version > this.getPlaylistVersion()) {
			timedDebug.log(
				'cancelling older playlist from checkRegionsForCancellation (fallback): version: %s, playlistVersion: %s',
				version,
				this.getPlaylistVersion(),
			);
			this.setPlaylistVersion(version);
			if (this.getPlaylistVersion() > 0) {
				timedDebug.log('setting up cancel function for index %s', this.getPlaylistVersion() - 1);
				this.setCancelFunction(true, this.getPlaylistVersion() - 1);
			}
			this.setCheckFilesLoop(true);
			this.foundNewPlaylist = false;
			await this.stopAllContent();
			return;
		}

		// cancel if video is not same as previous one played in the parent region ( triggers case )
		if (
			parentRegion.regionName !== regionInfo.regionName &&
			this.currentlyPlaying[parentRegion.regionName]?.playing
		) {
			timedDebug.log(
				'cancelling media in parent region: %s from element: %s',
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
				'cancelling media: %s in default region from element: %s',
				this.currentlyPlaying[SMILEnums.defaultRegion].src,
				element.src,
			);
			this.playingIntro = false;
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
				'cancelling media: %s from element: %s',
				this.currentlyPlaying[regionInfo.regionName]?.src,
				element.src,
			);

			// trigger cancels trigger
			if (
				!isNil(this.currentlyPlaying[regionInfo.regionName][SMILTriggersEnum.triggerValue]) &&
				!isNil(element.triggerValue) &&
				this.currentlyPlaying[regionInfo.regionName][SMILTriggersEnum.triggerValue] !== element.triggerValue
			) {
				timedDebug.log(
					'cancelling trigger: %s from element: %s',
					this.currentlyPlaying[regionInfo.regionName].src,
					element.src,
				);
				let triggerValueToCancel = findTriggerToCancel(
					this.triggers.triggersEndless,
					regionInfo.regionName,
					element.triggerValue,
				);
				timedDebug.log(
					'cancelling trigger: %s withId: %s',
					this.currentlyPlaying[regionInfo.regionName].src,
					triggerValueToCancel,
				);
				timedDebug.log('cancelling trigger: %O', this.triggers.triggersEndless);
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
				'cancelling dynamic media: %s from element: %s',
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
	private setCurrentlyPlaying = (
		element: SMILVideo | SosHtmlElement,
		tag: string,
		regionName: string,
		timedDebug?: TimedDebugger,
	) => {
		logDebug(timedDebug, 'Setting currently playing: %O for region: %s with tag: %s', element, regionName, tag);
		const nextElement = cloneDeep(this.currentlyPlaying[regionName]?.nextElement);
		this.currentlyPlaying[regionName] = <PlayingInfo>cloneDeep(element);
		this.currentlyPlaying[regionName].media = tag;
		this.currentlyPlaying[regionName].playing = true;
		this.currentlyPlaying[regionName].nextElement = nextElement;
		// dynamic playlist
		if (element.dynamicValue) {
			logDebug(timedDebug, 'setting dynamic value: %s', element.dynamicValue);
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
	private playHtmlContent = async (
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

			this.promiseAwaiting[currentRegionInfo.regionName].promiseFunction! = [
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
							'Finished iteration of playlist: %O',
							this.currentlyPlayingPriority[currentRegionInfo.regionName][currentIndex],
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
							'Finished checking iteration of playlist: %O',
							this.currentlyPlayingPriority[currentRegionInfo.regionName][currentIndex],
						);

						if (hasTransition) {
							removeTransitionCss(element);
						}

						changeZIndex(value, element, -2);

						timedDebug.log('finished playing element: %O', value);
					} catch (err) {
						timedDebug.log(
							'Unexpected error: %O during html element playback promise function: %s',
							err,
							value.localFilePath,
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
			];
		} catch (err) {
			timedDebug.log('Unexpected error: %O during html element playback: %s', err, value.localFilePath);

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
	private waitMediaOnScreen = async (
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
		timedDebug.log('Starting to play element wait media function: %O', element);
		let duration = setElementDuration(element.dur);
		let transitionSet = false;

		await this.checkRegionsForCancellation(element, currentRegionInfo, parentRegionInfo, version, timedDebug);

		// rare case during seamless update with only one widget in playlist.
		if (elementHtml.style.visibility !== 'visible') {
			elementHtml.style.visibility = 'visible';
			elementHtml.setAttribute('src', element.src);
		}
		const tag = element.id.indexOf('ticker') > -1 ? 'ticker' : 'html';

		this.setCurrentlyPlaying(element, tag, currentRegionInfo.regionName, timedDebug);

		timedDebug.log('waiting image duration: %s from element: %s', duration, element.id);

		while (
			duration > 0 &&
			!get(this.currentlyPlayingPriority, `${currentRegionInfo.regionName}`)[arrayIndex]?.player.stop &&
			this.currentlyPlaying[currentRegionInfo.regionName]?.player !== 'stop'
		) {
			while (
				this.currentlyPlayingPriority[currentRegionInfo.regionName][arrayIndex] &&
				get(this.currentlyPlayingPriority, `${currentRegionInfo.regionName}`)[arrayIndex]?.player
					.contentPause !== 0
			) {
				await sleep(100);
				// if playlist is paused and new smil file version is detected, cancel pause behaviour and cancel playlist
				if (this.getCancelFunction()) {
					await this.cancelPreviousMedia(currentRegionInfo);
				}
			}
			if (
				transitionDuration !== 0 &&
				duration < transitionDuration &&
				this.currentlyPlaying[currentRegionInfo.regionName].nextElement?.type === 'html' &&
				!transitionSet
			) {
				transitionSet = true;
				timedDebug.log(
					'setting transition css for element: %O, duration: %s, transitionDuration: %s',
					element,
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
			duration -= 100;
			await sleep(100);
		}

		timedDebug.log('element playing finished: %O', element);

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
	private waitTimeoutOrFileUpdate = async (timeout: number): Promise<boolean> => {
		const promises = [];
		let fileUpdated = false;
		promises.push(sleep(timeout));
		promises.push(
			new Promise<void>(async (resolve) => {
				while (!this.getCancelFunction()) {
					await sleep(1000);
				}
				fileUpdated = true;
				resolve();
			}),
		);
		await Promise.race(promises);
		return fileUpdated;
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
	private shouldWaitAndContinue = async (
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
		if (isNil(this.promiseAwaiting[regionInfo.regionName])) {
			this.promiseAwaiting[regionInfo.regionName] = cloneDeep(media);
			this.promiseAwaiting[regionInfo.regionName].promiseFunction = [];
			this.promiseAwaiting[regionInfo.regionName].version = version;
			this.promiseAwaiting[regionInfo.regionName].highestProcessingPriority = -1;
		}
		if (isNil(this.promiseAwaiting[regionInfo.regionName]?.promiseFunction)) {
			this.promiseAwaiting[regionInfo.regionName].promiseFunction = [];
		}

		if (isNil(this.currentlyPlaying[regionInfo.regionName])) {
			this.currentlyPlaying[regionInfo.regionName] = <PlayingInfo>{};
		}

		// Wait for previous promise to finish BEFORE claiming priority tracking
		// This prevents race condition where new priority claims tracking while stuck waiting
		if (
			this.currentlyPlayingPriority[parentRegionName][previousPlayingIndex].behaviour !== 'pause' &&
			this.promiseAwaiting[regionInfo.regionName]?.promiseFunction!?.length > 0 &&
			(!media.hasOwnProperty(SMILTriggersEnum.triggerValue) ||
				media.triggerValue === this.promiseAwaiting[regionInfo.regionName].triggerValue)
		) {
			this.currentlyPlaying[regionInfo.regionName].nextElement = cloneDeep(media);
			this.currentlyPlaying[regionInfo.regionName].nextElement.type =
				get(media, 'localFilePath', 'default').indexOf(FileStructure.videos) === -1 ? 'html' : 'video';

			timedDebug.log('checking if this playlist is newer version than currently playing');
			if (version > this.playlistVersion && !media.hasOwnProperty(SMILTriggersEnum.triggerValue)) {
				this.foundNewPlaylist = true;
			}
			if (this.promiseAwaiting[regionInfo.regionName]) {
				// Check for version update BEFORE waiting for old promises
				// This fixes race condition where V2 gets stuck waiting for V1's content
				const versionUpdateProcessed = await this.processVersionUpdate(version);

				if (versionUpdateProcessed) {
					timedDebug.log(
						'Version update processed, skipping wait for old promises in region: %s',
						regionInfo.regionName,
					);
					// Continue without waiting - old promises were just cancelled
				} else {
					// Re-check after async call and use local variable for type safety
					const promiseAwaitingRegion = this.promiseAwaiting[regionInfo.regionName];
					const promisesToWait = promiseAwaitingRegion?.promiseFunction;
					if (promisesToWait && promisesToWait.length > 0) {
						// No version update - proceed with normal promise waiting
						timedDebug.log(
							'waiting for previous promise in current region: %s, %O, with timestamp : %s',
							regionInfo.regionName,
							media,
							Date.now(),
						);
						timedDebug.log('promiseAwaitingRegion: %O', promiseAwaitingRegion);
						await Promise.all(promisesToWait);
						timedDebug.log(
							'waiting for previous promise in current region finished: %s, %O with timestamp: %s',
							regionInfo.regionName,
							media,
							Date.now(),
						);
					}
				}
				// Note: Priority tracking cleanup will happen after coordination below
			}
		}

		// Priority coordination for ALL elements (AFTER waiting for old promise)
		// This runs for every element to ensure proper priority sequencing within the same version

		if (priorityCoord) {
			const promiseObj = this.promiseAwaiting[regionInfo.regionName] as any;
			const myPriority = priorityCoord.priority;

			// Initialize version tracking for new version
			if (!promiseObj.version || promiseObj.version < version) {
				promiseObj.version = version;
				promiseObj.highestProcessingPriority = myPriority;
				timedDebug.log(`Initialized priority tracking - version: ${version}, priority: ${myPriority}`);
			} else if (promiseObj.version === version) {
				// For same version, track the highest priority (highest number) currently processing
				const currentTracked = promiseObj.highestProcessingPriority ?? myPriority;
				promiseObj.highestProcessingPriority = Math.max(currentTracked, myPriority);
				timedDebug.log(
					`Updated highest priority tracking to: ${promiseObj.highestProcessingPriority} (current: ${currentTracked}, new: ${myPriority})`,
				);
			}

			const currentHighest = promiseObj.highestProcessingPriority ?? -1;

			// If a higher priority (higher number) is already processing, retry later
			if (currentHighest > myPriority) {
				timedDebug.log(
					`Priority ${myPriority} (lower) waiting - higher priority ${currentHighest} is currently processing`,
				);
				await sleep(100);

				// Check if cancelled while waiting
				if (version < this.playlistVersion || this.getCancelFunction()) {
					// Clean up before skipping
					if (priorityCoord) {
						this.cleanupPriorityTracking(
							regionInfo.regionName,
							priorityCoord.version,
							priorityCoord.priority,
						);
					}
					return WaitStatus.SKIP;
				}
				timedDebug.log(
					`Priority ${myPriority} (lower) retrying - higher priority ${currentHighest} is currently processing`,
				);
				return WaitStatus.RETRY;
			}

			// Priority can proceed - no higher priority blocking
			timedDebug.log(
				`Priority ${myPriority} proceeding - no higher priority blocking (tracked highest: ${currentHighest})`,
			);
		}

		// wait for all
		if (
			this.triggers.dynamicPlaylist[media.dynamicValue!]?.isMaster &&
			this.currentlyPlayingPriority[parentRegionName][previousPlayingIndex].behaviour !== 'pause' &&
			version >= this.getPlaylistVersion()
		) {
			timedDebug.log(
				'Master dynamic playlist is waiting for all preceding content to finish: %s, %s',
				media.dynamicValue,
				Date.now(),
			);
			let promises: Promise<void>[] = [];
			for (const [, promise] of Object.entries(this.promiseAwaiting)) {
				promises = promises.concat(promise.promiseFunction!);
			}
			await Promise.all(promises);
			timedDebug.log(
				'Master dynamic playlist finished waiting for all preceding content to finish: %s, %s',
				media.dynamicValue,
				Date.now(),
			);
		}

		if (media.dynamicValue && !this.synchronization.shouldSync) {
			timedDebug.log(
				'dynamic playlist will not play because synchronization has been stopped: %s, %s',
				media.dynamicValue,
				this.synchronization.shouldSync,
			);
			await cancelDynamicPlaylistMaster(
				this.triggers,
				this.sos,
				this.currentlyPlaying,
				this.synchronization,
				this.currentlyPlayingPriority,
				media.dynamicValue!,
			);
			// Clean up before skipping
			if (priorityCoord) {
				this.cleanupPriorityTracking(regionInfo.regionName, priorityCoord.version, priorityCoord.priority);
			}
			return WaitStatus.SKIP;
		}

		if (
			media.hasOwnProperty(SMILTriggersEnum.triggerValue) &&
			!this.triggers.triggersEndless[media.triggerValue as string]?.play
		) {
			timedDebug.log('trigger was cancelled prematurely: %s', media.triggerValue);
			// Clean up before skipping
			if (priorityCoord) {
				this.cleanupPriorityTracking(regionInfo.regionName, priorityCoord.version, priorityCoord.priority);
			}
			return WaitStatus.SKIP;
		}

		if (
			media.dynamicValue &&
			!this.triggers.dynamicPlaylist[media.dynamicValue!]?.play &&
			media.src !== this.currentlyPlaying[regionInfo.regionName].src
		) {
			for (const elem of this.currentlyPlayingPriority[parentRegionName]) {
				if (elem.media.dynamicValue) {
					elem.player.playing = false;
					resolvePlayingDeferred(elem.player);
				}
			}
			set(this.currentlyPlaying, `${regionInfo.regionName}.playing`, false);
			timedDebug.log('dynamic playlist was cancelled prematurely: %s', media.dynamicValue);
			// Clean up before skipping
			if (priorityCoord) {
				this.cleanupPriorityTracking(regionInfo.regionName, priorityCoord.version, priorityCoord.priority);
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
		if (
			currentIndexPriority?.player.stop ||
			currentIndexPriority?.player.contentPause !== 0 ||
			currentIndexPriority?.behaviour === 'pause'
		) {
			timedDebug.log(
				'Playlist was stopped/paused by higher priority during await: %O, media: %O',
				currentIndexPriority,
				media,
			);
			// Clean up before skipping
			if (priorityCoord) {
				this.cleanupPriorityTracking(regionInfo.regionName, priorityCoord.version, priorityCoord.priority);
			}
			return WaitStatus.SKIP;
		}

		if (currentIndexPriority?.player.endTime <= Date.now() && currentIndexPriority?.player.endTime > 1000) {
			timedDebug.log(
				'Playtime for playlist: %O with media: %O was exceeded wait, exiting',
				currentIndexPriority,
				media,
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
				this.cleanupPriorityTracking(regionInfo.regionName, priorityCoord.version, priorityCoord.priority);
			}
			return WaitStatus.SKIP;
		}

		timedDebug.log('Playlist is ready to play: %O with media: %O', currentIndexPriority, media);
		this.currentlyPlayingPriority[regionInfo.regionName][currentIndex].player.playing = true;
		ensurePlayingDeferred(this.currentlyPlayingPriority[regionInfo.regionName][currentIndex].player);
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
	private playVideo = async (
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
			timedDebug.log('Playing video: %O', video);

			// trigger combined with video background
			if (config.videoOptions.background) {
				await sosVideoObject.prepare(...params);
			}

			this.promiseAwaiting[currentRegionInfo.regionName].promiseFunction! = [
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

						timedDebug.log('Playing video finished: %O in playlist version: %s', video, version);

						// no await to not to block playback when server takes too long to respond
						this.files.sendMediaReport(
							video,
							taskStartDate,
							'video',
							!!video.syncIndex && this.synchronization.shouldSync,
						);

						// create currentlyPlayingPriority for trigger nested region
						if (currentRegionInfo.regionName !== parentRegionInfo.regionName) {
							this.currentlyPlayingPriority[currentRegionInfo.regionName] =
								this.currentlyPlayingPriority[parentRegionInfo.regionName];
						}

						while (
							!isNil(this.currentlyPlayingPriority[currentRegionInfo.regionName]) &&
							this.currentlyPlayingPriority[currentRegionInfo.regionName][arrayIndex] &&
							this.currentlyPlayingPriority[currentRegionInfo.regionName][arrayIndex]?.player
								.contentPause !== 0
						) {
							video.playing = false;
							await sleep(100);
							// if playlist is paused and new smil file version is detected, cancel pause behaviour and cancel playlist
							if (this.getCancelFunction()) {
								await this.cancelPreviousMedia(currentRegionInfo);
								timedDebug.log(
									'Finished iteration of playlist: %O',
									this.currentlyPlayingPriority[currentRegionInfo.regionName][currentIndex],
								);

								await handlePriorityWhenDone();
								break;
							}
						}

						if (this.getCancelFunction()) {
							await this.cancelPreviousMedia(currentRegionInfo);
							timedDebug.log(
								'Finished iteration of playlist: %O',
								this.currentlyPlayingPriority[currentRegionInfo.regionName][currentIndex],
							);

							await handlePriorityWhenDone();
							return;
						}

						timedDebug.log(
							'Finished iteration of playlist: %O',
							this.currentlyPlayingPriority[currentRegionInfo.regionName][currentIndex],
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
						timedDebug.log('Unexpected error: %O occurred during single video playback: %O', err, video);

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
					timedDebug.log('finished playing element: %O', video);
				})(),
			];

			// give time to smil player to play video before massive wallclock processing
			await sleep(1000);
		} catch (err) {
			timedDebug.log('Unexpected error: %O occurred during single video prepare: %O', err, video);
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

	private handleVideoPlay = async (
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
		let videoEnded = false;
		params.pop();
		if (
			this.currentlyPlaying[currentRegionInfo.regionName]?.src !== video.src &&
			this.currentlyPlaying[currentRegionInfo.regionName]?.playing &&
			(this.currentlyPlaying[currentRegionInfo.regionName] as any)?.isStream
		) {
			timedDebug.log(
				'cancelling stream: %s from element: %s',
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
			timedDebug.log('Calling## video play function - single video: %O', video);
			await sosVideoObject.play(...params);
			timedDebug.log('After## video play function - single video: %O', video);
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

		timedDebug.log('Starting## playing video onceEnded function - single video: %O', video);
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
			(async () => {
				while (
					!get(this.currentlyPlayingPriority, `${currentRegionInfo.regionName}`)[arrayIndex]?.player.stop &&
					!videoEnded
				) {
					await sleep(100);
				}
			})(),
		);

		// due to webos bug when onceEnded function never resolves, add videoDuration + 1000ms function to resolve
		// so playback can continue
		// TODO: fix in webos app
		if ('fullVideoDuration' in video && video.fullVideoDuration !== SMILEnums.defaultVideoDuration) {
			timedDebug.log('Got fullVideoDuration: %s for video: %O', video.fullVideoDuration!, video);
			promiseRaceArray.push(sleep(video.fullVideoDuration! + SMILEnums.videoDurationOffset));
		}

		// if video has specified duration in smil file, cancel it after given duration passes
		if ('dur' in video) {
			const parsedDuration = setElementDuration(video.dur!);
			timedDebug.log('Got dur: %s for video: %O', parsedDuration, video);
			promiseRaceArray.push(sleep(parsedDuration));
		}

		try {
			await Promise.race(promiseRaceArray);
			videoEnded = true;
		} catch (err) {
			timedDebug.log('Unexpected error: %O during single video playback onceEnded at video: %O', err, video);
			videoEnded = true;
		}
	};

	private handleStreamPlay = async (
		stream: SMILVideo,
		params: VideoParams,
		sosVideoObject: Video | Stream,
		currentRegionInfo: RegionAttributes,
		parentRegionInfo: RegionAttributes,
		version: number,
		timedDebug: TimedDebugger,
	) => {
		timedDebug.log('Starting stream playback for: %O', stream);
		let promiseRaceArray = [];

		if (stream.protocol === StreamEnums.internal) {
			timedDebug.log('Removing protocol parameter for internal stream');
			params.pop();
		}

		await sosVideoObject.play(...params);

		await this.checkRegionsForCancellation(stream, currentRegionInfo, parentRegionInfo, version, timedDebug);

		this.setCurrentlyPlaying(stream, 'video', currentRegionInfo.regionName, timedDebug);

		if ('dur' in stream) {
			const parsedDuration: number = setElementDuration(stream.dur!);
			timedDebug.log('Got dur: %s for stream: %O', parsedDuration, stream);
			promiseRaceArray.push(sleep(parsedDuration));
		}

		promiseRaceArray.push(
			waitForSuccessOrFailEvents(smilEventEmitter, stream, StreamEnums.disconnectedEvent, StreamEnums.errorEvent),
		);

		try {
			await Promise.race(promiseRaceArray);
		} catch (err) {
			timedDebug.log('Unexpected error: %O during single stream playback play at stream: %O', err, stream);
		}
	};

	private setupIntroVideo = async (video: SMILVideo, region: RegionsObject) => {
		const currentVideoDetails = <IFile>(
			await this.files.getFileDetails(video, this.internalStorageUnit, FileStructure.videos)
		);
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
	};

	private setupIntroImage = async (image: SMILImage, region: RegionsObject, key: string): Promise<HTMLElement> => {
		const currentImageDetails = <IFile>(
			await this.files.getFileDetails(image, this.internalStorageUnit, FileStructure.images)
		);
		image.regionInfo = getRegionInfo(region, image.region);
		image.localFilePath = currentImageDetails.localUri;
		debug('Setting-up intro image: %O', image);
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
		debug('Intro image prepared: %O', element);
		return element;
	};

	private playIntroLoop = async (media: string, intro: SMILIntro): Promise<Promise<void>[]> => {
		const promises = [];
		this.playingIntro = true;
		promises.push(
			(async () => {
				while (this.playingIntro) {
					switch (removeDigits(media)) {
						case SMILEnums.img:
							await sleep(1000);
							break;
						default:
							await this.playIntroVideo(intro[media] as SMILVideo);
					}
				}
			})(),
		);

		return promises;
	};

	private playIntroVideo = async (video: SMILVideo) => {
		try {
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
		} catch (err) {
			debug('Error occurred during intro video playback: %O', video);
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
	private playElement = async (
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
		timedDebug.log('Starting to play element: %O', value);

		// html page case
		if ('localFilePath' in value && removeDigits(key) === 'ref' && !isWidgetUrl(value.src)) {
			value.localFilePath = value.src;
			timedDebug.log('Updated localFilePath for ref element: %s', value.localFilePath);
		}

		// TODO: implement check to sos library
		if (
			'localFilePath' in value &&
			value.localFilePath === '' &&
			isNil((value as SMILVideo).isStream) &&
			removeDigits(key) !== HtmlEnum.ticker
		) {
			timedDebug.log('Element has empty localFilepath: %O', value);
			await sleep(100);
			return;
		}

		if (isConditionalExpExpired(value, this.playerName, this.playerId)) {
			timedDebug.log('Conditional expression: %s, for element: %O is false', value.expr!, value);
			await sleep(100);
			return;
		}

		let sosVideoObject: Video | Stream = this.sos.video;
		let params: VideoParams = getDefaultVideoParams();
		let element = document.getElementById(value.id ?? '') as HTMLElement;

		const parentRegionInfo = value.regionInfo;
		timedDebug.log('Handling triggers for element');
		let currentRegionInfo = await this.triggers.handleTriggers(value, element);

		if (currentRegionInfo.regionName !== parentRegionInfo.regionName) {
			timedDebug.log('Region changed from %s to %s', parentRegionInfo.regionName, currentRegionInfo.regionName);
			this.currentlyPlayingPriority[currentRegionInfo.regionName] = cloneDeep(
				this.currentlyPlayingPriority[parentRegionInfo.regionName],
			);
		}

		const index = getIndexOfPlayingMedia(this.currentlyPlayingPriority[currentRegionInfo.regionName]);

		// Coordinate preparation start - master sends cmd-prepare, slaves wait for it
		if (this.shouldCoordinateSync(value.syncIndex)) {
			const priorityLevel = this.getSyncPriorityLevel(currentRegionInfo.regionName, index);
			timedDebug.log('Coordinating preparation start for sync');
			try {
				const action = await this.elementController.coordinatePrepareStart(
					currentRegionInfo.regionName,
					value.syncIndex,
					timedDebug,
					priorityLevel,
				);

				if (action === ProcessAction.RESYNC) {
					timedDebug.log('Resync needed - skipping element preparation');
					// Ensure priority handling runs even when skipping due to resync
					timedDebug.log(
						'[RESYNC] Calling handlePriorityWhenDone for region: %s, currentIndex: %d, isLast: %s, endTime: %d, priorityLevel: %d',
						currentRegionInfo.regionName,
						currentIndex,
						isLast,
						endTime,
						priorityLevel,
					);
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
					timedDebug.log('[RESYNC] handlePriorityWhenDone completed for region: %s', currentRegionInfo.regionName);
					return; // Skip this element during resync
				}

				timedDebug.log('Preparation start coordination completed');
			} catch (error) {
				timedDebug.log('Error in coordinatePrepareStart: %s - resetting sync state', error);
				console.error('[SYNC] coordinatePrepareStart failed:', error);
				this.resetSyncState();
			}
		}

		timedDebug.log('Preparing element of type: %s', removeDigits(key));
		switch (removeDigits(key)) {
			case 'video':
				const result = await this.handleVideoPrepare(value as SMILVideo, currentRegionInfo, timedDebug);
				// video does not exist in local storage ( seamless update case )
				if (isNil(result)) {
					timedDebug.log('Video does not exist in local storage');
					return;
				}
				({ sosVideoObject, params } = result);
				timedDebug.log('Video preparation completed');
				break;
			case 'img':
				this.handleHtmlElementPrepare(value as SMILImage, element, version, timedDebug);
				timedDebug.log('Image preparation completed');
				break;
			case 'ref':
				this.handleHtmlElementPrepare(value as SMILWidget, element, version, timedDebug, true);
				timedDebug.log('Widget preparation completed');
				break;
			case 'ticker':
				timedDebug.log('Ticker element - no preparation needed');
				break;
			default:
				timedDebug.log('Tag not supported: %s', removeDigits(key));
		}

		// Coordinate preparation completion - master waits for ACKs, slaves wait for signal-ready
		if (this.shouldCoordinateSync(value.syncIndex)) {
			const preparePriorityLevel = this.getSyncPriorityLevel(currentRegionInfo.regionName, index);
			timedDebug.log('Coordinating preparation completion for sync');
			try {
				await this.elementController.coordinatePrepareComplete(
					currentRegionInfo.regionName,
					value.syncIndex,
					timedDebug,
					preparePriorityLevel,
				);
				timedDebug.log('Preparation coordination completed');
			} catch (error) {
				timedDebug.log('Error in coordinatePrepareComplete: %s - resetting sync state', error);
				console.error('[SYNC] coordinatePrepareComplete failed:', error);
				this.resetSyncState();
			}
		}

		timedDebug.log('Checking if should wait and continue');

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
			debug(`[${debugId}] Element skipped based on wait status`);
			return;
		}
		timedDebug.log('Should wait and continue check passed');

		if (waitStatus === WaitStatus.RETRY) {
			debug(`[${debugId}] Element needs retry - returning RETRY status`);
			return 'RETRY'; // Signal to processPlaylist that retry is needed
		}

		if (!isNil(value.triggerValue)) {
			this.promiseAwaiting[currentRegionInfo.regionName].triggerValue = value.triggerValue;
		}

		if (version < this.playlistVersion || (this.foundNewPlaylist && version <= this.playlistVersion)) {
			timedDebug.log('not playing old version: %s, currentVersion: %s, src: %s', version, this.playlistVersion, value.src);
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

		timedDebug.log('Playing element with key: %O, value: %O, parent: %s, version: %s', key, value, parent, version);
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
				timedDebug.log(`Sorry, we are out of ${key}.`);
		}
	};

	private handleVideoPrepare = async (
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
		timedDebug.log('Starting video preparation for: %O', value);

		const sosVideoObject: Video | Stream = isNil(value.isStream) ? this.sos.video : this.sos.stream;
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
			timedDebug.log('Currently playing video exists, waiting 50ms');
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
				timedDebug.log('Video does not exist in local storage: %O with params: %O', value, params);
				return undefined;
			}

			timedDebug.log('Preparing video with params: %O in region: %O', params, regionInfo);
			await sosVideoObject.prepare(...params);
			this.videoPreparing[regionInfo.regionName] = cloneDeep(value);
			timedDebug.log('Video prepared successfully');
		}
		return {
			sosVideoObject,
			params,
		};
	};

	private handleHtmlElementPrepare = (
		value: SMILImage | SMILWidget,
		element: HTMLElement,
		version: number,
		timedDebug: TimedDebugger,
		isWidget: boolean = false,
	) => {
		timedDebug.log('Starting HTML element preparation for: %O', value);

		changeZIndex(value, element, +1);
		timedDebug.log('Changed z-index for element');

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
		timedDebug.log('Generated source URL: %s', src);

		if (value.transitionInfo?.type === 'billboard' && !element.style.backgroundImage) {
			timedDebug.log('Setting up billboard transition');
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
			timedDebug.log('Updating element source attribute from %s to %s', element.getAttribute('src'), src);
			element.setAttribute('src', src);
		}
		timedDebug.log('HTML element preparation completed');
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
		timedDebug.log('Coordinating play start for sync');
		try {
			const action = await this.elementController.coordinatePlayStart(
				regionName,
				syncIndex,
				timedDebug,
				priorityLevel,
			);

			if (action === ProcessAction.RESYNC) {
				timedDebug.log('Resync needed - skipping play coordination');
				return false; // Skip this element during resync
			}

			timedDebug.log('Play start coordination completed');
		} catch (error) {
			timedDebug.log('Error in coordinatePlayStart: %s - resetting sync state', error);
			console.error('[SYNC] coordinatePlayStart failed:', error);
			this.resetSyncState();
		}

		// Coordinate play complete - master waits for ACKs, slaves wait for signal-ready
		timedDebug.log('Coordinating play completion for sync');
		try {
			await this.elementController.coordinatePlayComplete(
				regionName,
				syncIndex,
				timedDebug,
				priorityLevel,
			);
			timedDebug.log('Play coordination completed - starting synchronized playback');
		} catch (error) {
			timedDebug.log('Error in coordinatePlayComplete: %s - resetting sync state', error);
			console.error('[SYNC] coordinatePlayComplete failed:', error);
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
		timedDebug.log('Coordinating finish start for sync');
		try {
			const action = await this.elementController.coordinateFinishStart(
				regionName,
				syncIndex,
				timedDebug,
				priorityLevel,
			);

			if (action === ProcessAction.RESYNC) {
				timedDebug.log('Resync needed - skipping finish coordination');
				return false;
			}

			timedDebug.log('Finish start coordination completed');
		} catch (error) {
			timedDebug.log('Error in coordinateFinishStart: %s - resetting sync state', error);
			console.error('[SYNC] coordinateFinishStart failed:', error);
			this.resetSyncState();
		}

		// Coordinate finish complete - master waits for ACKs, slaves wait for signal-ready
		timedDebug.log('Coordinating finish completion for sync');
		try {
			await this.elementController.coordinateFinishComplete(
				regionName,
				syncIndex,
				timedDebug,
				priorityLevel,
			);
			timedDebug.log('Finish coordination completed - all devices synchronized');
		} catch (error) {
			timedDebug.log('Error in coordinateFinishComplete: %s - resetting sync state', error);
			console.error('[SYNC] coordinateFinishComplete failed:', error);
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
				debug('SyncGroupName is defined, starting sync setup');
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
				debug('No syncGroupName is defined, skipping sync setup');
			}
		} catch (error) {
			debug('Error during playlist processing sync setup: %O', error);
			console.error(error);
		}
	}

	private async handlePlaylistProcessing(version: number): Promise<void> {
		try {
			const dateTimeBegin = Date.now();
			await this.processPlaylist(this.smilObject.playlist, version);
			debug('One smil playlist iteration finished ' + version + ' ' + JSON.stringify(this.cancelFunction));
			const dateTimeEnd = Date.now();
			if (dateTimeEnd - dateTimeBegin < SMILScheduleEnum.defaultAwait) {
				await sleep(2000);
			}
		} catch (err) {
			debug('Unexpected error processing during playlist processing: %O', err);
			await sleep(SMILScheduleEnum.defaultAwait);
		}
	}

	private async handlePlaylistLoop(version: number): Promise<void> {
		await this.runEndlessLoop(async () => await this.handlePlaylistProcessing(version), version);
	}
}
