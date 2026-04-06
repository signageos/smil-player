/**
 * Pure decision predicates extracted from PlaylistProcessor.
 * These encapsulate the boolean conditions used in shouldWaitAndContinue()
 * and checkRegionsForCancellation() without any side effects or state mutations.
 */
import { PriorityBehaviour, ENDTIME_REPEAT_THRESHOLD } from '../../../enums/priorityEnums';

export interface PriorityEntry {
	player: {
		stop: boolean;
		contentPause: number;
		endTime: number;
		playing: boolean;
	};
	behaviour: PriorityBehaviour;
}

export interface PlayingInfo {
	src?: string;
	playing?: boolean;
	dynamicValue?: string;
	triggerValue?: string;
}

/**
 * Checks whether the priority entry has been stopped or paused by a higher priority.
 * Used in shouldWaitAndContinue to decide whether to SKIP the element.
 */
export function isPriorityBlockedOrPaused(entry: PriorityEntry | undefined): boolean {
	if (!entry) {
		return false;
	}
	return (
		entry.player.stop ||
		entry.player.contentPause !== 0 ||
		entry.behaviour === PriorityBehaviour.pause
	);
}

/**
 * Checks whether the element's wallclock endTime has expired.
 * endTime values <= ENDTIME_REPEAT_THRESHOLD are repeat counts, not timestamps.
 * Returns true only for timestamp-based endTimes that are in the past.
 */
export function isWallclockEndTimeExpired(entry: PriorityEntry | undefined): boolean {
	if (!entry) {
		return false;
	}
	return entry.player.endTime <= Date.now() && entry.player.endTime > ENDTIME_REPEAT_THRESHOLD;
}

/**
 * Checks whether a trigger has been cancelled (its play flag was set to false).
 * Used in shouldWaitAndContinue to skip cancelled triggers.
 */
export function isTriggerCancelled(
	triggerValue: string | undefined,
	triggersEndless: Record<string, { play: boolean }>,
): boolean {
	if (!triggerValue) {
		return false;
	}
	return !triggersEndless[triggerValue]?.play;
}

/**
 * Checks whether a dynamic playlist was cancelled prematurely
 * (play flag false AND the element is not what's currently playing).
 */
export function isDynamicPlaylistCancelled(
	dynamicValue: string | undefined,
	dynamicPlaylist: Record<string, { play: boolean }>,
	elementSrc: string,
	currentlyPlayingSrc: string | undefined,
): boolean {
	if (!dynamicValue) {
		return false;
	}
	return !dynamicPlaylist[dynamicValue]?.play && elementSrc !== currentlyPlayingSrc;
}

/**
 * Determines whether a version update should trigger playlist cancellation.
 * Returns true when a newer version arrives and the file check loop hasn't started yet.
 */
export function shouldCancelForVersionUpdate(
	checkFilesLoop: boolean,
	incomingVersion: number,
	currentPlaylistVersion: number,
): boolean {
	return !checkFilesLoop && incomingVersion > currentPlaylistVersion;
}

/**
 * Determines whether media in a parent region should be cancelled.
 * This happens when the current element's region differs from its parent region
 * and the parent region is still actively playing (trigger/sub-region case).
 */
export function shouldCancelParentRegion(
	parentRegionName: string,
	elementRegionName: string,
	parentRegionPlaying: boolean,
): boolean {
	return parentRegionName !== elementRegionName && parentRegionPlaying;
}
