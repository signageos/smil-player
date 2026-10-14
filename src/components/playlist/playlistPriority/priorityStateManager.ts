import { Log } from '../../../logger';
import { isNil, cloneDeep } from 'lodash';
import { CurrentlyPlayingPriority, CurrentlyPlayingRegion, PromiseAwaiting, PromiseAwaitingEntry } from '../../../models/playlistModels';
import { PAUSE_CONTENT_VALUE, PriorityBehaviour } from '../../../enums/priorityEnums';
import { PriorityObject } from '../../../models/priorityModels';
import { SMILMedia } from '../../../models/mediaModels';
import { ensurePlayingDeferred, resolvePlayingDeferred, waitForPlayingToComplete } from '../tools/deferredTools';
import { Deferred } from '../tools/Deferred';
import { createPlaylistTools, PlaylistTools } from '../tools/playlistTools';
import { createPriorityDecisionEngine, PriorityDecisionEngine } from './priorityDecisionEngine';

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
	private readonly tools: PlaylistTools;
	private readonly engine: PriorityDecisionEngine;
	private regionWaiters: Map<string, Set<RegionWaiter>> = new Map<string, Set<RegionWaiter>>();

	constructor(
		private state: CurrentlyPlayingPriority,
		private promiseAwaiting: PromiseAwaiting,
		protected readonly log: Log,
	) {
		this.tools = createPlaylistTools(log);
		this.engine = createPriorityDecisionEngine(log);
	}

	// --- Reactive waiting ---

	/** Unordered wait — resolves ALL matching waiters when predicate is satisfied. */
	public waitUntil(regionName: string, predicate: (entries: CurrentlyPlayingRegion[]) => boolean): Promise<void> {
		return this._registerWaiter(regionName, predicate, undefined);
	}

	/** Priority-ordered wait — only the highest-priority satisfied waiter wakes. */
	public waitForTurn(regionName: string, predicate: (entries: CurrentlyPlayingRegion[]) => boolean, priorityLevel: number): Promise<void> {
		return this._registerWaiter(regionName, predicate, priorityLevel);
	}

	// --- Accessors ---

	public getRegion(regionName: string): CurrentlyPlayingRegion[] | undefined {
		return this.state[regionName];
	}

	public ensureRegion(regionName: string): CurrentlyPlayingRegion[] {
		if (isNil(this.state[regionName])) {
			this.state[regionName] = [];
		}
		return this.state[regionName];
	}

	public getEntry(regionName: string, index: number): CurrentlyPlayingRegion {
		return this.state[regionName][index];
	}

	public getPlayingIndex(regionName: string): number {
		return this.tools.getIndexOfPlayingMedia(this.state[regionName]);
	}

	public getRegionLength(regionName: string): number {
		return this.state[regionName]?.length ?? 0;
	}

	public hasConflict(regionName: string, currentIndex: number, previousIndex: number): boolean {
		return (
			this.getRegionLength(regionName) > 1 &&
			currentIndex !== previousIndex &&
			this.state[regionName][currentIndex].version === this.state[regionName][previousIndex].version
		);
	}

	// --- PromiseAwaiting accessors ---

	public getPromiseAwaiting(regionName: string): PromiseAwaitingEntry | undefined {
		return this.promiseAwaiting[regionName];
	}

	public ensurePromiseAwaiting(regionName: string, version: number, triggerValue?: string): PromiseAwaitingEntry {
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
	public registerOrUpdate(
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
			controlledPlaylists: [],
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

		let previousPlayingIndex = this.tools.getIndexOfPlayingMedia(this.state[regionName]);
		previousPlayingIndex = previousPlayingIndex > -1 ? previousPlayingIndex : 0;

		let currentIndex = 0;

		if (!skipLoop) {
			const entries = this.state[regionName];
			const { matchIndex, matchType } = this.engine.findMatchingEntryIndex(entries, value, parent, version);

			if (matchType === 'exact') {
				// Same element re-registering (cycling): preserve play/pause state
				// and the in-flight completion deferred so the wait loop keeps its
				// interrupt signal.
				const elem = entries[matchIndex];
				infoObject.behaviour = elem.behaviour;
				infoObject.player.playing = elem.player.playing;
				infoObject.controlledPlaylists = elem.controlledPlaylists;
				infoObject.player.timesPlayed = elem.player.timesPlayed;
				infoObject.player.playingCompletionDeferred = elem.player.playingCompletionDeferred;
				infoObject.isFirstInPlaylist = elem.isFirstInPlaylist;
				// Next pass of the same playlist claiming a slot that is still on screen.
				infoObject.player.successorRegistered = elem.player.playing;
				entries[matchIndex] = infoObject;
				currentIndex = matchIndex;
			} else if (matchType === 'parent') {
				// Seq advancing: replace the slot with FRESH play state — 183ccb2
				// keeps playingCompletionDeferred / player.playing out of the new
				// entry so a stale settled deferred can't busy-loop the wait. Two
				// pause-related fields still need to cross the boundary, narrowly:
				//
				// (a) If the slot is the *victim* of a peer/higher pause, inherit
				//     behaviour + contentPause so shouldWaitAndContinue's pre-
				//     display gate keeps holding. Without this the new entry
				//     looks unpaused, fires priorityBehaviour against the still-
				//     playing peer, and re-enters the fa5df54 ping-pong.
				//
				// (b) Always inherit controlledPlaylists. If the slot is the
				//     *controller* of paused victims, the list must survive
				//     across the seq advance so the release paths can unpause
				//     them. Without this the controller's seq advancing (e.g.
				//     B's img_3 → img_2 in priorityPeerPause) drops the list,
				//     markFinished sees no victims, and they never resume.
				//     Inheriting an empty list when there is no victim is a no-op.
				const elem = entries[matchIndex];
				if (elem.behaviour === PriorityBehaviour.pause || elem.player.contentPause !== 0) {
					infoObject.behaviour = elem.behaviour;
					infoObject.player.contentPause = elem.player.contentPause;
				}
				// (c) Always inherit timesPlayed. The counter is credited by the FIRST
				//     element's completion handler but consumed by the LAST element's
				//     repeatCountExpired check — dropping it on each seq advance makes
				//     (repeatCountExpired && isLast) unreachable for multi-element
				//     repeatCount=N seqs, so markFinished never releases the slot and
				//     any peer/lower-priority waiter blocks on it forever.
				infoObject.player.timesPlayed = elem.player.timesPlayed;
				infoObject.controlledPlaylists = elem.controlledPlaylists;
				infoObject.isFirstInPlaylist = elem.isFirstInPlaylist;
				// Seq advancing while the previous element is still on screen.
				infoObject.player.successorRegistered = elem.player.playing;
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

	public setPlaying(regionName: string, index: number): void {
		const entry = this.state[regionName][index];
		this.log.debug('[priority-state] setPlaying: region=%s, index=%d, src=%s', regionName, index, entry.media.src);
		entry.player.playing = true;
		ensurePlayingDeferred(entry.player);
		this.notifyWaiters(regionName);
	}

	public setStopped(regionName: string, index: number): void {
		const entry = this.state[regionName][index];
		this.log.debug('[priority-state] setStopped: region=%s, index=%d, src=%s', regionName, index, entry.media.src);
		entry.player.stop = true;
		entry.player.playing = false;
		resolvePlayingDeferred(entry.player);
		entry.behaviour = PriorityBehaviour.stop;
		this.notifyWaiters(regionName);
	}

	public setPaused(regionName: string, index: number, controllerIndex: number): void {
		const entry = this.state[regionName][index];
		this.log.debug(
			'[priority-state] setPaused: region=%s, index=%d, src=%s, controllerIndex=%d',
			regionName,
			index,
			entry.media.src,
			controllerIndex,
		);
		entry.player.contentPause = PAUSE_CONTENT_VALUE;
		entry.player.playing = false;
		resolvePlayingDeferred(entry.player);
		entry.behaviour = PriorityBehaviour.pause;
		const controller = this.state[regionName][controllerIndex];
		if (!controller.controlledPlaylists.includes(index)) {
			controller.controlledPlaylists.push(index);
		}
		this.notifyWaiters(regionName);
	}

	public setDeferred(regionName: string, index: number): void {
		const entry = this.state[regionName][index];
		entry.player.playing = false;
		resolvePlayingDeferred(entry.player);
		this.notifyWaiters(regionName);
	}

	public setDeferBehaviour(regionName: string, index: number): void {
		this.state[regionName][index].behaviour = PriorityBehaviour.defer;
		this.notifyWaiters(regionName);
	}

	/**
	 * Releases a slot that was eagerly marked playing by priorityBehaviour but
	 * whose element will not actually play (expr false at play time, media file
	 * missing/not downloaded). Without this release the entry stays a phantom
	 * "playing" blocker: exact-match re-registration preserves playing=true, so
	 * peer/lower-priority waiters in the region would wait on it forever.
	 */
	public releaseSlot(regionName: string, index: number): void {
		const entry = this.state[regionName]?.[index];
		if (!entry) {
			return;
		}
		this.log.debug('[priority-state] releaseSlot: region=%s, index=%d, src=%s', regionName, index, entry.media.src);
		entry.player.playing = false;
		// A bailing successor is no successor: let the predecessor's finish release normally.
		entry.player.successorRegistered = false;
		resolvePlayingDeferred(entry.player);
		// A bailing element must also drop the level's coordination claim, otherwise a
		// lower-priority element parked on `tracked <= myPriority` waits until the next
		// successful pass of this level (or the window end). Harmless when this level
		// does not hold the claim.
		this.cleanupPriorityTracking(regionName, entry.version, entry.priority?.priorityLevel);
		this.notifyWaiters(regionName);
	}

	public setNeverBlocked(regionName: string, index: number): void {
		const entry = this.state[regionName][index];
		entry.player.playing = false;
		resolvePlayingDeferred(entry.player);
		this.notifyWaiters(regionName);
	}

	public resetBehaviour(regionName: string, index: number): void {
		this.state[regionName][index].behaviour = PriorityBehaviour.none;
	}

	public resetStop(regionName: string, index: number): void {
		this.state[regionName][index].player.stop = false;
		this.notifyWaiters(regionName);
	}

	/** True when the same playlist re-registered this slot while it was playing (next pass claimed it). */
	public hasSuccessor(regionName: string, index: number): boolean {
		return !!this.state[regionName]?.[index]?.player.successorRegistered;
	}

	/** The element at `index` now owns the slot; its own registration is not a successor claim. */
	public clearSuccessor(regionName: string, index: number): void {
		const entry = this.state[regionName]?.[index];
		if (entry) {
			entry.player.successorRegistered = false;
		}
	}

	/**
	 * Un-pauses a previously paused playlist entry.
	 */
	public unpauseControlled(regionName: string, index: number): void {
		const entry = this.state[regionName][index];
		entry.player.contentPause = 0;
		entry.behaviour = PriorityBehaviour.none;
		this.notifyWaiters(regionName);
	}

	/**
	 * Marks a pass of a playlist as finished: resets timesPlayed and consumes the successor flag.
	 * With `keepPlaying=false` (default) it also releases the slot (playing=false, resolves the
	 * deferred). With `keepPlaying=true` the slot stays claimed — used between repeatCount passes
	 * when the next pass has already re-registered it, so no lower-priority waiter can slip in.
	 * Returns the indexes of playlists this entry is holding paused (copy — release them via
	 * unpauseAllControlled, which also clears the tracking list).
	 */
	public markFinished(regionName: string, index: number, keepPlaying: boolean = false): { pausedIndexes: number[] } {
		const entry = this.state[regionName][index];
		const pausedIndexes = [...entry.controlledPlaylists];
		this.log.debug(
			'[priority-state] markFinished: region=%s, index=%d, src=%s, pausedVictims=%d, keepPlaying=%s',
			regionName,
			index,
			entry.media.src,
			pausedIndexes.length,
			keepPlaying,
		);
		entry.player.timesPlayed = 0;
		entry.player.successorRegistered = false;
		if (!keepPlaying) {
			entry.player.playing = false;
			resolvePlayingDeferred(entry.player);
		}
		this.notifyWaiters(regionName);
		return { pausedIndexes };
	}

	/**
	 * Releases EVERY playlist the controller entry is holding paused and clears
	 * its tracking list. A held wallclock campaign window can pause multiple
	 * lower sibling playlists (each one that attempts to play mid-window);
	 * releasing only one would leave the rest frozen at the pause gate forever.
	 */
	public unpauseAllControlled(regionName: string, controllerIndex: number): number[] {
		const controller = this.state[regionName]?.[controllerIndex];
		if (!controller) {
			return [];
		}
		const victims = controller.controlledPlaylists.splice(0);
		for (const victimIndex of victims) {
			if (this.state[regionName][victimIndex]) {
				this.log.debug(
					'[priority-state] unpauseAllControlled: region=%s, controller=%d, victim=%d',
					regionName,
					controllerIndex,
					victimIndex,
				);
				this.unpauseControlled(regionName, victimIndex);
			}
		}
		return victims;
	}

	public incrementTimesPlayed(regionName: string, index: number): void {
		this.state[regionName][index].player.timesPlayed++;
		this.notifyWaiters(regionName);
	}

	public resetTimesPlayed(regionName: string, index: number): void {
		this.state[regionName][index].player.timesPlayed = 0;
		this.notifyWaiters(regionName);
	}

	// --- Bulk operations ---

	public cancelAllInRegion(regionName: string, filter?: (entry: CurrentlyPlayingRegion) => boolean): void {
		const entries = this.state[regionName];
		if (!entries) { return; }
		for (const entry of entries) {
			if (!filter || filter(entry)) {
				entry.player.playing = false;
				resolvePlayingDeferred(entry.player);
			}
		}
		this.notifyWaiters(regionName);
	}

	public aliasRegion(fromRegion: string, toRegion: string): void {
		this.state[toRegion] = this.state[fromRegion];
	}

	public cloneRegion(fromRegion: string, toRegion: string): void {
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

	public resetAllPromiseAwaiting(): void {
		for (const region in this.promiseAwaiting) {
			if (this.promiseAwaiting[region]?.promiseFunction) {
				this.promiseAwaiting[region].promiseFunction = [];
				if (this.promiseAwaiting[region].highestProcessingPriority !== undefined) {
					this.promiseAwaiting[region].highestProcessingPriority = -1;
				}
			}
		}
	}

	public setPromiseFunction(regionName: string, promises: Promise<void>[]): void {
		this.promiseAwaiting[regionName].promiseFunction = promises;
	}

	/**
	 * Updates priority version/level tracking for a region.
	 * Returns the current highest priority level being processed.
	 */
	public updatePriorityTracking(regionName: string, version: number, priority: number): { currentHighest: number } {
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

	public setTriggerValue(regionName: string, triggerValue: string): void {
		this.promiseAwaiting[regionName].triggerValue = triggerValue;
	}

	// --- Priority tracking cleanup ---

	/**
	 * Cleans up priority tracking after an element finishes waiting or gets skipped.
	 */
	public cleanupPriorityTracking(regionName: string, version: number, priorityLevel?: number): void {
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
	public cleanupExpiredPriority(version: number, priorityLevel: number): void {
		for (const [regionName, priorityRegion] of Object.entries(this.state)) {
			if (Array.isArray(priorityRegion)) {
				for (const entry of priorityRegion) {
					if (entry.priority?.priorityLevel !== priorityLevel) {
						continue;
					}
					if (entry.player?.playing) {
						entry.player.playing = false;
						resolvePlayingDeferred(entry.player);
					}
					// Release EVERY cross-priority pause this level was holding. When a
					// wallclock campaign's loop exits between passes (window closed with
					// no final element completion), handlePriorityWhenDone never runs a
					// last time — without this release the victims stay frozen at the
					// pause gate forever.
					const entryIndex = priorityRegion.indexOf(entry);
					const released = this.unpauseAllControlled(regionName, entryIndex);
					if (released.length > 0) {
						this.log.debug(
							'[priority-state] cleanupExpiredPriority: unpaused controlled playlists: region=%s, victims=%s',
							regionName,
							released.join(','),
						);
					}
				}
			}
			this.cleanupPriorityTracking(regionName, version, priorityLevel);
			this.notifyWaiters(regionName);
		}
	}

	// --- Async waiting ---

	public async waitForCompletion(regionName: string, index: number): Promise<void> {
		const player = this.state[regionName][index].player;
		if (player.playing) {
			await waitForPlayingToComplete(player);
		}
	}

	public async waitForRegionPromises(regionName: string): Promise<void> {
		if (this.promiseAwaiting[regionName]?.promiseFunction) {
			await Promise.all(this.promiseAwaiting[regionName].promiseFunction!);
		}
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
		if (!waiters || waiters.size === 0) { return; }
		const entries = this.state[regionName];

		let bestOrdered: RegionWaiter | null = null;
		const unorderedToResolve: RegionWaiter[] = [];

		for (const waiter of waiters) {
			let satisfied = false;
			try {
				satisfied = !!entries && waiter.predicate(entries);
			} catch (err) {
				this.log.error('[priority-state] waiter predicate error: region=%s, resolving waiter: %O', regionName, err);
				waiter.deferred.resolve();
				waiters.delete(waiter);
				continue;
			}
			if (!satisfied) { continue; }

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

}
