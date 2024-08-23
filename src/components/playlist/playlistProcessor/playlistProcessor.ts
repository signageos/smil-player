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
	getDefaultVideoParams,
	getIndexOfPlayingMedia,
	getLastArrayItem,
	getRegionInfo,
	processRandomPlayMode,
	removeDigits,
	sleep,
} from '../tools/generalTools';
import { SMILEnums } from '../../../enums/generalEnums';
import { isConditionalExpExpired } from '../tools/conditionalTools';
import { SMILScheduleEnum } from '../../../enums/scheduleEnums';
import { ExprTag } from '../../../enums/conditionalEnums';
import { setDefaultAwait, setElementDuration } from '../tools/scheduleTools';
import { createPriorityObject } from '../tools/priorityTools';
import { PriorityObject } from '../../../models/priorityModels';
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
import { createLocalFilePath, createSourceReportObject, getSmilVersionUrl, isWidgetUrl } from '../../files/tools';
import { isEqual } from 'lodash';
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

export class PlaylistProcessor extends PlaylistCommon implements IPlaylistProcessor {
	private checkFilesLoop: boolean = true;
	private playingIntro: boolean = false;
	private readonly playerName: string;
	private readonly playerId: string;
	private triggers: PlaylistTriggers;
	private priority: PlaylistPriority;
	private foundNewPlaylist: boolean = false;
	private playlistVersion: number = 0;
	private syncContentPrepared: {
		[key: string]: {
			syncGroupName: string;
			numberOfNonSync: number;
		};
	} = {};
	private internalStorageUnit: IStorageUnit;
	private smilObject: SMILFileObject;

	constructor(sos: FrontApplet, files: FilesManager, options: PlaylistOptions) {
		super(sos, files, options);
		this.triggers = new PlaylistTriggers(sos, files, options, this.processPlaylist);
		this.priority = new PlaylistPriority(sos, files, options);
		this.playerName = this.sos.config?.playerName ?? '';
		this.playerId = this.sos.config?.playerId ?? '';
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
	 * plays intro media before actual playlist starts, default behaviour is to play video as intro
	 */
	public playIntro = async (): Promise<Promise<void>[]> => {
		let media: string = '';
		let fileStructure: string = '';
		let downloadPromises: Promise<void>[] = [];
		let imageElement: HTMLElement = document.createElement(HtmlEnum.img);

		for (const property in this.smilObject.intro[0]) {
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
			await this.files.parallelDownloadAllFiles(
				this.internalStorageUnit,
				[this.smilObject.intro[0][media]] as MergedDownloadList[],
				fileStructure,
			),
		);

		await Promise.all(downloadPromises);

		const intro: SMILIntro = this.smilObject.intro[0];

		debug('Intro media object: %O', intro);
		switch (removeDigits(media)) {
			case HtmlEnum.img:
				if (imageElement.getAttribute('src') === null) {
					const imageIntro = intro[media] as SMILImage;
					imageElement = await this.setupIntroImage(imageIntro, this.smilObject, media);
					this.setCurrentlyPlaying(imageIntro, 'html', SMILEnums.defaultRegion);
				}
				break;
			default:
				const videoIntro = intro[media] as SMILVideo;
				await this.setupIntroVideo(videoIntro, this.smilObject);
				this.setCurrentlyPlaying(videoIntro, 'video', SMILEnums.defaultRegion);
		}

		debug('Intro media downloaded: %O', intro);

		return this.playIntroLoop(media, intro);
	};

	/**
	 * main processing function of smil player, runs playlist in endless loop and periodically
	 * checks for smil and media update in parallel
	 * @param smilFile - representation of actual SMIL file
	 * @param firstIteration
	 * @param restart
	 */
	public processingLoop = async (smilFile: SMILFile, firstIteration: boolean, restart: () => void): Promise<void> => {
		const promises = [];

		promises.push(
			(async () => {
				// used during playlist update, give enough time to start playing first content from new playlist and then start file check again
				while (!this.getCheckFilesLoop()) {
					await sleep(1000);
				}
				while (this.getCheckFilesLoop()) {
					if (isNil(this.smilObject.refresh.expr) || !isConditionalExpExpired(this.smilObject.refresh)) {
						debug('Prepare ETag check for smil media files prepared');
						const {
							fileEtagPromisesMedia: fileEtagPromisesMedia,
							fileEtagPromisesSMIL: fileEtagPromisesSMIL,
						} = await this.files.prepareLastModifiedSetup(
							this.internalStorageUnit,
							this.smilObject,
							smilFile,
						);
						debug('Last modified check for smil media files prepared');
						debug('Checking files for changes');
						if (
							fileEtagPromisesMedia?.length > 0 ||
							(fileEtagPromisesSMIL?.length > 0 && this.synchronization.shouldSync)
						) {
							debug('One of the files changed, restarting loop with sync on');
							await this.sos.refresh();
							break;
						}

						if (
							fileEtagPromisesMedia?.length > 0 ||
							(fileEtagPromisesSMIL?.length > 0 && !this.synchronization.shouldSync)
						) {
							debug('One of the files changed, restarting loop with sync off');
							this.setCheckFilesLoop(false);
							break;
						}

						debug('File changes checked');

						await sleep(this.smilObject.refresh.refreshInterval * 1000);
						debug('after file check interval');
					} else {
						debug('Conditional expression for files update is false: %s', this.smilObject.refresh.expr);
						await sleep(this.smilObject.refresh.refreshInterval * 1000);
					}
				}
				debug('calling restart function');
				// no await
				restart();
			})(),
		);

		promises.push(
			(async () => {
				try {
					// connect to the sync server only on start of smil, not on updates
					if (firstIteration) {
						await connectSyncSafe(this.sos);
					}

					await joinAllSyncGroupsOnSmilStart(this.sos, this.synchronization, this.smilObject);

					if (firstIteration && hasDynamicContent(this.smilObject)) {
						await broadcastEndActionToAllDynamics(this.sos, this.synchronization, this.smilObject);
					}
				} catch (error) {
					debug('Error during playlist processing sync setup: %O', error);
					console.error(error);
				}

				// check if its first playlist
				const version = firstIteration ? this.getPlaylistVersion() : this.getPlaylistVersion() + 1;
				// endless processing of smil playlist
				await this.runEndlessLoop(async () => {
					try {
						const dateTimeBegin = Date.now();
						await this.processPlaylist(this.smilObject.playlist, version);
						debug(
							'One smil playlist iteration finished ' +
								version +
								' ' +
								JSON.stringify(this.cancelFunction),
						);
						const dateTimeEnd = Date.now();
						if (dateTimeEnd - dateTimeBegin < SMILScheduleEnum.defaultAwait) {
							await sleep(2000);
						}
					} catch (err) {
						debug('Unexpected error during playlist processing: %O', err);
						await sleep(SMILScheduleEnum.defaultAwait);
					}
				}, version);
			})(),
		);

		promises.push(
			(async () => {
				// triggers processing
				await this.triggers.watchTriggers(this.smilObject, this.getPlaylistVersion, this.getCheckFilesLoop);
			})(),
		);

		await Promise.all(promises);
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

			const syncGroupName = `${this.synchronization.syncGroupName}-fullScreenTrigger-${dynamicPlaylistConfig.syncId}`;
			await joinSyncGroup(this.sos, this.synchronization, syncGroupName);
			debug(
				'Master dynamic playlist: %O is joining sync group: %s with timestamp: %s',
				dynamicPlaylistConfig,
				syncGroupName,
				Date.now(),
			);
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
				'Processing playlist element with key: %O, value: %O, parent: %s, endTime: %s',
				key,
				value,
				parent,
				endTime,
			);
			// dont play intro in the actual playlist
			if (XmlTags.extractedElements.concat(XmlTags.textElements).includes(removeDigits(key))) {
				if (isNil((value as SMILMedia).regionInfo)) {
					debug('Invalid element with no regionInfo: %O', value);
					continue;
				}

				const lastPlaylistElem: string = getLastArrayItem(Object.entries(playlist))[0];
				const isLast = lastPlaylistElem === key;
				const { currentIndex, previousPlayingIndex } = await this.priority.priorityBehaviour(
					value as SMILMedia,
					key,
					version,
					parent,
					endTime,
					priorityObject,
				);

				await this.playElement(
					value as SMILMedia,
					version,
					key,
					parent,
					currentIndex,
					previousPlayingIndex,
					endTime,
					isLast,
				);
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

			if (removeDigits(key) === SMILDynamicEnum.emitDynamic && this.synchronization.shouldSync) {
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
			if (removeDigits(key) === SMILDynamicEnum.emitDynamic && !this.synchronization.shouldSync) {
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
						debug('Processing random play mode: %O with parent: %s', valueElement, parent);
						valueElement = processRandomPlayMode(
							valueElement,
							this.randomPlaylist,
							generateParentId('seq', valueElement),
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
							if (
								this.synchronization.shouldSync &&
								!this.synchronization.syncingInAction &&
								!this.synchronization.movingForward &&
								isNil(this.synchronization.syncValue)
							) {
								await sleep(SMILScheduleEnum.defaultAwait);
								console.log('start waiting for idle priority sync', Date.now());
								await this.sos.sync.wait(
									'idle',
									`${this.synchronization.syncGroupName}-idlePrioritySync`,
								);
								console.log('finished waiting for idle priority sync', Date.now());
							} else {
								await sleep(SMILScheduleEnum.defaultAwait);
							}
						}

						if (timeToEnd === SMILScheduleEnum.neverPlay || timeToEnd < Date.now()) {
							arrayIndex += 1;
							continue;
						}

						if (
							(timeToStart <= 0 || value?.length === 1) &&
							this.synchronization.shouldSync &&
							!this.synchronization.syncingInAction &&
							!this.synchronization.movingForward &&
							isNil(this.synchronization.syncValue)
						) {
							await this.sos.sync.wait('', `${this.synchronization.syncGroupName}-prioritySync`);
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

	private checkRegionsForCancellation = async (
		element: SMILVideo | SosHtmlElement,
		regionInfo: RegionAttributes,
		parentRegion: RegionAttributes,
		version: number,
	) => {
		debug('Checking regions for cancellation: %O, %O, %O', element, regionInfo, parentRegion);
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
		if (!this.getCheckFilesLoop() && version > this.getPlaylistVersion()) {
			debug(
				'cancelling older playlist from newer updated playlist: version: %s, playlistVersion: %s',
				version,
				this.getPlaylistVersion(),
			);
			this.setPlaylistVersion(version);
			if (this.getPlaylistVersion() > 0) {
				debug('setting up cancel function for index %s', this.getPlaylistVersion() - 1);
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
			debug(
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
			debug(
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
			debug(
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
				debug(
					'cancelling trigger: %s from element: %s',
					this.currentlyPlaying[regionInfo.regionName].src,
					element.src,
				);
				let triggerValueToCancel = findTriggerToCancel(
					this.triggers.triggersEndless,
					regionInfo.regionName,
					element.triggerValue,
				);
				debug(
					'cancelling trigger: %s withId: %s',
					this.currentlyPlaying[regionInfo.regionName].src,
					triggerValueToCancel,
				);
				debug('cancelling trigger: %O', this.triggers.triggersEndless);
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
			debug(
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
	private setCurrentlyPlaying = (element: SMILVideo | SosHtmlElement, tag: string, regionName: string) => {
		debug('Setting currently playing: %O for region: %s with tag: %s', element, regionName, tag);
		const nextElement = cloneDeep(this.currentlyPlaying[regionName]?.nextElement);
		this.currentlyPlaying[regionName] = <PlayingInfo>cloneDeep(element);
		this.currentlyPlaying[regionName].media = tag;
		this.currentlyPlaying[regionName].playing = true;
		this.currentlyPlaying[regionName].nextElement = nextElement;
		// dynamic playlist
		if (element.dynamicValue) {
			debug('setting dynamic value: %s', element.dynamicValue);
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
			let element = <HTMLElement>document.getElementById(<string>value.id);

			let sosHtmlElement: SosHtmlElement = {
				src: element.getAttribute('src')!,
				id: element.id,
				dur: value.dur,
				syncIndex: value.syncIndex ?? undefined,
				regionInfo: value.regionInfo,
				localFilePath: value.localFilePath,
				dynamicValue: value.dynamicValue,
				...extractAttributesByPrefix(value, smilLogging.proofOfPlayPrefix),
			};

			if (!isNil(value.triggerValue)) {
				sosHtmlElement.triggerValue = value.triggerValue;
			}

			this.promiseAwaiting[currentRegionInfo.regionName].promiseFunction! = [
				(async () => {
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

					// TODO: fix ticker condition ( nonticker elements get ticker animation )
					// if (
					// 	this.currentlyPlaying[currentRegionInfo.regionName]?.media !== 'ticker' ||
					// 	this.currentlyPlaying[currentRegionInfo.regionName]?.id !== element.id
					// ) {
					// 	startTickerAnimation(element, value as SMILTicker);
					// }

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
					);

					debug(
						'Finished iteration of playlist: %O',
						this.currentlyPlayingPriority[currentRegionInfo.regionName][currentIndex],
					);

					await this.handleElementSynchronization(
						value,
						currentRegionInfo,
						parentRegionInfo,
						currentIndex,
						'after',
					);

					await handlePriorityWhenDone();
					debug(
						'Finished checking iteration of playlist: %O',
						this.currentlyPlayingPriority[currentRegionInfo.regionName][currentIndex],
					);

					if (hasTransition) {
						removeTransitionCss(element);
					}

					changeZIndex(value, element, -2);

					// if (
					// 	!(await this.handleElementSynchronization(
					// 		value,
					// 		currentRegionInfo,
					// 		parentRegionInfo,
					// 		currentIndex,
					// 		'after',
					// 	))
					// ) {
					// 	return;
					// }

					debug('finished playing element: %O', value);
				})(),
			];
		} catch (err) {
			debug('Unexpected error: %O during html element playback: %s', err, value.localFilePath);

			await handlePriorityWhenDone();

			await this.files.sendMediaReport(
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
	): Promise<void> => {
		debug('Starting to play element: %O', element);
		let duration = setElementDuration(element.dur);

		await this.checkRegionsForCancellation(element, currentRegionInfo, parentRegionInfo, version);

		if (this.syncContentPrepared?.fullScreenTrigger && !element.dynamicValue && this.synchronization.shouldSync) {
			// console.log(
			// 	'start1 of fist non-sync media after dynamic content end in syncgroup',
			// 	this.syncContentPrepared?.fullScreenTrigger.syncGroupName,
			// 	Date.now(),
			// );
			// await this.sos.sync.wait('customValue', this.synchronization.syncGroupName, 1500);
			// console.log(
			// 	'end1 of fist non-sync media after dynamic content end in syncgroup',
			// 	this.syncContentPrepared?.fullScreenTrigger.syncGroupName,
			// 	Date.now(),
			// );
			// delete this.syncContentPrepared?.fullScreenTrigger;
		}

		// rare case during seamless update with only one widget in playlist.
		if (elementHtml.style.visibility !== 'visible') {
			elementHtml.style.visibility = 'visible';
			elementHtml.setAttribute('src', element.src);
		}
		const tag = element.id.indexOf('ticker') > -1 ? 'ticker' : 'html';

		this.setCurrentlyPlaying(element, tag, currentRegionInfo.regionName);

		debug('waiting image duration: %s from element: %s', duration, element.id);

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
				duration === transitionDuration &&
				this.currentlyPlaying[currentRegionInfo.regionName].nextElement.type === 'html'
			) {
				setTransitionCss(
					elementHtml,
					this.currentlyPlaying[currentRegionInfo.regionName].nextElement.id!,
					transitionDuration,
				);
			}
			duration -= 100;
			await sleep(100);
		}

		debug('element playing finished: %O', element);

		await this.files.sendMediaReport(
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
	): Promise<boolean> => {
		if (isNil(this.promiseAwaiting[regionInfo.regionName])) {
			this.promiseAwaiting[regionInfo.regionName] = cloneDeep(media);
			this.promiseAwaiting[regionInfo.regionName].promiseFunction = [];
		}
		if (isNil(this.promiseAwaiting[regionInfo.regionName]?.promiseFunction)) {
			this.promiseAwaiting[regionInfo.regionName].promiseFunction = [];
		}

		if (isNil(this.currentlyPlaying[regionInfo.regionName])) {
			this.currentlyPlaying[regionInfo.regionName] = <PlayingInfo>{};
		}

		// wait for all
		if (
			this.triggers.dynamicPlaylist[media.dynamicValue!]?.isMaster &&
			this.currentlyPlayingPriority[parentRegionName][previousPlayingIndex].behaviour !== 'pause' &&
			version >= this.getPlaylistVersion()
		) {
			debug(
				'Master dynamic playlist is waiting for all preceding content to finish: %s, %s',
				media.dynamicValue,
				Date.now(),
			);
			let promises: Promise<void>[] = [];
			for (const [, promise] of Object.entries(this.promiseAwaiting)) {
				promises = promises.concat(promise.promiseFunction!);
			}
			await Promise.all(promises);
			debug(
				'Master dynamic playlist finished waiting for all preceding content to finish: %s, %s',
				media.dynamicValue,
				Date.now(),
			);
		}

		if (
			this.currentlyPlayingPriority[parentRegionName][previousPlayingIndex].behaviour !== 'pause' &&
			this.promiseAwaiting[regionInfo.regionName]?.promiseFunction!?.length > 0 &&
			(!media.hasOwnProperty(SMILTriggersEnum.triggerValue) ||
				media.triggerValue === this.promiseAwaiting[regionInfo.regionName].triggerValue)
		) {
			this.currentlyPlaying[regionInfo.regionName].nextElement = cloneDeep(media);
			this.currentlyPlaying[regionInfo.regionName].nextElement.type =
				get(media, 'localFilePath', 'default').indexOf(FileStructure.videos) === -1 ? 'html' : 'video';
			debug('checking if this playlist is newer version than currently playing');
			if (version > this.playlistVersion && !media.hasOwnProperty(SMILTriggersEnum.triggerValue)) {
				this.foundNewPlaylist = true;
			}
			if (this.promiseAwaiting[regionInfo.regionName]) {
				debug(
					'waiting for previous promise in current region: %s, %O, with timestamp : %s',
					regionInfo.regionName,
					media,
					Date.now(),
				);
				debug(this.promiseAwaiting[regionInfo.regionName]);
				await Promise.all(this.promiseAwaiting[regionInfo.regionName].promiseFunction!);
				debug(
					'waiting for previous promise in current region finished: %s, %O with timestamp: %s',
					regionInfo.regionName,
					media,
					Date.now(),
				);
			}
		}

		if (media.dynamicValue && !this.synchronization.shouldSync) {
			debug(
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
			return false;
		}

		if (
			media.hasOwnProperty(SMILTriggersEnum.triggerValue) &&
			!this.triggers.triggersEndless[media.triggerValue as string]?.play
		) {
			debug('trigger was cancelled prematurely: %s', media.triggerValue);
			return false;
		}

		if (
			media.dynamicValue &&
			!this.triggers.dynamicPlaylist[media.dynamicValue!]?.play &&
			media.src !== this.currentlyPlaying[regionInfo.regionName].src
		) {
			for (const elem of this.currentlyPlayingPriority[parentRegionName]) {
				if (elem.media.dynamicValue) {
					elem.player.playing = false;
				}
			}
			set(this.currentlyPlaying, `${regionInfo.regionName}.playing`, false);
			debug('dynamic playlist was cancelled prematurely: %s', media.dynamicValue);
			return false;
		}

		await this.triggers.handleTriggers(media);

		// nothing played before ( trigger case )
		if (isNil(this.currentlyPlayingPriority[regionInfo.regionName])) {
			return true;
		}
		const currentIndexPriority = this.currentlyPlayingPriority[regionInfo.regionName][currentIndex];
		// playlist was already stopped/paused during await
		if (
			currentIndexPriority?.player.stop ||
			currentIndexPriority?.player.contentPause !== 0 ||
			currentIndexPriority?.behaviour === 'pause'
		) {
			// wait a bit to avoid race condition during lower priority wait and dynamic content switch
			// TODO: was this needed?
			// await sleep(300);
			debug(
				'Playlist was stopped/paused by higher priority during await: %O, media: %O',
				currentIndexPriority,
				media,
			);
			return false;
		}

		// TODO: previous contition, check if needed
		// during playlist pause was exceeded its endTime, dont play it and return from function, if endtime is 0, play indefinitely
		// if (
		// 	(currentIndexPriority?.player.endTime <= Date.now() && currentIndexPriority?.player.endTime > 1000) ||
		// 	(currentIndexPriority?.player.timesPlayed > endTime && endTime !== 0)
		// ) {

		// during playlist pause was exceeded its endTime, dont play it and return from function, if endtime is 0, play indefinitely
		if (currentIndexPriority?.player.endTime <= Date.now() && currentIndexPriority?.player.endTime > 1000) {
			debug('Playtime for playlist: %O with media: %O was exceeded wait, exiting', currentIndexPriority, media);
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
			// TODO: race condition check
			// await sleep(1000);

			return false;
		}

		// previous element in playlist was deffered, dont play it
		// if (currentIndexPriority?.behaviour === 'defer') {
		// 	debug('Playlist was deferred by higher priority during await: %O, media: %O', currentIndexPriority, media);
		// 	await sleep(250);
		// }

		debug('Playlist is ready to play: %O with media: %O', currentIndexPriority, media);
		// regenerate that current priority is playing due to mechanic that priority ends itself plus sync at the end of the playlist
		// ( another playlist can jump in during the process, this is to prevent it )
		this.currentlyPlayingPriority[regionInfo.regionName][currentIndex].player.playing = true;
		return true;
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
			debug('Playing video: %O', video);

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
							);
						} else {
							await this.handleStreamPlay(
								video,
								params,
								sosVideoObject,
								currentRegionInfo,
								parentRegionInfo,
								version,
							);
						}

						debug('Playing video finished: %O in playlist version: %s', video, version);

						await this.files.sendMediaReport(
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
								debug(
									'Finished iteration of playlist: %O',
									this.currentlyPlayingPriority[currentRegionInfo.regionName][currentIndex],
								);

								await this.handleElementSynchronization(
									video,
									currentRegionInfo,
									parentRegionInfo,
									currentIndex,
									'after',
								);

								await handlePriorityWhenDone();
								break;
							}
						}
						// no video.stop function so one video can be played gapless in infinite loop
						// stopping is handled by cancelPreviousMedia function
						// force stop video only when reloading smil file due to new version of smil
						if (this.getCancelFunction()) {
							await this.cancelPreviousMedia(currentRegionInfo);
							debug(
								'Finished iteration of playlist: %O',
								this.currentlyPlayingPriority[currentRegionInfo.regionName][currentIndex],
							);

							await this.handleElementSynchronization(
								video,
								currentRegionInfo,
								parentRegionInfo,
								currentIndex,
								'after',
							);

							await handlePriorityWhenDone();
							return;
						}

						debug(
							'Finished iteration of playlist: %O',
							this.currentlyPlayingPriority[currentRegionInfo.regionName][currentIndex],
						);

						await this.handleElementSynchronization(
							video,
							currentRegionInfo,
							parentRegionInfo,
							currentIndex,
							'after',
						);

						await handlePriorityWhenDone();
					} catch (err) {
						debug('Unexpected error: %O occurred during single video playback: O%', err, video);

						await handlePriorityWhenDone();

						await this.files.sendMediaReport(
							video,
							taskStartDate,
							'video',
							!!video.syncIndex && this.synchronization.shouldSync,
							err.message,
						);
					}
					//
					// if (
					// 	!(await this.handleElementSynchronization(
					// 		video,
					// 		currentRegionInfo,
					// 		parentRegionInfo,
					// 		currentIndex,
					// 		'after',
					// 	))
					// ) {
					// 	return;
					// }
					debug('finished playing element: %O', video);
				})(),
			];

			// give time to smil player to play video before massive wallclock processing
			await sleep(1000);
		} catch (err) {
			debug('Unexpected error: %O occurred during single video prepare: O%', err, video);
			await handlePriorityWhenDone();
			await this.files.sendMediaReport(
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
	) => {
		let promiseRaceArray = [];
		let videoEnded = false;
		params.pop();
		if (
			this.currentlyPlaying[currentRegionInfo.regionName]?.src !== video.src &&
			this.currentlyPlaying[currentRegionInfo.regionName]?.playing &&
			(this.currentlyPlaying[currentRegionInfo.regionName] as any)?.isStream
		) {
			debug(
				'cancelling stream: %s from element: %s',
				this.currentlyPlaying[currentRegionInfo.regionName].src,
				video.src,
			);
			await this.cancelPreviousMedia(currentRegionInfo);
			return;
		}

		if (this.syncContentPrepared?.fullScreenTrigger && !video.dynamicValue && this.synchronization.shouldSync) {
			// console.log(
			// 	'start1 of fist non-sync media after dynamic content end in syncgroup',
			// 	this.syncContentPrepared?.fullScreenTrigger?.syncGroupName,
			// 	Date.now(),
			// );
			// await this.sos.sync.wait('customValue', this.synchronization.syncGroupName, 1000);
			// console.log(
			// 	'end1 of fist non-sync media after dynamic content end in syncgroup',
			// 	this.syncContentPrepared?.fullScreenTrigger?.syncGroupName,
			// 	Date.now(),
			// );
			// delete this.syncContentPrepared?.fullScreenTrigger;
		}

		try {
			debug('Calling## video play function - single video: %O', video);
			await sosVideoObject.play(...params);
			debug('After## video play function - single video: %O', video);
		} catch (err) {
			await this.files.sendMediaReport(
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

		await this.checkRegionsForCancellation(video, currentRegionInfo, parentRegionInfo, version);

		this.setCurrentlyPlaying(video, 'video', currentRegionInfo.regionName);

		debug('Starting## playing video onceEnded function - single video: %O', video);
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
			debug('Got fullVideoDuration: %s for video: %O', video.fullVideoDuration!, video);
			promiseRaceArray.push(sleep(video.fullVideoDuration! + SMILEnums.videoDurationOffset));
		}

		// if video has specified duration in smil file, cancel it after given duration passes
		if ('dur' in video) {
			const parsedDuration = setElementDuration(video.dur!);
			debug('Got dur: %s for video: %O', parsedDuration, video);
			promiseRaceArray.push(sleep(parsedDuration));
		}

		try {
			await Promise.race(promiseRaceArray);
			videoEnded = true;
		} catch (err) {
			debug('Unexpected error: %O during single video playback onceEnded at video: %O', err, video);
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
	) => {
		let promiseRaceArray = [];

		// remove protocol parameter for Video Inputs and Internal Ports
		if (stream.protocol === StreamEnums.internal) {
			params.pop();
		}

		await sosVideoObject.play(...params);

		await this.checkRegionsForCancellation(stream, currentRegionInfo, parentRegionInfo, version);

		this.setCurrentlyPlaying(stream, 'video', currentRegionInfo.regionName);

		// if video has specified duration in smil file, cancel it after given duration passes
		if ('dur' in stream) {
			const parsedDuration: number = setElementDuration(stream.dur!);
			debug('Got dur: %s for stream: %O', parsedDuration, stream);
			promiseRaceArray.push(sleep(parsedDuration));
		}

		// promiseRaceArray.push(await sosVideoObject.play(...params));
		promiseRaceArray.push(
			waitForSuccessOrFailEvents(smilEventEmitter, stream, StreamEnums.disconnectedEvent, StreamEnums.errorEvent),
		);

		try {
			await Promise.race(promiseRaceArray);
		} catch (err) {
			debug('Unexpected error: %O during single stream playback play at stream: %O', err, stream);
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
	) => {
		// html page case
		if ('localFilePath' in value && removeDigits(key) === 'ref' && !isWidgetUrl(value.src)) {
			value.localFilePath = value.src;
		}

		// TODO: implement check to sos library
		if (
			'localFilePath' in value &&
			value.localFilePath === '' &&
			isNil((value as SMILVideo).isStream) &&
			removeDigits(key) !== HtmlEnum.ticker
		) {
			debug('Element: %O has empty localFilepath: %O', value);
			await sleep(100);
			return;
		}

		if (isConditionalExpExpired(value, this.playerName, this.playerId)) {
			debug('Conditional expression: %s, for element: %O is false', value.expr!, value);
			await sleep(100);
			return;
		}

		let sosVideoObject: Video | Stream = this.sos.video;
		let params: VideoParams = getDefaultVideoParams();
		let element = <HTMLElement>document.getElementById(value.id ?? '');

		const parentRegionInfo = value.regionInfo;
		let currentRegionInfo = await this.triggers.handleTriggers(value, element);

		if (currentRegionInfo.regionName !== parentRegionInfo.regionName) {
			this.currentlyPlayingPriority[currentRegionInfo.regionName] = cloneDeep(
				this.currentlyPlayingPriority[parentRegionInfo.regionName],
			);
		}

		const index = getIndexOfPlayingMedia(this.currentlyPlayingPriority[currentRegionInfo.regionName]);

		switch (removeDigits(key)) {
			case 'video':
				const result = await this.handleVideoPrepare(value as SMILVideo, currentRegionInfo);
				// video does not exist in local storage ( seamless update case )
				if (isNil(result)) {
					return;
				}
				({ sosVideoObject, params } = result);
				break;
			case 'img':
				this.handleHtmlElementPrepare(value as SMILImage, element, version);
				break;
			case 'ref':
				this.handleHtmlElementPrepare(value as SMILWidget, element, version, true);
				break;
			case 'ticker':
				break;
			default:
				debug('Tag not supported: %s', removeDigits(key));
		}

		if (
			!(await this.shouldWaitAndContinue(
				value,
				currentRegionInfo,
				parentRegionInfo.regionName,
				currentIndex,
				previousPlayingIndex,
				endTime,
				isLast,
				version,
			))
		) {
			return;
		}

		// should sync mechanism skip current element
		if (!(await this.handleElementSynchronization(value, currentRegionInfo, parentRegionInfo, currentIndex))) {
			return;
		}

		if (!isNil(value.triggerValue)) {
			this.promiseAwaiting[currentRegionInfo.regionName].triggerValue = value.triggerValue;
		}

		if (version < this.playlistVersion || (this.foundNewPlaylist && version <= this.playlistVersion)) {
			debug('not playing old version: %s, currentVersion: %s', version, this.playlistVersion);
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

		debug('Playing element with key: %O, value: %O, parent: %s', key, value, parent);
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
				);
				break;
			// case 'audio':
			// 	await this.playAudio(value.localFilePath);
			// 	break;
			default:
				debug(`Sorry, we are out of ${key}.`);
		}
	};

	private handleVideoPrepare = async (
		value: SMILVideo,
		regionInfo: RegionAttributes,
	): Promise<
		| {
				sosVideoObject: Video | Stream;
				params: VideoParams;
		  }
		| undefined
	> => {
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
				!(await this.files.fileExists(
					this.internalStorageUnit,
					createLocalFilePath(FileStructure.videos, value.src),
				)) &&
				!value.isStream
			) {
				debug(`Video does not exists in local storage: %O with params: %O`, value, params);
				return undefined;
			}

			debug(`Preparing## video: %O with params: %O in region: %O`, value, params, regionInfo);
			await sosVideoObject.prepare(...params);
			this.videoPreparing[regionInfo.regionName] = cloneDeep(value);
			debug(`Video prepared: %O with params: %O`, value, params);
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
		isWidget: boolean = false,
	) => {
		changeZIndex(value, element, +1);

		const smilUrlVersion = getSmilVersionUrl(element.getAttribute('src'));
		let src = generateElementSrc(value.src, value.localFilePath, version, smilUrlVersion, isWidget);

		// add query parameter to invalidate cache on devices
		if ((element.getAttribute('src') === null || element.getAttribute('src') !== src) && value.preload !== false) {
			element.setAttribute('src', src);
		}
	};

	private handleElementSynchronization = async (
		value: SMILMedia,
		currentRegionInfo: RegionAttributes,
		parentRegionInfo: RegionAttributes,
		currentIndex: number,
		suffix: 'after' | 'before' = 'before',
	): Promise<boolean> => {
		// do not sync at the end of the element playback if syncing with another device is in progress
		if (suffix === 'after' && (this.synchronization.syncingInAction || this.synchronization.movingForward)) {
			debug('synchronization in action, skipping after sync for element %O', value);
			return false;
		}
		let regionInfo = value.regionInfo;
		// sync of nested regions ( dynamic playlist )
		if (currentRegionInfo.regionName !== parentRegionInfo.regionName) {
			regionInfo = currentRegionInfo;
		}
		if (regionInfo.sync && this.synchronization.shouldSync) {
			debug('synchronizing for region %s', regionInfo.regionName);
			let desiredSyncIndex = this.synchronization.syncValue;
			if (
				isNil(this.synchronization.syncValue) ||
				isEqual(value.syncIndex, this.synchronization.syncValue) ||
				this.synchronization.movingForward
			) {
				debug(
					`entering ${suffix} sync handling in region %s with syncIndex %d with syncValue %s with movingForward`,
					regionInfo.regionName,
					value.syncIndex,
					this.synchronization.syncValue,
					this.synchronization.movingForward,
				);

				if (
					!isNil(this.synchronization.syncValue) &&
					isEqual(value.syncIndex, this.synchronization.syncValue) &&
					this.synchronization.syncingInAction
				) {
					//move one forward
					debug('synchronizing for region, moving forward %s', regionInfo.regionName);
					this.synchronization.syncingInAction = false;
					this.synchronization.movingForward = true;
					this.synchronization.syncValue = undefined;
					return false;
				}

				// content synced in dynamic region has syncId in group name extra
				const groupName = value.dynamicValue
					? `${this.synchronization.syncGroupName}-${regionInfo.regionName}-${
							this.triggers.dynamicPlaylist[value.dynamicValue].syncId
					  }`
					: `${this.synchronization.syncGroupName}-${regionInfo.regionName}-${suffix}`;

				value.syncGroupName = groupName;

				this.syncContentPrepared.fullScreenTrigger = {
					syncGroupName: groupName,
					numberOfNonSync: 0,
				};
				debug(
					`synchronization ${suffix} staring in region %s with syncIndex %d with dynamicValue %s with groupName %s with timestamp: %d`,
					regionInfo.regionName,
					value.syncIndex,
					value.dynamicValue,
					groupName,
					Date.now(),
				);
				try {
					if (value.dynamicValue && this.triggers.dynamicPlaylist[value.dynamicValue]?.isMaster) {
						this.files.sendReport({
							type: 'SMIL.SyncWait-Started',
							source: createSourceReportObject(
								value.localFilePath,
								value.src,
								this.internalStorageUnit.type,
							),
							startedAt: moment().toDate(),
							groupName,
						});
					}

					// regenerate that current priority is playing due to mechanic that priority ends itself plus sync at the end of the playlist
					// ( another playlist can jump in during the process, this is to prevent it )
					if (suffix === 'before') {
						this.currentlyPlayingPriority[currentRegionInfo.regionName][currentIndex].player.playing = true;
					}

					console.log('start waiting for playing element sync', Date.now(), suffix, value.syncIndex);
					desiredSyncIndex = await this.sos.sync.wait(value.syncIndex, groupName);
					console.log('finished waiting for playing element sync', Date.now(), suffix, value.syncIndex);

					if (value.dynamicValue && this.triggers.dynamicPlaylist[value.dynamicValue]?.isMaster) {
						this.files.sendReport({
							type: 'SMIL.SyncWait-Ended',
							source: createSourceReportObject(
								value.localFilePath,
								value.src,
								this.internalStorageUnit.type,
							),
							startedAt: moment().toDate(),
							groupName,
						});
					}
				} catch (err) {
					this.synchronization.syncingInAction = false;
					this.synchronization.movingForward = false;
					debug('ERROR occurred during sync.wait', err);
				}

				debug(
					`synchronization ${suffix} finished in region %s with syncIndex %d with timestamp: %d`,
					regionInfo.regionName,
					value.syncIndex,
					Date.now(),
				);

				if (value.dynamicValue && !this.triggers.dynamicPlaylist[value.dynamicValue].play) {
					debug('dynamic playlist was stopped during sync.wait: %O', value);
					return false;
				}

				if (value.syncIndex !== desiredSyncIndex) {
					this.synchronization.syncValue = desiredSyncIndex;
				}

				this.synchronization.syncingInAction = false;
				this.synchronization.movingForward = false;
			}

			if (!isEqual(value.syncIndex, desiredSyncIndex) && !isNil(desiredSyncIndex)) {
				debug(
					'starting synchronization process desired syncIndex %d, current syncIndex %d',
					desiredSyncIndex,
					value.syncIndex,
				);
				this.synchronization.syncingInAction = true;
				return false;
			}
		} else {
			if (this.syncContentPrepared?.fullScreenTrigger) {
				this.syncContentPrepared.fullScreenTrigger.numberOfNonSync++;

				if (this.syncContentPrepared?.fullScreenTrigger?.numberOfNonSync > 1) {
					delete this.syncContentPrepared.fullScreenTrigger;
				}
			}
		}

		return true;
	};
}
