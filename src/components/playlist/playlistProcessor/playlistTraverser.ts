/* tslint:disable:Unnecessary semicolon missing whitespace indent  tab indentation expected align   arguments are not aligned*/
import { Log } from '../../../logger';
import isNil = require('lodash/isNil');
import isObject = require('lodash/isObject');
import { PlaylistElement } from '../../../models/playlistModels';
import { SMILMedia } from '../../../models/mediaModels';
import { RandomPlaylist } from '../../../models/playlistModels';
import {
	findFirstMediaDescendant,
	generateParentId,
	getLastArrayItem,
	processRandomPlayMode,
	removeDigits,
} from '../tools/generalTools';
import { shouldSkipElement } from '../tools/conditionalTools';
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

	/**
	 * Fires a single non-blocking lookahead prefetch (HEAD) for the element
	 * `checkAheadCount` positions ahead. No-op unless checkBeforePlay+checkAheadCount
	 * are set. Must be called AFTER playElement returns so the HEAD lands while the
	 * current slot is on screen (checkBeforePlay timing invariant).
	 */
	prefetchAheadElements(
		entries: [string, unknown][],
		currentIndex: number,
		version: number,
		prefetchedUrls: Set<string>,
	): void;

	/**
	 * True when a skipContent media element must NOT be pre-skipped by the traverser but
	 * instead flow through to playElement → resolveContentAvailability → runPrePlayCheck, so a
	 * transient 404 can recover inline (checkBeforePlay + no checkAheadCount — the only mode
	 * with no lookahead recovery). The still-404 case is released by releaseSlot in playElement,
	 * preserving the phantom-slot fix.
	 */
	isSkipContentRecheckable(value: SMILMedia): boolean;
}

/**
 * State and lifecycle members the traverser uses for flow control.
 */
export interface ITraverserControl {
	readonly randomPlaylist: RandomPlaylist;
	readonly dynamicPlaylist: DynamicPlaylistEndless;

	sleep(ms: number): Promise<void>;
	waitTimeoutOrFileUpdate(timeout: number, version: number): Promise<boolean>;
	runEndlessLoop(
		fn: Function,
		version: number,
		conditionalExpr: string,
		dynamicPlaylist: DynamicPlaylistEndless,
		dynamicPlaylistId: string | undefined,
	): Promise<void>;
	getPlaylistVersion(): number;
	getCancelFunction(): boolean;
	cleanupExpiredPriority(version: number, priorityLevel: number): void;
}

/**
 * Combined engine interface grouping config, actions, and control.
 * In production, constructed by PlaylistProcessor.createEngine().
 * In tests, use createMockEngine() helpers.
 */
export interface IPlaylistEngine {
	log: Log;
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
	protected readonly log: Log;
	private config: ITraverserConfig;
	private actions: ITraverserActions;
	private control: ITraverserControl;

	constructor(engine: IPlaylistEngine) {
		this.log = engine.log;
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

		const allEntries = Object.entries(playlist);
		const prefetchedUrls = new Set<string>();
		let entryIdx = -1;
		for (let [key, loopValue] of allEntries) {
			const currentEntryIdx = ++entryIdx;
			// skips processing attributes of elements like repeatCount or wallclock
			if (!isObject(loopValue)) {
				this.log.debug('[traverser] skipping non-object entry: key=%s', key);
				continue;
			}

			let value: PlaylistElement | PlaylistElement[] | SMILMedia = loopValue;
			this.log.debug(
				'[traverser] processing element: key=%s, parent=%s, endTime=%s, version=%s',
				key,
				parent,
				endTime,
				version,
			);
			// dont play intro in the actual playlist
			if (XmlTags.extractedElements.concat(XmlTags.textElements).includes(removeDigits(key))) {
				if (isNil((value as SMILMedia).regionInfo)) {
					this.log.debug('[traverser] skipping element with no regionInfo: key=%s', key);
					continue;
				}

				// Media-level expr must be evaluated BEFORE priorityBehaviour: registration
				// eagerly marks the slot player.playing=true, and the expr-false bail-out in
				// playElement has no natural release point — the element re-registers
				// exact-match every pass (preserving playing=true), leaving a phantom
				// blocker that deadlocks peer/lower-priority waiters in the region.
				// Container-level expr (seq/par/priorityClass) is already checked before
				// registration; this gives media-level expr the same semantics.
				//
				// Exception: a skipContent slot in checkBeforePlay + no-checkAheadCount mode must
				// flow through to playElement → resolveContentAvailability → runPrePlayCheck (the
				// SOLE inline recovery path) so a transient 404 can recover; pre-skipping it here
				// would permanently disable the element. The still-404 case is released by
				// releaseSlot in playElement, so this does not reintroduce the phantom blocker.
				if (
					shouldSkipElement(value as SMILMedia, this.config.playerName, this.config.playerId) &&
					!this.actions.isSkipContentRecheckable(value as SMILMedia)
				) {
					this.log.debug('[traverser] media conditional false, skipping: key=%s, expr=%s', key, (value as SMILMedia).expr!);
					// A skipped slot is processed instantly, but it must not break the checkAheadCount
					// lookahead chain: the element checkAheadCount positions after this one is only
					// HEAD-checked from THIS iteration's prefetch. Skipping straight to `continue` (as
					// the pre-check originally did) starves that successor — e.g. with checkAheadCount=N
					// the slot N positions after a 404'd skipContent slot would never be re-checked and
					// would silently lose content-update detection/recovery. prefetchAheadElements
					// no-ops unless checkBeforePlay + checkAheadCount are set, so the expr-disabled /
					// phantom-slot path is unaffected.
					this.actions.prefetchAheadElements(allEntries, currentEntryIdx, version, prefetchedUrls);
					await this.control.sleep(100);
					processedAnyContent = true;
					allNeverPlay = false;
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
						this.log.debug('[traverser] retrying element: attempt=%d/%d, key=%s', retryCount, MAX_RETRIES, key);
						// Small delay before retry to allow higher-priority element to proceed
						await this.control.sleep(100);
					} else {
						shouldRetry = false;
						// Lookahead prefetch fired AFTER playElement returns: the current
						// slot's visibility has flipped, so the HEAD for the element
						// checkAheadCount positions ahead lands while the current slot is
						// on screen. Firing before the await would inflate the offset.
						this.actions.prefetchAheadElements(allEntries, currentEntryIdx, version, prefetchedUrls);
					}
				}

				if (retryCount >= MAX_RETRIES) {
					this.log.debug('[traverser] max retries reached: key=%s', key);
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
					// In priority context, peer <par> siblings must run concurrently so the
					// priority system can detect conflicts and apply peer rules (defer/pause/stop).
					// Each element also needs its own parent ID for peer conflict detection.
					const hasPriority = priorityObject?.priorityLevel !== undefined;

					if (parent.startsWith('seq') && !hasPriority) {
						let anySeqSiblingActive = false;
						for (const elem of value) {
							if (shouldSkipElement(elem, this.config.playerName, this.config.playerId)) {
								continue;
							}

							let timeToStart = -1;
							let timeToEnd = elem.repeatCount ? parseInt(elem.repeatCount as string) : 0;

							if (elem.hasOwnProperty('begin') && elem.begin?.indexOf('wallclock') > -1) {
								const schedule = parseSmilSchedule(elem.begin!, elem.end);
								if (schedule.timeToEnd === SMILScheduleEnum.neverPlay) {
									continue;
								}
								if (schedule.timeToEnd < Date.now()) {
									continue;
								}
								timeToStart = schedule.timeToStart;
								timeToEnd = schedule.timeToEnd;
							}

							anySeqSiblingActive = true;
							await this.createDefaultPromise(
								elem,
								version,
								priorityObject,
								newParent,
								timeToEnd,
								timeToStart,
								conditionalExpr,
							);
						}
						processedAnyContent = true;
						if (anySeqSiblingActive) { allNeverPlay = false; }
						continue;
					}

					let anyActive = false;
					for (const elem of value) {
						if (shouldSkipElement(elem, this.config.playerName, this.config.playerId)) {
							continue;
						}

						if (elem.hasOwnProperty(ExprTag)) {
							conditionalExpr = elem[ExprTag];
						}

						// Per-element parent ID so handlePriorityInfoObject creates separate
						// tracking entries and handlePriorityBeforePlay detects peer conflicts
						const elemParent = hasPriority ? generateParentId(key, elem) : newParent;

						let elemTimeToStart = -1;
						let elemTimeToEnd = endTime;

						if (elem.hasOwnProperty('begin') && elem.begin?.indexOf('wallclock') > -1) {
							const schedule = parseSmilSchedule(elem.begin!, elem.end);
							if (schedule.timeToEnd === SMILScheduleEnum.neverPlay) {
								continue;
							}
							if (schedule.timeToEnd < Date.now()) {
								continue;
							}
							elemTimeToStart = schedule.timeToStart;
							elemTimeToEnd = schedule.timeToEnd;
						}

						anyActive = true;
						// A nested <par repeatCount="indefinite"> sibling must get its OWN
						// endless loop so it keeps cycling independently. createDefaultPromise
						// recurses straight into the child's body and silently drops the child
						// par's repeatCount=indefinite, so the region would play once and freeze.
						// Mirror the single nested-par path (createRepeatCountIndefinitePromise)
						// and the nested indefinite-seq handling.
						if (
							elem.repeatCount === 'indefinite' ||
							(isNil(elem.repeatCount) && this.config.defaultRepeatCount === 'indefinite')
						) {
							promises.push(
								this.createRepeatCountIndefinitePromise(
									elem,
									priorityObject,
									version,
									elemParent,
									elemTimeToEnd,
									key,
									conditionalExpr,
									elemTimeToStart,
								),
							);
						} else {
							promises.push(
								this.createDefaultPromise(
									elem,
									version,
									priorityObject,
									elemParent,
									elemTimeToEnd,
									elemTimeToStart,
									conditionalExpr,
								),
							);
						}
					}
					await Promise.all(promises);
					processedAnyContent = true;
					if (anyActive) { allNeverPlay = false; }
					continue;
				}

				if (value.hasOwnProperty('begin') && value.begin!.indexOf('wallclock') > -1) {
					const { timeToStart, timeToEnd } = parseSmilSchedule(value.begin!, value.end);
					if (timeToEnd === SMILScheduleEnum.neverPlay) {
						this.log.debug('[traverser-par] wallclock permanently expired, skipping: begin=%s, end=%s', value.begin, value.end);
						processedAnyContent = true;
						continue;
					}

					processedAnyContent = true;

					if (timeToEnd < Date.now()) {
						if (
							setDefaultAwait([value], this.config.playerName, this.config.playerId) ===
							SMILScheduleEnum.defaultAwait
						) {
							this.log.debug('[traverser-par] no active wallclock, setting default await');
							await this.control.sleep(SMILScheduleEnum.defaultAwait);
						}
						continue;
					}

					allNeverPlay = false;

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
								timeToEnd,
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
					this.log.debug('[traverser-seq] processing seq element');

					if (valueElement.playMode) {
						const playModeParentId = generateParentId('seq', valueElement);
						this.log.debug('[traverser-seq] processing random play mode: parent=%s', playModeParentId);

						// Coordinate playMode=one index BEFORE element selection.
						// Walks into nested structure-tag children so the nested-seq shape
						// (xml2js collapses duplicate <seq> siblings into one array) still
						// derives a deterministic region + first-leaf syncIndex for the
						// sync key — a one-level-deep lookup would miss the leaf entirely.
						if (valueElement.playMode.toLowerCase() === 'one' && this.config.shouldSync) {
							const firstMedia = findFirstMediaDescendant(valueElement);
							if (firstMedia) {
								if (!this.control.randomPlaylist[playModeParentId]) {
									this.control.randomPlaylist[playModeParentId] = { previousIndex: 0 };
								}

								// Build deterministic sync key from first leaf's syncIndex (identical
								// on all devices). Hash-based playModeParentId can differ across
								// devices due to runtime mutations.
								const syncParentId = `seq-playMode-${firstMedia.regionName}-${firstMedia.syncIndex}`;

								const syncedIndex = await this.actions.coordinatePlayModeSync(
									firstMedia.regionName,
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

					// this.log.debug('processing seq element: %O', valueElement);
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
							this.log.debug('[traverser-seq] no active wallclock, setting default await');
							await this.control.sleep(SMILScheduleEnum.defaultAwait);
						}

						if (timeToEnd === SMILScheduleEnum.neverPlay) {
							this.log.debug('[traverser-seq] wallclock permanently expired, skipping: begin=%s, end=%s', valueElement.begin, valueElement.end);
							processedAnyContent = true;
							arrayIndex += 1;
							continue;
						}

						processedAnyContent = true;

						if (timeToEnd < Date.now()) {
							arrayIndex += 1;
							continue;
						}

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
							if (timeToStart <= 0 || value?.length === 1) {
								promises.push(
									this.createRepeatCountDefinitePromise(
										valueElement,
										priorityObject,
										version,
										parent,
										timeToStart,
										conditionalExpr,
										timeToEnd,
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
											timeToEnd,
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
			if (shouldSkipElement(elem, this.config.playerName, this.config.playerId)) {
				this.log.debug('[traverser-priority] conditional false, skipping: expr=%s', elem[ExprTag]!);
				if (
					arrayIndex === 0 &&
					setDefaultAwait(value, this.config.playerName, this.config.playerId) === SMILScheduleEnum.defaultAwait
				) {
					this.log.debug('[traverser-priority] no active conditional, setting default await');
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
			if (shouldSkipElement(elem, this.config.playerName, this.config.playerId)) {
				this.log.debug('[traverser-excl] conditional false, skipping: expr=%s', elem[ExprTag]!);
				if (
					arrayIndex === 0 &&
					setDefaultAwait(value, this.config.playerName, this.config.playerId) === SMILScheduleEnum.defaultAwait
				) {
					this.log.debug('[traverser-excl] no active conditional, setting default await');
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
			if (timeToStart > 0 && (await this.control.waitTimeoutOrFileUpdate(timeToStart, version))) {
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
		activeWindowEnd: number = -1,
	): Promise<void> => {
		this.log.debug('[traverser] processing definite repeat');
		const repeatCount: number = Number.isNaN(parseInt(value.repeatCount as string))
			? 1
			: parseInt(value.repeatCount as string);

		let counter = 0;
		return (async () => {
			let newParent = generateParentId(parent, value);
			// if smil file was updated during the timeout wait, cancel that timeout and reload smil again
			if (timeToStart > 0 && (await this.control.waitTimeoutOrFileUpdate(timeToStart, version))) {
				return;
			}
			// Wallclock-windowed content is starting: record the window end on the
			// class's priority object. handlePriorityWhenDone keeps per-pass
			// markFinished (sibling handover within the class) but holds the
			// cross-priority unpause while this window is open — the outer loop
			// replays this seq immediately, so releasing a paused lower class
			// between passes lets it race the replay (flicker + sync stalls).
			if (activeWindowEnd > Date.now() && priorityObject?.priorityLevel !== undefined) {
				this.log.debug(
					'[traverser] stamping active priority window: level=%d, end=%d',
					priorityObject.priorityLevel,
					activeWindowEnd,
				);
				priorityObject.activeWindowEnd = activeWindowEnd;
			}
			while (counter < repeatCount && version >= this.control.getPlaylistVersion()) {
				await this.processPlaylist(value, version, newParent, repeatCount, priorityObject, conditionalExpr);
				counter += 1;
			}
			if (counter >= repeatCount) {
				this.log.debug('[traverser] repeat count exhausted: played=%d/%d, version=%d', counter, repeatCount, version);
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
			this.log.debug('[traverser] processing indefinite repeat: endTime=%s', endTime);
			// if smil file was updated during the timeout wait, cancel that timeout and reload smil again
			if (timeToStart > 0 && (await this.control.waitTimeoutOrFileUpdate(timeToStart, version))) {
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
				// Clean up priority tracking after loop ends (e.g., all wallclock content expired)
				// Without this, deferred lower-priority content waits forever for a playing state change
				if (priorityObject?.priorityLevel !== undefined) {
					this.control.cleanupExpiredPriority(version, priorityObject.priorityLevel);
				}
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
		if (!shouldSkipElement(value, this.config.playerName, this.config.playerId)) {
			return false;
		}
		this.log.debug('[traverser-conditional] conditional false, skipping: expr=%s', value[ExprTag]!);
		const isLastOrSingle = arrayIndex === -1 || arrayIndex === length - 1;
		if (
			isLastOrSingle &&
			setDefaultAwait([value], this.config.playerName, this.config.playerId) ===
				SMILScheduleEnum.defaultAwait
		) {
			this.log.debug('[traverser-conditional] no active conditional, setting default await');
			await this.control.sleep(SMILScheduleEnum.defaultAwait);
		}
		return true;
	};
}
