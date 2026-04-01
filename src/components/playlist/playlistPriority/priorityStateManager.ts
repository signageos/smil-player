import { isNil } from 'lodash';
import { CurrentlyPlayingPriority, CurrentlyPlayingRegion, PromiseAwaiting } from '../../../models/playlistModels';
import { PAUSE_CONTENT_VALUE, PriorityBehaviour } from '../../../enums/priorityEnums';
import { PriorityObject } from '../../../models/priorityModels';
import { SMILMedia } from '../../../models/mediaModels';
import { ensurePlayingDeferred, resolvePlayingDeferred, waitForPlayingToComplete } from '../tools/deferredTools';
import { getIndexOfPlayingMedia } from '../tools/generalTools';
import { findMatchingEntryIndex } from './priorityDecisionEngine';

/**
 * Manages the mutable priority state (currentlyPlayingPriority and promiseAwaiting).
 * Provides typed mutation methods instead of scattered raw property access.
 * Takes the same object references as PlaylistCommon, so all consumers see changes immediately.
 */
export class PriorityStateManager {
	constructor(
		private state: CurrentlyPlayingPriority,
		private promiseAwaiting: PromiseAwaiting,
	) {}

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

			if (matchType !== 'none') {
				const elem = entries[matchIndex];
				infoObject.behaviour = elem.behaviour;
				infoObject.player.playing = elem.player.playing;
				infoObject.controlledPlaylist = <any>elem.controlledPlaylist;
				infoObject.player.timesPlayed = elem.player.timesPlayed;
				infoObject.player.playingCompletionDeferred = elem.player.playingCompletionDeferred;
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
		entry.player.playing = true;
		ensurePlayingDeferred(entry.player);
	}

	setStopped(regionName: string, index: number): void {
		const entry = this.state[regionName][index];
		entry.player.stop = true;
		entry.player.playing = false;
		resolvePlayingDeferred(entry.player);
		entry.behaviour = PriorityBehaviour.stop;
	}

	setPaused(regionName: string, index: number, controllerIndex: number): void {
		const entry = this.state[regionName][index];
		entry.player.contentPause = PAUSE_CONTENT_VALUE;
		entry.player.playing = false;
		resolvePlayingDeferred(entry.player);
		entry.behaviour = PriorityBehaviour.pause;
		this.state[regionName][controllerIndex].controlledPlaylist = index;
	}

	setDeferred(regionName: string, index: number): void {
		const entry = this.state[regionName][index];
		entry.player.playing = false;
		resolvePlayingDeferred(entry.player);
	}

	setDeferBehaviour(regionName: string, index: number): void {
		this.state[regionName][index].behaviour = PriorityBehaviour.defer;
	}

	setNeverBlocked(regionName: string, index: number): void {
		const entry = this.state[regionName][index];
		entry.player.playing = false;
		resolvePlayingDeferred(entry.player);
	}

	resetBehaviour(regionName: string, index: number): void {
		this.state[regionName][index].behaviour = PriorityBehaviour.none;
	}

	resetStop(regionName: string, index: number): void {
		this.state[regionName][index].player.stop = false;
	}

	/**
	 * Un-pauses a previously paused playlist entry.
	 */
	unpauseControlled(regionName: string, index: number): void {
		const entry = this.state[regionName][index];
		entry.player.contentPause = 0;
		entry.behaviour = PriorityBehaviour.none;
	}

	/**
	 * Marks a playlist as finished: resets timesPlayed, sets playing=false, resolves deferred.
	 * Returns the pausedIndex if this entry was controlling another paused playlist.
	 */
	markFinished(regionName: string, index: number): { pausedIndex: number | null } {
		const entry = this.state[regionName][index];
		const pausedIndex = entry.controlledPlaylist;
		entry.player.timesPlayed = 0;
		entry.player.playing = false;
		resolvePlayingDeferred(entry.player);
		return { pausedIndex };
	}

	incrementTimesPlayed(regionName: string, index: number): void {
		this.state[regionName][index].player.timesPlayed++;
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
