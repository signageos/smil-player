import Debug from 'debug';
import { CurrentlyPlayingRegion } from '../../../models/playlistModels';
import { PriorityObject } from '../../../models/priorityModels';
import { ENDTIME_REPEAT_THRESHOLD } from '../../../enums/priorityEnums';
import { sleep } from '../tools/generalTools';
import { shouldContinueWaiting } from './priorityDecisionEngine';
import { PriorityStateManager } from './priorityStateManager';

const debug = Debug('@signageos/smil-player:priorityWaiter');

export type WaitResult = 'released' | 'cancelled' | 'expired';

/**
 * Condition interface for the structured wait loop.
 * Each caller provides a different implementation.
 */
export interface WaitCondition {
	/** Return true to break the wait loop (blocker no longer active) */
	shouldExit(newPlayingIndex: number): boolean;
	/** Called when a new blocker is found; return the updated blocker index */
	updateBlocker(newPlayingIndex: number): number | null;
}

/**
 * Structured wait loop for priority ordering.
 * Uses waitForTurn for priority-ordered waking (only highest-priority waiter wakes first).
 * Uses waiter's endTime for precise expiry-based wakeup (no fixed timeout).
 */
export async function waitForPriorityRelease(
	stateManager: PriorityStateManager,
	currentPriorityRegion: CurrentlyPlayingRegion[],
	currentIndexPriority: CurrentlyPlayingRegion,
	waiterIndex: number,
	blockerIndex: number,
	priorityRegionName: string,
	priorityObject: PriorityObject,
	isCancelled: () => boolean,
	condition: WaitCondition,
): Promise<WaitResult> {
	while (true) {
		const previousPlayer = currentPriorityRegion[blockerIndex].player;

		// Wait for blocking playlist to finish using priority-ordered reactive wait
		if (previousPlayer.playing) {
			debug('[priority-wait] waiting for blocker to complete: region=%s, waiter=%s, blocker=%s', priorityRegionName, currentIndexPriority.media.src, currentPriorityRegion[blockerIndex].media.src);

			const racers: Promise<any>[] = [
				stateManager.waitForTurn(
					priorityRegionName,
					(entries) => !entries[blockerIndex]?.player.playing,
					priorityObject.priorityLevel,
				),
			];

			// Precise wakeup at waiter's endTime (wallclock mode only)
			const waiterEndTime = currentIndexPriority.player.endTime;
			if (waiterEndTime > ENDTIME_REPEAT_THRESHOLD && waiterEndTime > Date.now()) {
				racers.push(sleep(waiterEndTime - Date.now() + 100));
			}

			await Promise.race(racers);
			await stateManager.waitForRegionPromises(priorityRegionName);
		}

		// Check for SMIL file update
		if (isCancelled()) {
			return 'cancelled';
		}

		// Check if endTime/repeatCount expired while waiting
		if (!shouldContinueWaiting({
			endTime: currentIndexPriority.player.endTime,
			timesPlayed: currentIndexPriority.player.timesPlayed,
			isCancelled: false,
		})) {
			stateManager.resetTimesPlayed(priorityRegionName, waiterIndex);
			debug('[priority-wait] exiting wait: playtime expired for src=%s', currentIndexPriority.media.src);
			return 'expired';
		}

		// Find if there's still a blocker
		const newPlayingIndex = stateManager.getPlayingIndex(priorityRegionName);

		// Check if we should exit
		if (condition.shouldExit(newPlayingIndex)) {
			return 'released';
		}

		// Update blocker if needed
		const updatedBlocker = condition.updateBlocker(newPlayingIndex);
		if (updatedBlocker === null) {
			return 'released';
		}
		blockerIndex = updatedBlocker;
	}
}
