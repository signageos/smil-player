import * as chai from 'chai';
import { PlaylistPriority } from '../../../src/components/playlist/playlistPriority/playlistPriority';
import { CurrentlyPlayingPriority, PlaylistOptions, PromiseAwaiting } from '../../../src/models/playlistModels';
import { PriorityBehaviour, PriorityRule } from '../../../src/enums/priorityEnums';
import { PlaylistTriggers } from '../../../src/components/playlist/playlistTriggers/playlistTriggers';
import { makePriorityObject, makeMedia, makeMockSideEffects } from './testHelpers';

const expect = chai.expect;

describe('PlaylistPriority integration', () => {
	let currentlyPlayingPriority: CurrentlyPlayingPriority;
	let promiseAwaiting: PromiseAwaiting;
	let priority: PlaylistPriority;
	let cancelFunction: boolean[];

	beforeEach(() => {
		currentlyPlayingPriority = {};
		promiseAwaiting = {};
		cancelFunction = [false];
		const options = {
			currentlyPlayingPriority,
			promiseAwaiting,
			cancelFunction,
			currentlyPlaying: {},
			synchronization: { syncingInAction: false, movingForward: false } as any,
			videoPreparing: {},
			randomPlaylist: {},
		} as PlaylistOptions;
		priority = new PlaylistPriority(options, undefined, { sideEffects: makeMockSideEffects() });
	});

	describe('stop lifecycle', () => {
		it('should stop lower-priority content when higher-priority arrives, then clean up', async () => {
			// A registers and plays (priority 0)
			const mediaA = makeMedia('a.mp4');
			const priorityA = makePriorityObject({ priorityLevel: 0, higher: PriorityRule.stop });
			const resultA = await priority.priorityBehaviour(mediaA, 'video1', 1, 'par-A', 0, priorityA);
			expect(currentlyPlayingPriority['main'][resultA.currentIndex].player.playing).to.be.true;

			// B registers (priority 1, higher than A) — should stop A
			const mediaB = makeMedia('b.mp4');
			const priorityB = makePriorityObject({ priorityLevel: 1, higher: PriorityRule.stop });
			const resultB = await priority.priorityBehaviour(mediaB, 'video2', 1, 'par-B', 0, priorityB);

			// A should be stopped
			expect(currentlyPlayingPriority['main'][resultA.currentIndex].player.stop).to.be.true;
			expect(currentlyPlayingPriority['main'][resultA.currentIndex].player.playing).to.be.false;
			expect(currentlyPlayingPriority['main'][resultA.currentIndex].behaviour).to.equal(PriorityBehaviour.stop);
			// B should be playing
			expect(currentlyPlayingPriority['main'][resultB.currentIndex].player.playing).to.be.true;

			// B finishes (use version expiry: version=1, currentVersion=2)
			await priority.handlePriorityWhenDone(
				mediaB, 'main', resultB.currentIndex, 0, true, 1, 2, {} as PlaylistTriggers,
			);
			expect(currentlyPlayingPriority['main'][resultB.currentIndex].player.playing).to.be.false;
		});
	});

	describe('pause/unpause lifecycle', () => {
		it('should pause lower-priority content when higher-priority arrives, then unpause on finish', async () => {
			// A registers and plays (priority 0, higher=pause)
			const mediaA = makeMedia('a.mp4');
			const priorityA = makePriorityObject({ priorityLevel: 0, higher: PriorityRule.pause });
			const resultA = await priority.priorityBehaviour(mediaA, 'video1', 1, 'par-A', 0, priorityA);
			expect(currentlyPlayingPriority['main'][resultA.currentIndex].player.playing).to.be.true;

			// B registers (priority 1) — should pause A
			const mediaB = makeMedia('b.mp4');
			const priorityB = makePriorityObject({ priorityLevel: 1, higher: PriorityRule.pause });
			const resultB = await priority.priorityBehaviour(mediaB, 'video2', 1, 'par-B', 0, priorityB);

			// A should be paused
			const entryA = currentlyPlayingPriority['main'][resultA.currentIndex];
			expect(entryA.player.playing).to.be.false;
			expect(entryA.behaviour).to.equal(PriorityBehaviour.pause);
			expect(entryA.player.contentPause).to.be.greaterThan(0);
			// B should be playing
			expect(currentlyPlayingPriority['main'][resultB.currentIndex].player.playing).to.be.true;
			// B controls A
			expect(currentlyPlayingPriority['main'][resultB.currentIndex].controlledPlaylist).to.equal(resultA.currentIndex);

			// B finishes (use version expiry to trigger unlock) — A should be unpaused
			await priority.handlePriorityWhenDone(
				mediaB, 'main', resultB.currentIndex, 0, true, 1, 2, {} as PlaylistTriggers,
			);

			const updatedA = currentlyPlayingPriority['main'][resultA.currentIndex];
			expect(updatedA.player.contentPause).to.equal(0);
			expect(updatedA.behaviour).to.equal(PriorityBehaviour.none);
		});
	});

	describe('defer lifecycle', () => {
		it('should defer lower-priority content until higher finishes', async () => {
			// A registers and plays (priority 1, lower=defer)
			const mediaA = makeMedia('a.mp4');
			const priorityA = makePriorityObject({ priorityLevel: 1, lower: PriorityRule.defer });
			const resultA = await priority.priorityBehaviour(mediaA, 'video1', 1, 'par-A', 0, priorityA);
			expect(currentlyPlayingPriority['main'][resultA.currentIndex].player.playing).to.be.true;

			// B registers (priority 0, lower than A) — should defer
			const mediaB = makeMedia('b.mp4');
			const priorityB = makePriorityObject({ priorityLevel: 0, lower: PriorityRule.defer });

			// B's priorityBehaviour will block until A finishes, so run it concurrently
			let resultB: { currentIndex: number; previousPlayingIndex: number } | undefined;
			const bPromise = priority.priorityBehaviour(mediaB, 'video2', 1, 'par-B', 0, priorityB).then((r) => {
				resultB = r;
			});

			// Let the defer registration happen
			await new Promise((r) => setTimeout(r, 20));

			// A finishes (version expiry) — should release B
			await priority.handlePriorityWhenDone(
				mediaA, 'main', resultA.currentIndex, 0, true, 1, 2, {} as PlaylistTriggers,
			);

			await bPromise;
			expect(resultB).to.not.be.undefined;
			expect(currentlyPlayingPriority['main'][resultB!.currentIndex].player.playing).to.be.true;
		});
	});

	describe('never lifecycle', () => {
		it('should block lower-priority content with never rule until higher finishes', async () => {
			// A registers and plays (priority 1, lower=never)
			const mediaA = makeMedia('a.mp4');
			const priorityA = makePriorityObject({ priorityLevel: 1, lower: PriorityRule.never });
			const resultA = await priority.priorityBehaviour(mediaA, 'video1', 1, 'par-A', 0, priorityA);
			expect(currentlyPlayingPriority['main'][resultA.currentIndex].player.playing).to.be.true;

			// B registers (priority 0, lower=never → remapped to never) — should block
			const mediaB = makeMedia('b.mp4');
			const priorityB = makePriorityObject({ priorityLevel: 0, lower: PriorityRule.never });

			let resultB: { currentIndex: number; previousPlayingIndex: number } | undefined;
			const bPromise = priority.priorityBehaviour(mediaB, 'video2', 1, 'par-B', 0, priorityB).then((r) => {
				resultB = r;
			});

			await new Promise((r) => setTimeout(r, 20));

			// A finishes (version expiry) — should release B
			await priority.handlePriorityWhenDone(
				mediaA, 'main', resultA.currentIndex, 0, true, 1, 2, {} as PlaylistTriggers,
			);

			await bPromise;
			expect(resultB).to.not.be.undefined;
			expect(currentlyPlayingPriority['main'][resultB!.currentIndex].player.playing).to.be.true;
		});
	});

	describe('version expiry', () => {
		it('should unlock playlist when version becomes expired', async () => {
			// A registers and plays (version 1)
			const mediaA = makeMedia('a.mp4');
			const priorityA = makePriorityObject({ priorityLevel: 0 });
			const resultA = await priority.priorityBehaviour(mediaA, 'video1', 1, 'par-A', 0, priorityA);

			// handlePriorityWhenDone with version < currentVersion → should unlock
			await priority.handlePriorityWhenDone(
				mediaA, 'main', resultA.currentIndex, 0, false, 1, 2, {} as PlaylistTriggers,
			);

			expect(currentlyPlayingPriority['main'][resultA.currentIndex].player.playing).to.be.false;
		});
	});
});
