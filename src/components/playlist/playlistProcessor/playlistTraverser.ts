/* tslint:disable:Unnecessary semicolon missing whitespace indent  tab indentation expected align   arguments are not aligned*/
import isNil = require('lodash/isNil');
import isObject = require('lodash/isObject');
import { PlaylistElement } from '../../../models/playlistModels';
import { SMILMedia } from '../../../models/mediaModels';
import { RandomPlaylist } from '../../../models/playlistModels';
import {
	debug,
	generateParentId,
	getLastArrayItem,
	processRandomPlayMode,
	removeDigits,
} from '../tools/generalTools';
import { randomPlaylistPlayableTagsRegex } from '../../../enums/generalEnums';
import { isConditionalExpExpired } from '../tools/conditionalTools';
import { SMILScheduleEnum } from '../../../enums/scheduleEnums';
import { ExprTag } from '../../../enums/conditionalEnums';
import { areAllWallclocksPermanentlyExpired, setDefaultAwait } from '../tools/scheduleTools';
import { createPriorityObject } from '../tools/priorityTools';
import { PriorityObject } from '../../../models/priorityModels';
import { XmlTags } from '../../../enums/xmlEnums';
import { parseSmilSchedule } from '../tools/wallclockTools';
import { SMILDynamicEnum } from '../../../enums/dynamicEnums';
import { DynamicPlaylist } from '../../../models/dynamicModels';
import { DynamicPlaylistEndless } from '../../../models/dynamicModels';

/**
 * Readonly configuration data needed by the traverser.
 * In tests, mock as a plain object literal.
 */
export interface ITraverserConfig {
	readonly playerName: string;
	readonly playerId: string;
	readonly defaultRepeatCount: string;
	readonly shouldSync: boolean;
}

/**
 * Action callbacks the traverser delegates to for media playback and coordination.
 * In tests, mock as stubs.
 */
export interface ITraverserActions {
	playElement(
		value: SMILMedia,
		version: number,
		key: string,
		parent: string,
		currentIndex: number,
		previousPlayingIndex: number,
		endTime: number,
		isLast: boolean,
		priorityCoord?: { version: number; priority: number },
	): Promise<string | void>;

	priorityBehaviour(
		value: SMILMedia,
		elementKey: string,
		version: number,
		parent: string,
		endTime: number,
		priorityObject: PriorityObject,
	): Promise<{ currentIndex: number; previousPlayingIndex: number }>;

	storePriorityBounds(elem: PlaylistElement, priorityLevel: number): void;

	coordinatePlayModeSync(
		regionName: string,
		syncParentId: string,
		playModeParentId: string,
		previousIndex: number,
		randomPlaylist: RandomPlaylist,
	): Promise<number>;

	processDynamicPlaylist(
		dynamicPlaylistConfig: DynamicPlaylist,
		version: number,
		parent: string,
		endTime: number,
		priorityObject: PriorityObject,
		conditionalExpr: string,
	): Promise<void>;
}

/**
 * State and lifecycle members the traverser uses for flow control.
 */
export interface ITraverserControl {
	readonly randomPlaylist: RandomPlaylist;
	readonly dynamicPlaylist: DynamicPlaylistEndless;

	sleep(ms: number): Promise<void>;
	waitTimeoutOrFileUpdate(timeout: number): Promise<boolean>;
	runEndlessLoop(
		fn: Function,
		version: number,
		conditionalExpr: string,
		dynamicPlaylist: DynamicPlaylistEndless,
		dynamicPlaylistId: string | undefined,
	): Promise<void>;
	getPlaylistVersion(): number;
	getCancelFunction(): boolean;
}

/**
 * Combined engine interface grouping config, actions, and control.
 * In production, constructed by PlaylistProcessor.createEngine().
 * In tests, use createMockEngine() helpers.
 */
export interface IPlaylistEngine {
	config: ITraverserConfig;
	actions: ITraverserActions;
	control: ITraverserControl;
}

/**
 * PlaylistTraverser handles the recursive traversal of SMIL playlists.
 * It processes playlist structure (par, seq, excl, priorityClass) and delegates
 * actual media playback to the engine.
 */
export class PlaylistTraverser {
	private config: ITraverserConfig;
	private actions: ITraverserActions;
	private control: ITraverserControl;

	constructor(engine: IPlaylistEngine) {
		this.config = engine.config;
		this.actions = engine.actions;
		this.control = engine.control;
	}

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
	): Promise<string | void> => {
		let processedAnyContent = false;
		let allNeverPlay = true;

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
					const { currentIndex, previousPlayingIndex } = await this.actions.priorityBehaviour(
						value as SMILMedia,
						key,
						version,
						parent,
						endTime,
						priorityObject,
					);

					const result = await this.actions.playElement(
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
						await this.control.sleep(100);
					} else {
						shouldRetry = false;
					}
				}

				if (retryCount >= MAX_RETRIES) {
					debug(`processPlaylist: Max retries reached for element: %O`, value);
				}

				processedAnyContent = true;
				allNeverPlay = false;
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

				processedAnyContent = true;
				allNeverPlay = false;
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

				processedAnyContent = true;
				allNeverPlay = false;
			}

			if (
				(removeDigits(key) === SMILDynamicEnum.emitDynamic ||
					removeDigits(key) === SMILDynamicEnum.emitDynamicLegacy) &&
				this.config.shouldSync
			) {
				await this.actions.processDynamicPlaylist(
					value as DynamicPlaylist,
					version,
					parent,
					endTime,
					priorityObject,
					conditionalExpr,
				);
				processedAnyContent = true;
				allNeverPlay = false;
				continue;
			}

			// in case smil has only dynamic content and sync is off, wait for defaultAwait to avoid infinite loop
			if (
				(removeDigits(key) === SMILDynamicEnum.emitDynamic ||
					removeDigits(key) === SMILDynamicEnum.emitDynamicLegacy) &&
				!this.config.shouldSync
			) {
				await this.control.sleep(1000);
				processedAnyContent = true;
				allNeverPlay = false;
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
						processedAnyContent = true;
						allNeverPlay = false;
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
					processedAnyContent = true;
					allNeverPlay = false;
					continue;
				}

				if (value.hasOwnProperty('begin') && value.begin!.indexOf('wallclock') > -1) {
					const { timeToStart, timeToEnd } = parseSmilSchedule(value.begin!, value.end);
					if (timeToEnd === SMILScheduleEnum.neverPlay) {
						processedAnyContent = true;
						continue;
					}

					// All non-neverPlay wallclock par paths set these flags
					processedAnyContent = true;
					allNeverPlay = false;

					if (timeToEnd < Date.now()) {
						if (
							setDefaultAwait(<PlaylistElement[]>value, this.config.playerName, this.config.playerId) ===
							SMILScheduleEnum.defaultAwait
						) {
							debug(
								'No active sequence find in wallclock schedule, setting default await: %s',
								SMILScheduleEnum.defaultAwait,
							);
							await this.control.sleep(SMILScheduleEnum.defaultAwait);
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
						(isNil(value.repeatCount) && this.config.defaultRepeatCount === '1')
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
						(isNil(value.repeatCount) && this.config.defaultRepeatCount === 'indefinite')
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

				// All non-wallclock par paths set these flags
				processedAnyContent = true;
				allNeverPlay = false;

				// wallclock has higher priority than conditional expression
				if (await this.checkConditionalDefaultAwait(value)) {
					continue;
				}

				if (value.hasOwnProperty(ExprTag)) {
					conditionalExpr = value[ExprTag]!;
				}

				if (
					value.repeatCount === 'indefinite' ||
					(isNil(value.repeatCount) && this.config.defaultRepeatCount === 'indefinite')
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
					(isNil(value.repeatCount) && this.config.defaultRepeatCount === '1')
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
						if (valueElement.playMode.toLowerCase() === 'one' && this.config.shouldSync) {
							// Extract region from first playable child for sync group lookup
							const playableKey = Object.keys(valueElement).find((k) => randomPlaylistPlayableTagsRegex.test(k));
							const firstChild = playableKey ? valueElement[playableKey] : undefined;
							const regionName = (Array.isArray(firstChild) ? firstChild[0] : firstChild)?.regionInfo?.regionName;

							if (regionName) {
								if (!this.control.randomPlaylist[playModeParentId]) {
									this.control.randomPlaylist[playModeParentId] = { previousIndex: 0 };
								}

								// Build deterministic sync key from first child's syncIndex (identical on all devices)
								// Hash-based playModeParentId can differ across devices due to runtime mutations
								const firstChildSyncIndex = (Array.isArray(firstChild) ? firstChild[0] : firstChild)?.syncIndex;
								const syncParentId = firstChildSyncIndex !== undefined
									? `seq-playMode-${regionName}-${firstChildSyncIndex}`
									: playModeParentId;

								const syncedIndex = await this.actions.coordinatePlayModeSync(
									regionName,
									syncParentId,
									playModeParentId,
									this.control.randomPlaylist[playModeParentId].previousIndex,
									this.control.randomPlaylist,
								);
								this.control.randomPlaylist[playModeParentId].previousIndex = syncedIndex;
							}
						}

						valueElement = processRandomPlayMode(
							valueElement,
							this.control.randomPlaylist,
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
							setDefaultAwait(value, this.config.playerName, this.config.playerId) === SMILScheduleEnum.defaultAwait &&
							!areAllWallclocksPermanentlyExpired(value)
						) {
							debug(
								'No active sequence find in wallclock schedule, setting default await: %s',
								SMILScheduleEnum.defaultAwait,
							);
							await this.control.sleep(SMILScheduleEnum.defaultAwait);
						}

						if (timeToEnd === SMILScheduleEnum.neverPlay) {
							processedAnyContent = true;
							arrayIndex += 1;
							continue;
						}

						// All non-neverPlay wallclock seq paths set these flags
						processedAnyContent = true;
						allNeverPlay = false;

						if (timeToEnd < Date.now()) {
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
							(isNil(valueElement.repeatCount) && this.config.defaultRepeatCount === '1')
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
							(isNil(valueElement.repeatCount) && this.config.defaultRepeatCount === 'indefinite')
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

					// All non-wallclock seq paths set these flags
					processedAnyContent = true;
					allNeverPlay = false;

					// wallclock has higher priority than conditional expression
					if (await this.checkConditionalDefaultAwait(valueElement, arrayIndex, value?.length)) {
						arrayIndex += 1;
						continue;
					}

					if (
						!Number.isNaN(parseInt(valueElement.repeatCount as string)) ||
						(isNil(valueElement.repeatCount) && this.config.defaultRepeatCount === '1')
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
						(isNil(valueElement.repeatCount) && this.config.defaultRepeatCount === 'indefinite')
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

		if (processedAnyContent && allNeverPlay) {
			return SMILScheduleEnum.allExpired;
		}
	};

	/**
	 * excl and priorityClass are not supported in this version, they are processed as seq tags
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
			if (isConditionalExpExpired(elem, this.config.playerName, this.config.playerId)) {
				debug('Conditional expression: %s, for value: %O is false', elem[ExprTag]!, elem);
				if (
					arrayIndex === 0 &&
					setDefaultAwait(value, this.config.playerName, this.config.playerId) === SMILScheduleEnum.defaultAwait
				) {
					debug(
						'No active sequence find in conditional expression schedule, setting default await: %s',
						SMILScheduleEnum.defaultAwait,
					);
					await this.control.sleep(SMILScheduleEnum.defaultAwait);
				}
				arrayIndex -= 1;
				continue;
			}

			const priorityObject = createPriorityObject(elem as PriorityObject, arrayIndex, value?.length - 1);

			// Extract and store sync index bounds for this priority level
			this.actions.storePriorityBounds(elem, priorityObject.priorityLevel);

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
			if (isConditionalExpExpired(elem, this.config.playerName, this.config.playerId)) {
				debug('Conditional expression: %s, for value: %O is false', elem[ExprTag]!, elem);
				if (
					arrayIndex === 0 &&
					setDefaultAwait(value, this.config.playerName, this.config.playerId) === SMILScheduleEnum.defaultAwait
				) {
					debug(
						'No active sequence find in conditional expression schedule, setting default await: %s',
						SMILScheduleEnum.defaultAwait,
					);
					await this.control.sleep(SMILScheduleEnum.defaultAwait);
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
			if (timeToStart > 0 && (await this.control.waitTimeoutOrFileUpdate(timeToStart))) {
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
			if (timeToStart > 0 && (await this.control.waitTimeoutOrFileUpdate(timeToStart))) {
				return;
			}
			while (counter < repeatCount && version >= this.control.getPlaylistVersion()) {
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
			if (timeToStart > 0 && (await this.control.waitTimeoutOrFileUpdate(timeToStart))) {
				return;
			}
			// when endTime is not set, play indefinitely
			if (endTime === 0) {
				let newParent = generateParentId(key, value);
				let dynamicPlaylistId = undefined;
				if (value.hasOwnProperty('begin') && value.begin?.startsWith(SMILDynamicEnum.dynamicFormat)) {
					dynamicPlaylistId = value.begin;
				}

				await this.control.runEndlessLoop(
					async () => {
						return await this.processPlaylist(value, version, newParent, endTime, priorityObject, conditionalExpr);
					},
					version,
					conditionalExpr,
					this.control.dynamicPlaylist,
					dynamicPlaylistId,
				);
				// play N-times, is determined by higher level tag, because this one has repeatCount=indefinite
			} else if (endTime > 0 && endTime <= 1000 && version >= this.control.getPlaylistVersion()) {
				let newParent = generateParentId(key, value);
				if (key.startsWith('seq')) {
					newParent = parent.replace('par', 'seq');
				}
				await this.processPlaylist(value, version, newParent, endTime, priorityObject, conditionalExpr);
			} else {
				let newParent = generateParentId(key, value);
				while (Date.now() <= endTime && version >= this.control.getPlaylistVersion()) {
					await this.processPlaylist(value, version, newParent, endTime, priorityObject, conditionalExpr);
					// force stop because new version of smil file was detected
					if (this.control.getCancelFunction()) {
						return;
					}
				}
			}
		})();
	};

	/**
	 * checks if conditional expression is true or false and if there is other element
	 * which can be played in playlist, if not sets default await time
	 */
	private checkConditionalDefaultAwait = async (
		value: PlaylistElement,
		arrayIndex: number = -1,
		length: number = -1,
	): Promise<boolean> => {
		if (arrayIndex === -1) {
			if (isConditionalExpExpired(value, this.config.playerName, this.config.playerId)) {
				debug('Conditional expression : %s, for value: %O is false', value[ExprTag]!, value);
				if (
					setDefaultAwait(<PlaylistElement[]>value, this.config.playerName, this.config.playerId) ===
					SMILScheduleEnum.defaultAwait
				) {
					debug(
						'No active sequence find in conditional expression schedule, setting default await: %s',
						SMILScheduleEnum.defaultAwait,
					);
					await this.control.sleep(SMILScheduleEnum.defaultAwait);
				}
				return true;
			}
		} else {
			if (isConditionalExpExpired(value, this.config.playerName, this.config.playerId)) {
				debug('Conditional expression: %s, for value: %O is false', value[ExprTag]!, value);
				if (
					arrayIndex === length - 1 &&
					setDefaultAwait(<PlaylistElement[]>value, this.config.playerName, this.config.playerId) ===
						SMILScheduleEnum.defaultAwait
				) {
					debug(
						'No active sequence find in conditional expression schedule, setting default await: %s',
						SMILScheduleEnum.defaultAwait,
					);
					await this.control.sleep(SMILScheduleEnum.defaultAwait);
				}
				return true;
			}
		}
		return false;
	};
}
