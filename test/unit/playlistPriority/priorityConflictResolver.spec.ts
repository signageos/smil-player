import * as chai from 'chai';
import { PriorityConflictResolver } from '../../../src/components/playlist/playlistPriority/priorityConflictResolver';
import { PriorityStateManager } from '../../../src/components/playlist/playlistPriority/priorityStateManager';
import { CurrentlyPlayingPriority, PromiseAwaiting } from '../../../src/models/playlistModels';
import { IPrioritySideEffects } from '../../../src/components/playlist/playlistPriority/prioritySideEffects';
import { PriorityBehaviour, PriorityRule } from '../../../src/enums/priorityEnums';
import { SMILMedia } from '../../../src/models/mediaModels';
import { makePriorityObject, makeMedia, makeRegion, makeMockSideEffects } from './testHelpers';

const expect = chai.expect;

describe('PriorityConflictResolver', () => {
	let state: CurrentlyPlayingPriority;
	let promiseAwaiting: PromiseAwaiting;
	let stateManager: PriorityStateManager;
	let sideEffects: IPrioritySideEffects;
	let synchronization: { syncingInAction: boolean; movingForward: boolean };
	let resolver: PriorityConflictResolver;

	beforeEach(() => {
		state = {};
		promiseAwaiting = {};
		stateManager = new PriorityStateManager(state, promiseAwaiting);
		sideEffects = makeMockSideEffects();
		synchronization = { syncingInAction: false, movingForward: false };
		resolver = new PriorityConflictResolver(
			stateManager,
			sideEffects,
			synchronization,
			() => false,
			() => undefined,
		);
	});

	describe('handleStopBehaviour', () => {
		it('should set stopped on the previous playing entry', () => {
			state['main'] = [
				makeRegion({ player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0 } }),
			];
			stateManager.setPlaying('main', 0);

			resolver.handleStopBehaviour('main', 0);

			expect(state['main'][0].player.stop).to.be.true;
			expect(state['main'][0].player.playing).to.be.false;
			expect(state['main'][0].behaviour).to.equal(PriorityBehaviour.stop);
		});

		it('should hide transition element if media has transitionInfo', () => {
			let hideCalled = false;
			sideEffects.hideTransitionElement = () => { hideCalled = true; };
			state['main'] = [
				makeRegion({
					media: { ...makeMedia(), transitionInfo: { dur: '1s' } } as any,
					player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0 },
				}),
			];
			stateManager.setPlaying('main', 0);

			resolver.handleStopBehaviour('main', 0);

			expect(hideCalled).to.be.true;
		});
	});

	describe('handlePauseBehaviour', () => {
		it('should set paused on previous entry and link controller', () => {
			state['main'] = [
				makeRegion({ player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0 } }),
				makeRegion(),
			];
			stateManager.setPlaying('main', 0);

			resolver.handlePauseBehaviour('main', 1, 0);

			expect(state['main'][0].player.contentPause).to.equal(9999999);
			expect(state['main'][0].player.playing).to.be.false;
			expect(state['main'][0].behaviour).to.equal(PriorityBehaviour.pause);
			expect(state['main'][1].controlledPlaylist).to.equal(0);
		});
	});

	describe('handlePriorityBeforePlay', () => {
		it('should short-circuit with never-blocked when syncing and peer conflict', async () => {
			synchronization.syncingInAction = true;
			state['main'] = [
				makeRegion({
					priority: makePriorityObject({ priorityLevel: 1 }),
					parent: 'par-111',
					player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0 },
				}),
				makeRegion({
					priority: makePriorityObject({ priorityLevel: 1 }),
					parent: 'par-222',
				}),
			];
			stateManager.setPlaying('main', 0);

			await resolver.handlePriorityBeforePlay(
				'video1',
				makePriorityObject({ priorityLevel: 1 }),
				'main', 1, 0, 'par-222',
				Date.now() + 10000,
			);

			// Previous entry should be never-blocked
			expect(state['main'][0].player.playing).to.be.false;
		});

		it('should call stop when higher priority incoming with higher=stop', async () => {
			state['main'] = [
				makeRegion({
					priority: makePriorityObject({ priorityLevel: 0, higher: PriorityRule.stop }),
					parent: 'par-111',
					player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0 },
				}),
				makeRegion({
					priority: makePriorityObject({ priorityLevel: 1 }),
					parent: 'par-222',
				}),
			];
			stateManager.setPlaying('main', 0);

			await resolver.handlePriorityBeforePlay(
				'video1',
				makePriorityObject({ priorityLevel: 1 }),
				'main', 1, 0, 'par-222', 0,
			);

			expect(state['main'][0].player.stop).to.be.true;
			expect(state['main'][0].player.playing).to.be.false;
		});

		it('should call pause when higher priority incoming with higher=pause', async () => {
			state['main'] = [
				makeRegion({
					priority: makePriorityObject({ priorityLevel: 0, higher: PriorityRule.pause }),
					parent: 'par-111',
					player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0 },
				}),
				makeRegion({
					priority: makePriorityObject({ priorityLevel: 1 }),
					parent: 'par-222',
				}),
			];
			stateManager.setPlaying('main', 0);

			await resolver.handlePriorityBeforePlay(
				'video1',
				makePriorityObject({ priorityLevel: 1 }),
				'main', 1, 0, 'par-222', 0,
			);

			expect(state['main'][0].player.contentPause).to.equal(9999999);
			expect(state['main'][0].behaviour).to.equal(PriorityBehaviour.pause);
		});

		it('should apply remapped rule for lower priority incoming (stop→never)', async () => {
			// Lower priority arrives, existing has lower=stop which remaps to never
			state['main'] = [
				makeRegion({
					priority: makePriorityObject({ priorityLevel: 2, lower: PriorityRule.stop }),
					parent: 'par-111',
					player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0 },
				}),
				makeRegion({
					priority: makePriorityObject({ priorityLevel: 0 }),
					parent: 'par-222',
				}),
			];
			stateManager.setPlaying('main', 0);

			// never behaviour blocks — resolve blocker immediately so test doesn't hang
			setTimeout(() => {
				stateManager.markFinished('main', 0);
			}, 10);

			await resolver.handlePriorityBeforePlay(
				'video1',
				makePriorityObject({ priorityLevel: 0 }),
				'main', 1, 0, 'par-222', 0,
			);

			// The higher priority entry should NOT be stopped (remap prevents it)
			expect(state['main'][0].player.stop).to.be.false;
		});

		it('should handle peer conflict with stop rule', async () => {
			state['main'] = [
				makeRegion({
					priority: makePriorityObject({ priorityLevel: 1, peer: PriorityRule.stop }),
					parent: 'par-111',
					player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0 },
				}),
				makeRegion({
					priority: makePriorityObject({ priorityLevel: 1 }),
					parent: 'par-222',
				}),
			];
			stateManager.setPlaying('main', 0);

			await resolver.handlePriorityBeforePlay(
				'video1',
				makePriorityObject({ priorityLevel: 1 }),
				'main', 1, 0, 'par-222',
				Date.now() + 10000,
			);

			expect(state['main'][0].player.stop).to.be.true;
		});
	});

	describe('handleDeferBehaviour', () => {
		it('should set deferred and wait for blocker to finish', async () => {
			state['main'] = [
				makeRegion({
					priority: makePriorityObject({ priorityLevel: 1 }),
					parent: 'par-111',
					player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0 },
				}),
				makeRegion({
					priority: makePriorityObject({ priorityLevel: 0 }),
					parent: 'par-222',
				}),
			];
			stateManager.setPlaying('main', 0);

			// Release blocker after short delay
			setTimeout(() => {
				stateManager.markFinished('main', 0);
			}, 20);

			await resolver.handleDeferBehaviour(
				'video1',
				makePriorityObject({ priorityLevel: 0, maxPriorityLevel: 1 }),
				'main', 1, 0, 'par-222', 0,
			);

			// Should have been deferred
			expect(state['main'][1].behaviour).to.equal(PriorityBehaviour.none); // reset after release
		});

		it('should prepare video for dynamic content when src differs', async () => {
			let prepareCalled = false;
			sideEffects.prepareVideo = async () => { prepareCalled = true; };
			resolver = new PriorityConflictResolver(
				stateManager,
				sideEffects,
				synchronization,
				() => false,
				() => 'different-src.mp4', // currently playing has different src
			);

			state['main'] = [
				makeRegion({
					priority: makePriorityObject({ priorityLevel: 1 }),
					parent: 'par-111',
					player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0 },
				}),
				makeRegion({
					media: { src: 'dynamic.mp4', regionInfo: { regionName: 'main' }, dynamicValue: 'dyn1' } as SMILMedia,
					priority: makePriorityObject({ priorityLevel: 0 }),
					parent: 'par-222',
				}),
			];
			stateManager.setPlaying('main', 0);

			setTimeout(() => {
				stateManager.markFinished('main', 0);
			}, 20);

			await resolver.handleDeferBehaviour(
				'video1',
				makePriorityObject({ priorityLevel: 0, maxPriorityLevel: 1 }),
				'main', 1, 0, 'par-222', 0,
			);

			expect(prepareCalled).to.be.true;
		});
	});

	describe('handlePrecedingContentStop', () => {
		it('should wait for blocker to finish then reset stop state', async () => {
			state['main'] = [
				makeRegion({
					priority: makePriorityObject({ priorityLevel: 1 }),
					parent: 'par-111',
					player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0 },
				}),
				makeRegion({
					priority: makePriorityObject({ priorityLevel: 0 }),
					parent: 'par-222',
					behaviour: PriorityBehaviour.stop,
					player: { contentPause: 0, stop: true, endTime: 0, playing: false, timesPlayed: 0 },
				}),
			];
			stateManager.setPlaying('main', 0);

			setTimeout(() => {
				stateManager.markFinished('main', 0);
			}, 20);

			await resolver.handlePrecedingContentStop(
				makePriorityObject({ priorityLevel: 0, maxPriorityLevel: 1 }),
				'main', 1, 0,
			);

			// After release, stop state should be reset
			expect(state['main'][1].behaviour).to.equal(PriorityBehaviour.none);
			expect(state['main'][1].player.stop).to.be.false;
		});
	});
});
