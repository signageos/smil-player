import { isNil, cloneDeep } from 'lodash';
import { CurrentlyPlayingPriority, CurrentlyPlayingRegion, PromiseAwaiting, PromiseAwaitingEntry } from '../../../models/playlistModels';
import { PAUSE_CONTENT_VALUE, PriorityBehaviour } from '../../../enums/priorityEnums';
import { PriorityObject } from '../../../models/priorityModels';
import { SMILMedia } from '../../../models/mediaModels';
import { ensurePlayingDeferred, resolvePlayingDeferred, waitForPlayingToComplete } from '../tools/deferredTools';
import { Deferred } from '../tools/Deferred';
import { getIndexOfPlayingMedia } from '../tools/generalTools';
import { findMatchingEntryIndex } from './priorityDecisionEngine';
import Debug from 'debug';

const debug = Debug('@signageos/smil-player:priorityStateManager');

interface RegionWaiter {
	predicate: (entries: CurrentlyPlayingRegion[]) => boolean;
	deferred: Deferred<void>;
	priorityLevel?: number;
}

/**
 * Manages the mutable priority state (currentlyPlayingPriority and promiseAwaiting).
 * Provides typed mutation methods instead of scattered raw property access.
 * Takes the same object references as PlaylistCommon, so all consumers see changes immediately.
 */
export class PriorityStateManager {
	private regionWaiters = new Map<string, Set<RegionWaiter>>();

	constructor(
		private state: CurrentlyPlayingPriority,
		private promiseAwaiting: PromiseAwaiting,
	) {}

	// --- Reactive waiting ---

	/** Unordered wait — resolves ALL matching waiters when predicate is satisfied. */
	waitUntil(regionName: string, predicate: (entries: CurrentlyPlayingRegion[]) => boolean): Promise<void> {
		return this._registerWaiter(regionName, predicate, undefined);
	}

	/** Priority-ordered wait — only the highest-priority satisfied waiter wakes. */
	waitForTurn(regionName: string, predicate: (entries: CurrentlyPlayingRegion[]) => boolean, priorityLevel: number): Promise<void> {
		return this._registerWaiter(regionName, predicate, priorityLevel);
	}

	private _registerWaiter(
		regionName: string,
		predicate: (entries: CurrentlyPlayingRegion[]) => boolean,
		priorityLevel?: number,
	): Promise<void> {
		const entries = this.state[regionName];
		if (entries && predicate(entries)) {
			return Promise.resolve();
		}
		const deferred = new Deferred<void>();
		if (!this.regionWaiters.has(regionName)) {
			this.regionWaiters.set(regionName, new Set());
		}
		this.regionWaiters.get(regionName)!.add({ predicate, deferred, priorityLevel });
		return deferred.promise;
	}

	private notifyWaiters(regionName: string): void {
		const waiters = this.regionWaiters.get(regionName);
		if (!waiters || waiters.size === 0) return;
		const entries = this.state[regionName];

		let bestOrdered: RegionWaiter | null = null;
		const unorderedToResolve: RegionWaiter[] = [];

		for (const waiter of waiters) {
			let satisfied = false;
			try {
				satisfied = !!entries && waiter.predicate(entries);
			} catch (err) {
				debug('[priority-state] waiter predicate error: region=%s, resolving waiter: %O', regionName, err);
				waiter.deferred.resolve();
				waiters.delete(waiter);
				continue;
			}
			if (!satisfied) continue;

			if (waiter.priorityLevel !== undefined) {
				if (!bestOrdered || waiter.priorityLevel > bestOrdered.priorityLevel!) {
					bestOrdered = waiter;
				}
			} else {
				unorderedToResolve.push(waiter);
			}
		}

		for (const w of unorderedToResolve) {
			w.deferred.resolve();
			waiters.delete(w);
		}

		if (bestOrdered) {
			bestOrdered.deferred.resolve();
			waiters.delete(bestOrdered);
		}
	}

	// --- Accessors ---

	getRegion(regionName: string): CurrentlyPlayingRegion[] | undefined {
		return this.state[regionName];
	}

	ensureRegion(regionName: string): CurrentlyPlayingRegion[] {
		if (isNil(this.state[regionName])) {
			this.state[regionName] = [];
		}
		return this.state[regionName];
	}

	getEntry(regionName: string, index: number): CurrentlyPlayingRegion {
		return this.state[regionName][index];
	}

	getPlayingIndex(regionName: string): number {
		return getIndexOfPlayingMedia(this.state[regionName]);
	}

	getRegionLength(regionName: string): number {
		return this.state[regionName]?.length ?? 0;
	}

	hasConflict(regionName: string, currentIndex: number, previousIndex: number): boolean {
		return (
			this.getRegionLength(regionName) > 1 &&
			currentIndex !== previousIndex &&
			this.state[regionName][currentIndex].version === this.state[regionName][previousIndex].version
		);
	}

	// --- PromiseAwaiting accessors ---

	getPromiseAwaiting(regionName: string): PromiseAwaitingEntry | undefined {
		return this.promiseAwaiting[regionName];
	}

	ensurePromiseAwaiting(regionName: string, version: number, triggerValue?: string): PromiseAwaitingEntry {
		if (isNil(this.promiseAwaiting[regionName])) {
			this.promiseAwaiting[regionName] = {
				promiseFunction: [],
				version,
				highestProcessingPriority: -1,
				triggerValue,
			};
		}
		if (isNil(this.promiseAwaiting[regionName].promiseFunction)) {
			this.promiseAwaiting[regionName].promiseFunction = [];
		}
		return this.promiseAwaiting[regionName];
	}

	// --- Registration ---

	/**
	 * Registers a new element or updates an existing one in the tracking array.
	 * Returns the current and previous playing indices.
	 */
	registerOrUpdate(
		regionName: string,
		value: SMILMedia,
		parent: string,
		endTime: number,
		priorityObject: PriorityObject,
		version: number,
	): { currentIndex: number; previousPlayingIndex: number } {
		const infoObject: CurrentlyPlayingRegion = {
			media: value,
			player: {
				contentPause: 0,
				stop: false,
				endTime: endTime,
				playing: false,
				timesPlayed: 0,
				playingCompletionDeferred: undefined,
			},
			parent: parent,
			priority: priorityObject,
			controlledPlaylist: null,
			version,
			behaviour: PriorityBehaviour.none,
			isFirstInPlaylist: {} as SMILMedia,
		};

		let skipLoop = false;

		if (isNil(this.state[regionName])) {
			this.state[regionName] = [];
			infoObject.isFirstInPlaylist = value;
			this.state[regionName].push(infoObject);
			skipLoop = true;
		}

		let previousPlayingIndex = getIndexOfPlayingMedia(this.state[regionName]);
		previousPlayingIndex = previousPlayingIndex > -1 ? previousPlayingIndex : 0;

		let currentIndex = 0;

		if (!skipLoop) {
			const entries = this.state[regionName];
			const { matchIndex, matchType } = findMatchingEntryIndex(entries, value, parent, version);

			if (matchType === 'exact') {
				// Same element re-registering (cycling): preserve play/pause state
				// and the in-flight completion deferred so the wait loop keeps its
				// interrupt signal.
				const elem = entries[matchIndex];
				infoObject.behaviour = elem.behaviour;
				infoObject.player.playing = elem.player.playing;
				infoObject.controlledPlaylist = <any>elem.controlledPlaylist;
				infoObject.player.timesPlayed = elem.player.timesPlayed;
				infoObject.player.playingCompletionDeferred = elem.player.playingCompletionDeferred;
				infoObject.isFirstInPlaylist = elem.isFirstInPlaylist;
				entries[matchIndex] = infoObject;
				currentIndex = matchIndex;
			} else if (matchType === 'parent') {
				// Different media sharing the slot of a sibling under the same parent
				// (a seq advancing). Replace the slot but start with FRESH play state —
				// inheriting the prior element's playingCompletionDeferred would mean
				// a later resolvePlayingDeferred on the prior element wakes this
				// element's wait loop spuriously, causing an elapsed=0 busy-loop.
				const elem = entries[matchIndex];
				infoObject.isFirstInPlaylist = elem.isFirstInPlaylist;
				entries[matchIndex] = infoObject;
				currentIndex = matchIndex;
			} else {
				infoObject.isFirstInPlaylist = infoObject.media;
				entries.push(infoObject);
				currentIndex = entries.length - 1;
			}
		}

		return { currentIndex, previousPlayingIndex };
	}

	// --- State mutations ---

	setPlaying(regionName: string, index: number): void {
		const entry = this.state[regionName][index];
		debug('[priority-state] setPlaying: region=%s, index=%d, src=%s', regionName, index, entry.media.src);
		entry.player.playing = true;
		ensurePlayingDeferred(entry.player);
		this.notifyWaiters(regionName);
	}

	setStopped(regionName: string, index: number): void {
		const entry = this.state[regionName][index];
		debug('[priority-state] setStopped: region=%s, index=%d, src=%s', regionName, index, entry.media.src);
		entry.player.stop = true;
		entry.player.playing = false;
		resolvePlayingDeferred(entry.player);
		entry.behaviour = PriorityBehaviour.stop;
		this.notifyWaiters(regionName);
	}

	setPaused(regionName: string, index: number, controllerIndex: number): void {
		const entry = this.state[regionName][index];
		debug('[priority-state] setPaused: region=%s, index=%d, src=%s, controllerIndex=%d', regionName, index, entry.media.src, controllerIndex);
		entry.player.contentPause = PAUSE_CONTENT_VALUE;
		entry.player.playing = false;
		resolvePlayingDeferred(entry.player);
		entry.behaviour = PriorityBehaviour.pause;
		this.state[regionName][controllerIndex].controlledPlaylist = index;
		this.notifyWaiters(regionName);
	}

	setDeferred(regionName: string, index: number): void {
		const entry = this.state[regionName][index];
		entry.player.playing = false;
		resolvePlayingDeferred(entry.player);
		this.notifyWaiters(regionName);
	}

	setDeferBehaviour(regionName: string, index: number): void {
		this.state[regionName][index].behaviour = PriorityBehaviour.defer;
		this.notifyWaiters(regionName);
	}

	setNeverBlocked(regionName: string, index: number): void {
		const entry = this.state[regionName][index];
		entry.player.playing = false;
		resolvePlayingDeferred(entry.player);
		this.notifyWaiters(regionName);
	}

	resetBehaviour(regionName: string, index: number): void {
		this.state[regionName][index].behaviour = PriorityBehaviour.none;
	}

	resetStop(regionName: string, index: number): void {
		this.state[regionName][index].player.stop = false;
		this.notifyWaiters(regionName);
	}

	/**
	 * Un-pauses a previously paused playlist entry.
	 */
	unpauseControlled(regionName: string, index: number): void {
		const entry = this.state[regionName][index];
		entry.player.contentPause = 0;
		entry.behaviour = PriorityBehaviour.none;
		this.notifyWaiters(regionName);
	}

	/**
	 * Marks a playlist as finished: resets timesPlayed, sets playing=false, resolves deferred.
	 * Returns the pausedIndex if this entry was controlling another paused playlist.
	 */
	markFinished(regionName: string, index: number): { pausedIndex: number | null } {
		const entry = this.state[regionName][index];
		const pausedIndex = entry.controlledPlaylist;
		debug('[priority-state] markFinished: region=%s, index=%d, src=%s, hadPaused=%s', regionName, index, entry.media.src, pausedIndex !== null);
		entry.player.timesPlayed = 0;
		entry.player.playing = false;
		resolvePlayingDeferred(entry.player);
		this.notifyWaiters(regionName);
		return { pausedIndex };
	}

	incrementTimesPlayed(regionName: string, index: number): void {
		this.state[regionName][index].player.timesPlayed++;
		this.notifyWaiters(regionName);
	}

	resetTimesPlayed(regionName: string, index: number): void {
		this.state[regionName][index].player.timesPlayed = 0;
		this.notifyWaiters(regionName);
	}

	// --- Bulk operations ---

	cancelAllInRegion(regionName: string, filter?: (entry: CurrentlyPlayingRegion) => boolean): void {
		const entries = this.state[regionName];
		if (!entries) return;
		for (const entry of entries) {
			if (!filter || filter(entry)) {
				entry.player.playing = false;
				resolvePlayingDeferred(entry.player);
			}
		}
		this.notifyWaiters(regionName);
	}

	aliasRegion(fromRegion: string, toRegion: string): void {
		this.state[toRegion] = this.state[fromRegion];
	}

	cloneRegion(fromRegion: string, toRegion: string): void {
		const cloned = cloneDeep(this.state[fromRegion]);
		// lodash cloneDeep does NOT deep-copy Promise instances or function refs:
		// a cloned Deferred shares its `promise` and `_resolve` with the original.
		// Resolving the clone would fulfill the original's Promise while leaving
		// the original's `_resolved` flag false — `isSettled` lies, and any
		// later `await deferred.promise` in waitElementDuration resolves
		// instantly, busy-looping with elapsed=0. Reset to undefined so each
		// region gets its own fresh deferred lifecycle on the next setPlaying.
		if (cloned) {
			for (const entry of cloned) {
				entry.player.playingCompletionDeferred = undefined;
			}
		}
		this.state[toRegion] = cloned;
	}

	// --- PromiseAwaiting mutations ---

	resetAllPromiseAwaiting(): void {
		for (const region in this.promiseAwaiting) {
			if (this.promiseAwaiting[region]?.promiseFunction) {
				this.promiseAwaiting[region].promiseFunction = [];
				if (this.promiseAwaiting[region].highestProcessingPriority !== undefined) {
					this.promiseAwaiting[region].highestProcessingPriority = -1;
				}
			}
		}
	}

	setPromiseFunction(regionName: string, promises: Promise<void>[]): void {
		this.promiseAwaiting[regionName].promiseFunction = promises;
	}

	/**
	 * Updates priority version/level tracking for a region.
	 * Returns the current highest priority level being processed.
	 */
	updatePriorityTracking(regionName: string, version: number, priority: number): { currentHighest: number } {
		const promiseObj = this.promiseAwaiting[regionName];
		if (!promiseObj.version || promiseObj.version < version) {
			promiseObj.version = version;
			promiseObj.highestProcessingPriority = priority;
		} else if (promiseObj.version === version) {
			const currentTracked = promiseObj.highestProcessingPriority ?? priority;
			promiseObj.highestProcessingPriority = Math.max(currentTracked, priority);
		}
		this.notifyWaiters(regionName);
		return { currentHighest: promiseObj.highestProcessingPriority ?? -1 };
	}

	setTriggerValue(regionName: string, triggerValue: string): void {
		this.promiseAwaiting[regionName].triggerValue = triggerValue;
	}

	// --- Priority tracking cleanup ---

	/**
	 * Cleans up priority tracking after an element finishes waiting or gets skipped.
	 */
	cleanupPriorityTracking(regionName: string, version: number, priorityLevel?: number): void {
		if (!this.promiseAwaiting[regionName]) {
			return;
		}

		const promiseObj = this.promiseAwaiting[regionName];
		let changed = false;

		if (priorityLevel !== undefined && promiseObj.highestProcessingPriority === priorityLevel) {
			promiseObj.highestProcessingPriority = -1;
			changed = true;
		}

		if (promiseObj.version && promiseObj.version < version) {
			promiseObj.version = version;
		}

		if (changed) {
			this.notifyWaiters(regionName);
		}
	}

	/**
	 * Cleans up priority tracking across all regions for a given priority level.
	 * Called when an endless loop breaks due to allExpired — no media element was playing
	 * to trigger handlePriorityWhenDone, so the deferred lower-priority content would wait forever.
	 */
	cleanupExpiredPriority(version: number, priorityLevel: number): void {
		for (const [regionName, priorityRegion] of Object.entries(this.state)) {
			if (Array.isArray(priorityRegion)) {
				for (const entry of priorityRegion) {
					if (entry.priority?.priorityLevel === priorityLevel && entry.player?.playing) {
						entry.player.playing = false;
						resolvePlayingDeferred(entry.player);
					}
				}
			}
			this.cleanupPriorityTracking(regionName, version, priorityLevel);
			this.notifyWaiters(regionName);
		}
	}

	// --- Async waiting ---

	async waitForCompletion(regionName: string, index: number): Promise<void> {
		const player = this.state[regionName][index].player;
		if (player.playing) {
			await waitForPlayingToComplete(player);
		}
	}

	async waitForRegionPromises(regionName: string): Promise<void> {
		if (this.promiseAwaiting[regionName]?.promiseFunction) {
			await Promise.all(this.promiseAwaiting[regionName].promiseFunction!);
		}
	}

}
