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
