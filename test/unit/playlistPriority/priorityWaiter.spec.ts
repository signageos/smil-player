import * as chai from 'chai';
import {
	waitForPriorityRelease,
	WaitCondition,
} from '../../../src/components/playlist/playlistPriority/priorityWaiter';
import { PriorityStateManager } from '../../../src/components/playlist/playlistPriority/priorityStateManager';
import { CurrentlyPlayingPriority, PromiseAwaiting } from '../../../src/models/playlistModels';
import { makePriorityObject, makeRegion } from './testHelpers';

const expect = chai.expect;

describe('priorityWaiter', () => {
	describe('waitForPriorityRelease', () => {
		let state: CurrentlyPlayingPriority;
		let promiseAwaiting: PromiseAwaiting;
		let stateManager: PriorityStateManager;

		beforeEach(() => {
			state = {};
			promiseAwaiting = {};
			stateManager = new PriorityStateManager(state, promiseAwaiting);
		});

		it('should return "released" immediately when blocker is not playing and no new blocker', async () => {
			state['main'] = [
				makeRegion({ player: { contentPause: 0, stop: false, endTime: 0, playing: false, timesPlayed: 0 } }),
				makeRegion({ player: { contentPause: 0, stop: false, endTime: 0, playing: false, timesPlayed: 0 } }),
			];

			const condition: WaitCondition = {
				shouldExit: () => true,
				updateBlocker: () => null,
			};

			const result = await waitForPriorityRelease(
				stateManager,
				state['main'],
				state['main'][1],
				1,
				0,
				'main',
				makePriorityObject({ priorityLevel: 1, maxPriorityLevel: 1 }),
				() => false,
				condition,
			);

			expect(result).to.equal('released');
		});

		it('should return "cancelled" when isCancelled returns true', async () => {
			state['main'] = [
				makeRegion({ player: { contentPause: 0, stop: false, endTime: 0, playing: false, timesPlayed: 0 } }),
				makeRegion({ player: { contentPause: 0, stop: false, endTime: 0, playing: false, timesPlayed: 0 } }),
			];

			const condition: WaitCondition = {
				shouldExit: () => false,
				updateBlocker: () => 0,
			};

			const result = await waitForPriorityRelease(
				stateManager,
				state['main'],
				state['main'][1],
				1,
				0,
				'main',
				makePriorityObject({ priorityLevel: 1, maxPriorityLevel: 1 }),
				() => true,
				condition,
			);

			expect(result).to.equal('cancelled');
		});

		it('should return "expired" when endTime has passed', async () => {
			state['main'] = [
				makeRegion({ player: { contentPause: 0, stop: false, endTime: 0, playing: false, timesPlayed: 0 } }),
				makeRegion({ player: { contentPause: 0, stop: false, endTime: Date.now() - 1000, playing: false, timesPlayed: 0 } }),
			];

			const condition: WaitCondition = {
				shouldExit: () => false,
				updateBlocker: () => 0,
			};

			const result = await waitForPriorityRelease(
				stateManager,
				state['main'],
				state['main'][1],
				1,
				0,
				'main',
				makePriorityObject({ priorityLevel: 1, maxPriorityLevel: 1 }),
				() => false,
				condition,
			);

			expect(result).to.equal('expired');
		});

		it('should wait for deferred and then return "released" when blocker finishes', async () => {
			state['main'] = [
				makeRegion({ player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0 } }),
				makeRegion({ player: { contentPause: 0, stop: false, endTime: 0, playing: false, timesPlayed: 0 } }),
			];
			stateManager.setPlaying('main', 0);

			const condition: WaitCondition = {
				shouldExit: (idx) => idx === -1,
				updateBlocker: () => null,
			};

			// Resolve the blocker after a short delay
			setTimeout(() => {
				stateManager.markFinished('main', 0);
			}, 50);

			const result = await waitForPriorityRelease(
				stateManager,
				state['main'],
				state['main'][1],
				1,
				0,
				'main',
				makePriorityObject({ priorityLevel: 1, maxPriorityLevel: 1 }),
				() => false,
				condition,
			);

			expect(result).to.equal('released');
		});

		it('should re-enter wait loop when initial blocker finishes but updateBlocker returns new index', async () => {
			state['main'] = [
				makeRegion({
					priority: makePriorityObject({ priorityLevel: 2 }),
					player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0 },
				}),
				makeRegion({
					priority: makePriorityObject({ priorityLevel: 0 }),
					player: { contentPause: 0, stop: false, endTime: 0, playing: false, timesPlayed: 0 },
				}),
				makeRegion({
					priority: makePriorityObject({ priorityLevel: 2 }),
					player: { contentPause: 0, stop: false, endTime: 0, playing: false, timesPlayed: 0 },
				}),
			];
			stateManager.setPlaying('main', 0);

			let blockerTransitions = 0;
			const condition: WaitCondition = {
				shouldExit: (idx) => idx === -1,
				updateBlocker: (idx) => {
					blockerTransitions++;
					// After first blocker finishes, second blocker (index 2) starts
					if (blockerTransitions === 1 && idx === 2) {
						return 2; // Continue waiting for new blocker
					}
					return null; // All done
				},
			};

			// First blocker finishes, then start second
			setTimeout(() => {
				stateManager.markFinished('main', 0);
				stateManager.setPlaying('main', 2);
			}, 30);
			// Second blocker finishes
			setTimeout(() => {
				stateManager.markFinished('main', 2);
			}, 60);

			const result = await waitForPriorityRelease(
				stateManager,
				state['main'],
				state['main'][1],
				1,
				0,
				'main',
				makePriorityObject({ priorityLevel: 0 }),
				() => false,
				condition,
			);

			expect(result).to.equal('released');
			expect(blockerTransitions).to.be.greaterThan(0);
		});

		it('should return "expired" when repeat count is exceeded', async () => {
			// endTime=3 means "play 3 times" (repeat count, since <= ENDTIME_REPEAT_THRESHOLD of 1000)
			state['main'] = [
				makeRegion({ player: { contentPause: 0, stop: false, endTime: 0, playing: false, timesPlayed: 0 } }),
				makeRegion({ player: { contentPause: 0, stop: false, endTime: 3, playing: false, timesPlayed: 3 } }),
			];

			const condition: WaitCondition = {
				shouldExit: () => false,
				updateBlocker: () => 0,
			};

			const result = await waitForPriorityRelease(
				stateManager,
				state['main'],
				state['main'][1],
				1,
				0,
				'main',
				makePriorityObject({ priorityLevel: 1 }),
				() => false,
				condition,
			);

			expect(result).to.equal('expired');
		});

		it('should return "cancelled" when isCancelled becomes true during active blocking', async () => {
			state['main'] = [
				makeRegion({ player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0 } }),
				makeRegion({ player: { contentPause: 0, stop: false, endTime: 0, playing: false, timesPlayed: 0 } }),
			];
			stateManager.setPlaying('main', 0);

			let cancelled = false;
			const condition: WaitCondition = {
				shouldExit: () => false,
				updateBlocker: () => 0,
			};

			// Cancel and release blocker after a short delay
			setTimeout(() => {
				cancelled = true;
				stateManager.markFinished('main', 0);
			}, 30);

			const result = await waitForPriorityRelease(
				stateManager,
				state['main'],
				state['main'][1],
				1,
				0,
				'main',
				makePriorityObject({ priorityLevel: 1 }),
				() => cancelled,
				condition,
			);

			expect(result).to.equal('cancelled');
		});

		it('should return "released" when updateBlocker returns null', async () => {
			state['main'] = [
				makeRegion({ player: { contentPause: 0, stop: false, endTime: 0, playing: false, timesPlayed: 0 } }),
				makeRegion({ player: { contentPause: 0, stop: false, endTime: 0, playing: false, timesPlayed: 0 } }),
			];

			const condition: WaitCondition = {
				shouldExit: () => false,
				updateBlocker: () => null,
			};

			const result = await waitForPriorityRelease(
				stateManager,
				state['main'],
				state['main'][1],
				1,
				0,
				'main',
				makePriorityObject({ priorityLevel: 1, maxPriorityLevel: 1 }),
				() => false,
				condition,
			);

			expect(result).to.equal('released');
		});
	});
});
