import { CurrentlyPlayingRegion } from '../../../models/playlistModels';
import { Deferred } from './Deferred';

/**
 * Creates a new completion deferred for a player if one doesn't exist or is already settled.
 * This should be called when player.playing is set to true.
 */
export function ensurePlayingDeferred(player: CurrentlyPlayingRegion['player']): Deferred<void> {
	if (!player.playingCompletionDeferred || player.playingCompletionDeferred.isSettled) {
		player.playingCompletionDeferred = new Deferred<void>();
	}
	return player.playingCompletionDeferred;
}

/**
 * Resolves the playing completion deferred.
 * This should be called when player.playing is set to false.
 */
export function resolvePlayingDeferred(player: CurrentlyPlayingRegion['player']): void {
	if (player.playingCompletionDeferred && !player.playingCompletionDeferred.isSettled) {
		player.playingCompletionDeferred.resolve();
	}
}

/**
 * Waits for player.playing to become false.
 * Returns immediately if already not playing.
 */
export async function waitForPlayingToComplete(player: CurrentlyPlayingRegion['player']): Promise<void> {
	if (!player.playing) {
		return; // Already not playing
	}

	if (!player.playingCompletionDeferred) {
		// Edge case: playing is true but no deferred exists
		// This shouldn't happen with proper implementation, but handle gracefully
		player.playingCompletionDeferred = new Deferred<void>();
	}

	await player.playingCompletionDeferred.promise;
}
