import * as chai from 'chai';
import { Deferred } from '../../../src/components/playlist/tools/Deferred';
import {
	ensurePlayingDeferred,
	resolvePlayingDeferred,
	waitForPlayingToComplete,
} from '../../../src/components/playlist/tools/deferredTools';
import { CurrentlyPlayingRegion } from '../../../src/models/playlistModels';

const expect = chai.expect;

type Player = CurrentlyPlayingRegion['player'];

function createPlayer(overrides: Partial<Player> = {}): Player {
	return {
		contentPause: 0,
		stop: false,
		endTime: 0,
		playing: false,
		timesPlayed: 0,
		...overrides,
	};
}

describe('deferredTools', () => {
	describe('ensurePlayingDeferred', () => {
		it('should create a new deferred when none exists', () => {
			const player = createPlayer();
			const deferred = ensurePlayingDeferred(player);
			expect(deferred).to.be.instanceOf(Deferred);
			expect(deferred.isSettled).to.be.false;
			expect(player.playingCompletionDeferred).to.equal(deferred);
		});

		it('should return existing deferred when it is not settled', () => {
			const existing = new Deferred<void>();
			const player = createPlayer({ playingCompletionDeferred: existing });
			const result = ensurePlayingDeferred(player);
			expect(result).to.equal(existing);
		});

		it('should create a new deferred when existing one is settled', () => {
			const existing = new Deferred<void>();
			existing.resolve();
			const player = createPlayer({ playingCompletionDeferred: existing });
			const result = ensurePlayingDeferred(player);
			expect(result).to.not.equal(existing);
			expect(result.isSettled).to.be.false;
			expect(player.playingCompletionDeferred).to.equal(result);
		});
	});

	describe('resolvePlayingDeferred', () => {
		it('should resolve an unsettled deferred', () => {
			const deferred = new Deferred<void>();
			const player = createPlayer({ playingCompletionDeferred: deferred });
			resolvePlayingDeferred(player);
			expect(deferred.isSettled).to.be.true;
		});

		it('should be a no-op when no deferred exists', () => {
			const player = createPlayer();
			// should not throw
			resolvePlayingDeferred(player);
			expect(player.playingCompletionDeferred).to.be.undefined;
		});

		it('should be a no-op when deferred is already settled', () => {
			const deferred = new Deferred<void>();
			deferred.resolve();
			const player = createPlayer({ playingCompletionDeferred: deferred });
			// should not throw
			resolvePlayingDeferred(player);
			expect(deferred.isSettled).to.be.true;
		});
	});

	describe('waitForPlayingToComplete', () => {
		it('should return immediately when playing is false', async () => {
			const player = createPlayer({ playing: false });
			await waitForPlayingToComplete(player);
			// If we get here, it returned immediately
		});

		it('should wait until deferred is resolved when playing is true', async () => {
			const deferred = new Deferred<void>();
			const player = createPlayer({ playing: true, playingCompletionDeferred: deferred });
			let completed = false;
			const promise = waitForPlayingToComplete(player).then(() => {
				completed = true;
			});
			// Not yet resolved
			expect(completed).to.be.false;
			deferred.resolve();
			await promise;
			expect(completed).to.be.true;
		});

		it('should create a deferred if missing when playing is true', async () => {
			const player = createPlayer({ playing: true });
			expect(player.playingCompletionDeferred).to.be.undefined;
			const promise = waitForPlayingToComplete(player);
			expect(player.playingCompletionDeferred).to.be.instanceOf(Deferred);
			// Resolve the newly created deferred so the promise completes
			player.playingCompletionDeferred!.resolve();
			await promise;
		});
	});
});
