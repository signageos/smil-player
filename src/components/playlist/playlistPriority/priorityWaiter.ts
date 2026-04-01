import Debug from 'debug';
import { CurrentlyPlayingRegion } from '../../../models/playlistModels';
import { PriorityObject } from '../../../models/priorityModels';
import { sleep } from '../tools/generalTools';
import { waitForPlayingToComplete } from '../tools/deferredTools';
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
 * Structured wait loop replacing three separate while(true) loops.
 * Waits for a blocking playlist to finish, then checks conditions.
 */
export async function waitForPriorityRelease(
	stateManager: PriorityStateManager,
	currentPriorityRegion: CurrentlyPlayingRegion[],
	currentIndexPriority: CurrentlyPlayingRegion,
	blockerIndex: number,
	priorityRegionName: string,
	priorityObject: PriorityObject,
	isCancelled: () => boolean,
	condition: WaitCondition,
): Promise<WaitResult> {
	while (true) {
		const previousPlayer = currentPriorityRegion[blockerIndex].player;

		// Wait for blocking playlist to finish using promise instead of polling
		if (previousPlayer.playing) {
			debug(
				'waiting for playlist to complete via deferred %s, %O, currentlyPlaying: %O',
				priorityRegionName,
				currentIndexPriority,
				currentPriorityRegion[blockerIndex],
			);
			await waitForPlayingToComplete(previousPlayer);
			await stateManager.waitForRegionPromises(priorityRegionName);
		}

		// Check for SMIL file update
		if (isCancelled()) {
			return 'cancelled';
		}

		// Sleep proportional to priority gap
		if (!currentIndexPriority.media.dynamicValue) {
			const sleepMs = (priorityObject.maxPriorityLevel - priorityObject.priorityLevel) * 100;
			debug('sleeping defer/stop priority interval: %s', sleepMs);
			await sleep(sleepMs);
			debug('finished sleeping defer/stop priority interval: %s', sleepMs);
		}

		// Check if endTime/repeatCount expired while waiting
		if (!shouldContinueWaiting({
			endTime: currentIndexPriority.player.endTime,
			timesPlayed: currentIndexPriority.player.timesPlayed,
			isCancelled: false,
		})) {
			currentIndexPriority.player.timesPlayed = 0;
			debug('Playtime for playlist: %O was exceeded priority, exiting', currentIndexPriority);
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
