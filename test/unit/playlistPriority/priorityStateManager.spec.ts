import * as chai from 'chai';
import { PriorityStateManager } from '../../../src/components/playlist/playlistPriority/priorityStateManager';
import { CurrentlyPlayingPriority, CurrentlyPlayingRegion, PromiseAwaiting } from '../../../src/models/playlistModels';
import { PAUSE_CONTENT_VALUE, PriorityBehaviour, PriorityRule } from '../../../src/enums/priorityEnums';
import { PriorityObject } from '../../../src/models/priorityModels';
import { SMILMedia } from '../../../src/models/mediaModels';

const expect = chai.expect;

function makePriorityObject(overrides: Partial<PriorityObject> = {}): PriorityObject {
	return {
		priorityLevel: 0,
		maxPriorityLevel: 2,
		lower: PriorityRule.defer,
		peer: PriorityRule.never,
		higher: PriorityRule.stop,
		...overrides,
	};
}

function makeMedia(src: string = 'test.mp4'): SMILMedia {
	return { src, regionInfo: { regionName: 'main' } } as SMILMedia;
}

function makeRegion(overrides: Partial<CurrentlyPlayingRegion> = {}): CurrentlyPlayingRegion {
	return {
		media: makeMedia(),
		priority: makePriorityObject(),
		player: {
			contentPause: 0,
			stop: false,
			endTime: 0,
			playing: false,
			timesPlayed: 0,
			playingCompletionDeferred: undefined,
		},
		parent: 'par-abc',
		behaviour: PriorityBehaviour.none,
		version: 1,
		controlledPlaylist: null,
		isFirstInPlaylist: {} as SMILMedia,
		...overrides,
	};
}

describe('PriorityStateManager', () => {
	let state: CurrentlyPlayingPriority;
	let promiseAwaiting: PromiseAwaiting;
	let mgr: PriorityStateManager;

	beforeEach(() => {
		state = {};
		promiseAwaiting = {};
		mgr = new PriorityStateManager(state, promiseAwaiting);
	});

	describe('ensureRegion', () => {
		it('should create region array when it does not exist', () => {
			const region = mgr.ensureRegion('main');
			expect(region).to.be.an('array').with.length(0);
			expect(state['main']).to.equal(region);
		});

		it('should return existing region array', () => {
			state['main'] = [makeRegion()];
			const region = mgr.ensureRegion('main');
			expect(region).to.have.length(1);
		});
	});

	describe('getPlayingIndex', () => {
		it('should return -1 when no entry is playing', () => {
			state['main'] = [makeRegion({ player: { contentPause: 0, stop: false, endTime: 0, playing: false, timesPlayed: 0 } })];
			expect(mgr.getPlayingIndex('main')).to.equal(-1);
		});

		it('should return index of playing entry', () => {
			state['main'] = [
				makeRegion({ player: { contentPause: 0, stop: false, endTime: 0, playing: false, timesPlayed: 0 } }),
				makeRegion({ player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0 } }),
			];
			expect(mgr.getPlayingIndex('main')).to.equal(1);
		});
	});

	describe('hasConflict', () => {
		it('should return true when multiple entries with different indices and same version', () => {
			state['main'] = [
				makeRegion({ version: 1 }),
				makeRegion({ version: 1 }),
			];
			expect(mgr.hasConflict('main', 0, 1)).to.be.true;
		});

		it('should return false when same index', () => {
			state['main'] = [makeRegion(), makeRegion()];
			expect(mgr.hasConflict('main', 0, 0)).to.be.false;
		});

		it('should return false when only one entry', () => {
			state['main'] = [makeRegion()];
			expect(mgr.hasConflict('main', 0, 0)).to.be.false;
		});
	});

	describe('registerOrUpdate', () => {
		it('should create first entry for new region', () => {
			const media = makeMedia('video1.mp4');
			const result = mgr.registerOrUpdate('main', media, 'par-111', 0, makePriorityObject(), 1);
			expect(result.currentIndex).to.equal(0);
			expect(state['main']).to.have.length(1);
			expect(state['main'][0].media).to.equal(media);
			expect(state['main'][0].isFirstInPlaylist).to.equal(media);
		});

		it('should update existing entry with same parent and version', () => {
			const media1 = makeMedia('video1.mp4');
			const media2 = makeMedia('video2.mp4');
			mgr.registerOrUpdate('main', media1, 'par-111', 0, makePriorityObject(), 1);
			// Update with different media but same parent
			const result = mgr.registerOrUpdate('main', media2, 'par-111', 0, makePriorityObject(), 1);
			expect(result.currentIndex).to.equal(0);
			expect(state['main']).to.have.length(1);
			expect(state['main'][0].media).to.equal(media2);
		});

		it('should add new entry for different parent', () => {
			const media1 = makeMedia('video1.mp4');
			const media2 = makeMedia('video2.mp4');
			mgr.registerOrUpdate('main', media1, 'par-111', 0, makePriorityObject(), 1);
			const result = mgr.registerOrUpdate('main', media2, 'par-222', 0, makePriorityObject(), 1);
			expect(result.currentIndex).to.equal(1);
			expect(state['main']).to.have.length(2);
		});

		it('should preserve behaviour and playing state from existing entry', () => {
			const media = makeMedia('video1.mp4');
			mgr.registerOrUpdate('main', media, 'par-111', 0, makePriorityObject(), 1);
			state['main'][0].behaviour = PriorityBehaviour.pause;
			state['main'][0].player.playing = true;
			state['main'][0].player.timesPlayed = 5;

			mgr.registerOrUpdate('main', media, 'par-111', 0, makePriorityObject(), 1);
			expect(state['main'][0].behaviour).to.equal(PriorityBehaviour.pause);
			expect(state['main'][0].player.playing).to.be.true;
			expect(state['main'][0].player.timesPlayed).to.equal(5);
		});
	});

	describe('setPlaying', () => {
		it('should set playing to true and create deferred', () => {
			state['main'] = [makeRegion()];
			mgr.setPlaying('main', 0);
			expect(state['main'][0].player.playing).to.be.true;
			expect(state['main'][0].player.playingCompletionDeferred).to.not.be.undefined;
		});
	});

	describe('setStopped', () => {
		it('should set stop flag, clear playing, set behaviour, and resolve deferred', () => {
			state['main'] = [makeRegion({ player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0 } })];
			mgr.setPlaying('main', 0); // ensure deferred exists
			mgr.setStopped('main', 0);
			const entry = state['main'][0];
			expect(entry.player.stop).to.be.true;
			expect(entry.player.playing).to.be.false;
			expect(entry.behaviour).to.equal(PriorityBehaviour.stop);
			expect(entry.player.playingCompletionDeferred!.isSettled).to.be.true;
		});
	});

	describe('setPaused', () => {
		it('should set contentPause, clear playing, set behaviour, and link controller', () => {
			state['main'] = [
				makeRegion({ player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0 } }),
				makeRegion(),
			];
			mgr.setPlaying('main', 0);
			mgr.setPaused('main', 0, 1);
			const entry = state['main'][0];
			expect(entry.player.contentPause).to.equal(PAUSE_CONTENT_VALUE);
			expect(entry.player.playing).to.be.false;
			expect(entry.behaviour).to.equal(PriorityBehaviour.pause);
			expect(state['main'][1].controlledPlaylist).to.equal(0);
		});
	});

	describe('setDeferred', () => {
		it('should set playing to false and resolve deferred', () => {
			state['main'] = [makeRegion()];
			mgr.setPlaying('main', 0);
			mgr.setDeferred('main', 0);
			expect(state['main'][0].player.playing).to.be.false;
			expect(state['main'][0].player.playingCompletionDeferred!.isSettled).to.be.true;
		});
	});

	describe('resetBehaviour', () => {
		it('should clear behaviour to none', () => {
			state['main'] = [makeRegion({ behaviour: PriorityBehaviour.defer })];
			mgr.resetBehaviour('main', 0);
			expect(state['main'][0].behaviour).to.equal(PriorityBehaviour.none);
		});
	});

	describe('unpauseControlled', () => {
		it('should reset contentPause and behaviour', () => {
			state['main'] = [makeRegion({
				player: { contentPause: PAUSE_CONTENT_VALUE, stop: false, endTime: 0, playing: false, timesPlayed: 0 },
				behaviour: PriorityBehaviour.pause,
			})];
			mgr.unpauseControlled('main', 0);
			expect(state['main'][0].player.contentPause).to.equal(0);
			expect(state['main'][0].behaviour).to.equal(PriorityBehaviour.none);
		});
	});

	describe('markFinished', () => {
		it('should reset timesPlayed and playing, resolve deferred, return pausedIndex', () => {
			state['main'] = [makeRegion({
				player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 5 },
				controlledPlaylist: 1,
			})];
			mgr.setPlaying('main', 0);
			const result = mgr.markFinished('main', 0);
			expect(state['main'][0].player.timesPlayed).to.equal(0);
			expect(state['main'][0].player.playing).to.be.false;
			expect(result.pausedIndex).to.equal(1);
		});

		it('should return null pausedIndex when not controlling anything', () => {
			state['main'] = [makeRegion()];
			const result = mgr.markFinished('main', 0);
			expect(result.pausedIndex).to.be.null;
		});
	});

	describe('incrementTimesPlayed', () => {
		it('should increment timesPlayed counter', () => {
			state['main'] = [makeRegion()];
			mgr.incrementTimesPlayed('main', 0);
			expect(state['main'][0].player.timesPlayed).to.equal(1);
			mgr.incrementTimesPlayed('main', 0);
			expect(state['main'][0].player.timesPlayed).to.equal(2);
		});
	});

	describe('resetTimesPlayed', () => {
		it('should reset timesPlayed counter to zero', () => {
			state['main'] = [makeRegion()];
			mgr.incrementTimesPlayed('main', 0);
			mgr.incrementTimesPlayed('main', 0);
			expect(state['main'][0].player.timesPlayed).to.equal(2);
			mgr.resetTimesPlayed('main', 0);
			expect(state['main'][0].player.timesPlayed).to.equal(0);
		});
	});

	describe('waitForCompletion', () => {
		it('should resolve immediately when not playing', async () => {
			state['main'] = [makeRegion()];
			// Should not hang
			await mgr.waitForCompletion('main', 0);
		});

		it('should wait until deferred resolves when playing', async () => {
			state['main'] = [makeRegion({ player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0 } })];
			mgr.setPlaying('main', 0);

			let resolved = false;
			const waitPromise = mgr.waitForCompletion('main', 0).then(() => { resolved = true; });

			// Not yet resolved
			await new Promise((r) => setTimeout(r, 10));
			expect(resolved).to.be.false;

			// Resolve deferred
			mgr.markFinished('main', 0);

			await waitPromise;
			expect(resolved).to.be.true;
		});
	});

	describe('cleanupPriorityTracking', () => {
		it('should reset highestProcessingPriority when it matches the given level', () => {
			promiseAwaiting['main'] = { highestProcessingPriority: 2, version: 1 } as any;
			mgr.cleanupPriorityTracking('main', 1, 2);
			expect(promiseAwaiting['main'].highestProcessingPriority).to.equal(-1);
		});

		it('should not reset highestProcessingPriority when it does not match', () => {
			promiseAwaiting['main'] = { highestProcessingPriority: 2, version: 1 } as any;
			mgr.cleanupPriorityTracking('main', 1, 1);
			expect(promiseAwaiting['main'].highestProcessingPriority).to.equal(2);
		});

		it('should update version if outdated', () => {
			promiseAwaiting['main'] = { version: 1 } as any;
			mgr.cleanupPriorityTracking('main', 3);
			expect(promiseAwaiting['main'].version).to.equal(3);
		});

		it('should not fail when region does not exist in promiseAwaiting', () => {
			mgr.cleanupPriorityTracking('nonexistent', 1, 0);
			// should not throw
		});
	});

	describe('cleanupExpiredPriority', () => {
		it('should set playing=false and resolve deferred for matching priority entries', () => {
			state['main'] = [
				makeRegion({
					priority: makePriorityObject({ priorityLevel: 2 }),
					player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0 },
				}),
				makeRegion({
					priority: makePriorityObject({ priorityLevel: 1 }),
					player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0 },
				}),
			];
			mgr.setPlaying('main', 0);
			mgr.setPlaying('main', 1);
			promiseAwaiting['main'] = { highestProcessingPriority: 2, version: 1 } as any;

			mgr.cleanupExpiredPriority(1, 2);

			// Only priority level 2 should be stopped
			expect(state['main'][0].player.playing).to.be.false;
			expect(state['main'][1].player.playing).to.be.true;
			// Priority tracking should be cleaned up
			expect(promiseAwaiting['main'].highestProcessingPriority).to.equal(-1);
		});
	});

	describe('waitUntil', () => {
		it('should resolve immediately when predicate is already true', async () => {
			state['main'] = [makeRegion({ player: { contentPause: 0, stop: false, endTime: 0, playing: false, timesPlayed: 0 } })];
			await mgr.waitUntil('main', (entries) => !entries[0].player.playing);
			// Should not hang
		});

		it('should block until mutation satisfies predicate', async () => {
			state['main'] = [makeRegion({ player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0 } })];
			mgr.setPlaying('main', 0);

			let resolved = false;
			const waitPromise = mgr.waitUntil('main', (entries) => !entries[0].player.playing).then(() => { resolved = true; });

			await new Promise((r) => setTimeout(r, 10));
			expect(resolved).to.be.false;

			mgr.markFinished('main', 0);

			await waitPromise;
			expect(resolved).to.be.true;
		});

		it('should resolve ALL matching unordered waiters simultaneously', async () => {
			state['main'] = [makeRegion({ player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0 } })];
			mgr.setPlaying('main', 0);

			let resolved1 = false;
			let resolved2 = false;
			const p1 = mgr.waitUntil('main', (e) => !e[0].player.playing).then(() => { resolved1 = true; });
			const p2 = mgr.waitUntil('main', (e) => !e[0].player.playing).then(() => { resolved2 = true; });

			mgr.markFinished('main', 0);

			await Promise.all([p1, p2]);
			expect(resolved1).to.be.true;
			expect(resolved2).to.be.true;
		});
	});

	describe('waitForTurn', () => {
		it('should resolve ONLY highest priority among multiple satisfied waiters', async () => {
			state['main'] = [makeRegion({ player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0 } })];
			mgr.setPlaying('main', 0);

			let resolvedHigh = false;
			let resolvedLow = false;
			mgr.waitForTurn('main', (e) => !e[0].player.playing, 1).then(() => { resolvedHigh = true; });
			mgr.waitForTurn('main', (e) => !e[0].player.playing, 0).then(() => { resolvedLow = true; });

			mgr.markFinished('main', 0);

			// Allow microtasks to process
			await new Promise((r) => setTimeout(r, 10));

			expect(resolvedHigh).to.be.true;
			expect(resolvedLow).to.be.false; // Lower priority stays registered
		});

		it('should resolve lower priority on subsequent mutation after winner acts', async () => {
			state['main'] = [
				makeRegion({
					priority: makePriorityObject({ priorityLevel: 2 }),
					player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0 },
				}),
				makeRegion({ priority: makePriorityObject({ priorityLevel: 1 }) }),
				makeRegion({ priority: makePriorityObject({ priorityLevel: 0 }) }),
			];
			mgr.setPlaying('main', 0);

			let resolvedP2 = false;
			let resolvedP1 = false;
			mgr.waitForTurn('main', (e) => !e[0].player.playing, 1).then(() => { resolvedP2 = true; });
			mgr.waitForTurn('main', (e) => !e[0].player.playing, 0).then(() => { resolvedP1 = true; });

			// P3 finishes → only P2 wakes
			mgr.markFinished('main', 0);
			await new Promise((r) => setTimeout(r, 10));
			expect(resolvedP2).to.be.true;
			expect(resolvedP1).to.be.false;

			// P2 starts playing → triggers notifyWaiters → P1 wakes
			mgr.setPlaying('main', 1);
			await new Promise((r) => setTimeout(r, 10));
			expect(resolvedP1).to.be.true;
		});

		it('should handle mixed ordered and unordered waiters', async () => {
			state['main'] = [makeRegion({ player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0 } })];
			mgr.setPlaying('main', 0);

			let resolvedOrdered = false;
			let resolvedUnordered = false;
			mgr.waitForTurn('main', (e) => !e[0].player.playing, 0).then(() => { resolvedOrdered = true; });
			mgr.waitUntil('main', (e) => !e[0].player.playing).then(() => { resolvedUnordered = true; });

			mgr.markFinished('main', 0);
			await new Promise((r) => setTimeout(r, 10));

			// Both should resolve — unordered always resolves, ordered resolves as only one
			expect(resolvedOrdered).to.be.true;
			expect(resolvedUnordered).to.be.true;
		});
	});

});
