import { noopLog } from '../../../src/logger';
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
			synchronization: { syncingInAction: false } as any,
			videoPreparing: {},
			randomPlaylist: {},
		} as PlaylistOptions;
		priority = new PlaylistPriority(options, undefined, noopLog, { sideEffects: makeMockSideEffects() });
	});

	describe('stop lifecycle', () => {
		it('should stop lower-priority content when higher-priority arrives, then clean up', async () => {
			// A registers and plays (priority 0)
			const mediaA = makeMedia('a.mp4');
			const priorityA = makePriorityObject({ priorityLevel: 0, higher: PriorityRule.stop });
			const resultA = await priority.priorityBehaviour(mediaA, 'video1', 1, 'par-A', 0, priorityA);
			expect(currentlyPlayingPriority.main[resultA.currentIndex].player.playing).to.equal(true);

			// B registers (priority 1, higher than A) — should stop A
			const mediaB = makeMedia('b.mp4');
			const priorityB = makePriorityObject({ priorityLevel: 1, higher: PriorityRule.stop });
			const resultB = await priority.priorityBehaviour(mediaB, 'video2', 1, 'par-B', 0, priorityB);

			// A should be stopped
			expect(currentlyPlayingPriority.main[resultA.currentIndex].player.stop).to.equal(true);
			expect(currentlyPlayingPriority.main[resultA.currentIndex].player.playing).to.equal(false);
			expect(currentlyPlayingPriority.main[resultA.currentIndex].behaviour).to.equal(PriorityBehaviour.stop);
			// B should be playing
			expect(currentlyPlayingPriority.main[resultB.currentIndex].player.playing).to.equal(true);

			// B finishes (use version expiry: version=1, currentVersion=2)
			await priority.handlePriorityWhenDone(
				mediaB, 'main', resultB.currentIndex, 0, true, 1, 2, {} as PlaylistTriggers,
			);
			expect(currentlyPlayingPriority.main[resultB.currentIndex].player.playing).to.equal(false);
		});
	});

	describe('pause/unpause lifecycle', () => {
		it('should pause lower-priority content when higher-priority arrives, then unpause on finish', async () => {
			// A registers and plays (priority 0, higher=pause)
			const mediaA = makeMedia('a.mp4');
			const priorityA = makePriorityObject({ priorityLevel: 0, higher: PriorityRule.pause });
			const resultA = await priority.priorityBehaviour(mediaA, 'video1', 1, 'par-A', 0, priorityA);
			expect(currentlyPlayingPriority.main[resultA.currentIndex].player.playing).to.equal(true);

			// B registers (priority 1) — should pause A
			const mediaB = makeMedia('b.mp4');
			const priorityB = makePriorityObject({ priorityLevel: 1, higher: PriorityRule.pause });
			const resultB = await priority.priorityBehaviour(mediaB, 'video2', 1, 'par-B', 0, priorityB);

			// A should be paused
			const entryA = currentlyPlayingPriority.main[resultA.currentIndex];
			expect(entryA.player.playing).to.equal(false);
			expect(entryA.behaviour).to.equal(PriorityBehaviour.pause);
			expect(entryA.player.contentPause).to.be.greaterThan(0);
			// B should be playing
			expect(currentlyPlayingPriority.main[resultB.currentIndex].player.playing).to.equal(true);
			// B controls A
			expect(currentlyPlayingPriority.main[resultB.currentIndex].controlledPlaylists).to.deep.equal([resultA.currentIndex]);

			// B finishes (use version expiry to trigger unlock) — A should be unpaused
			await priority.handlePriorityWhenDone(
				mediaB, 'main', resultB.currentIndex, 0, true, 1, 2, {} as PlaylistTriggers,
			);

			const updatedA = currentlyPlayingPriority.main[resultA.currentIndex];
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
			expect(currentlyPlayingPriority.main[resultA.currentIndex].player.playing).to.equal(true);

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
			expect(resultB).to.not.equal(undefined);
			expect(currentlyPlayingPriority.main[resultB!.currentIndex].player.playing).to.equal(true);
		});
	});

	describe('never lifecycle', () => {
		it('should block lower-priority content with never rule until higher finishes', async () => {
			// A registers and plays (priority 1, lower=never)
			const mediaA = makeMedia('a.mp4');
			const priorityA = makePriorityObject({ priorityLevel: 1, lower: PriorityRule.never });
			const resultA = await priority.priorityBehaviour(mediaA, 'video1', 1, 'par-A', 0, priorityA);
			expect(currentlyPlayingPriority.main[resultA.currentIndex].player.playing).to.equal(true);

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
			expect(resultB).to.not.equal(undefined);
			expect(currentlyPlayingPriority.main[resultB!.currentIndex].player.playing).to.equal(true);
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

			expect(currentlyPlayingPriority.main[resultA.currentIndex].player.playing).to.equal(false);
		});
	});

	describe('successor hold lifecycle', () => {
		it('single-seq campaign: slot stays claimed across passes and releases after the last pass', async () => {
			const media = makeMedia('campaign.jpg');
			const level1 = makePriorityObject({ priorityLevel: 1 });
			// pass 1 registers and plays
			const pass1 = await priority.priorityBehaviour(media, 'img1', 1, 'seq-C', 1, level1);
			priority.stateManager.clearSuccessor('main', pass1.currentIndex); // "ready to play"
			// pass 2 re-registers while pass 1 is on screen (traverser lookahead)
			await priority.priorityBehaviour(media, 'img1', 1, 'seq-C', 1, level1);
			// pass 1 finishes (repeatCount 1, last element)
			await priority.handlePriorityWhenDone(
				media, 'main', pass1.currentIndex, 1, true, 1, 1, {} as PlaylistTriggers,
			);
			expect(currentlyPlayingPriority.main[pass1.currentIndex].player.playing).to.equal(true);

			// pass 2 becomes ready, plays, nobody re-registers → its finish releases
			priority.stateManager.clearSuccessor('main', pass1.currentIndex);
			await priority.handlePriorityWhenDone(
				media, 'main', pass1.currentIndex, 1, true, 1, 1, {} as PlaylistTriggers,
			);
			expect(currentlyPlayingPriority.main[pass1.currentIndex].player.playing).to.equal(false);
		});

		it('sibling campaigns in one class: A finishing still wakes the never-blocked B', async () => {
			const level1 = makePriorityObject({ priorityLevel: 1, peer: PriorityRule.never });
			const mediaA = makeMedia('a.jpg');
			const resultA = await priority.priorityBehaviour(mediaA, 'img1', 1, 'seq-A', 1, level1);
			priority.stateManager.clearSuccessor('main', resultA.currentIndex);

			// B (different parent, same level) registers and parks in the never-wait
			const mediaB = makeMedia('b.jpg');
			let bReleased = false;
			const pendingB = priority
				.priorityBehaviour(mediaB, 'img2', 1, 'seq-B', 1, level1)
				.then((r) => {
					bReleased = true;
					return r;
				});
			await new Promise((r) => setImmediate(r));
			expect(bReleased).to.equal(false);

			// A finishes: A's own registration was consumed, no successor → release → B wakes
			await priority.handlePriorityWhenDone(
				mediaA, 'main', resultA.currentIndex, 1, true, 1, 1, {} as PlaylistTriggers,
			);
			const resultB = await pendingB;
			expect(currentlyPlayingPriority.main[resultA.currentIndex].player.playing).to.equal(false);
			expect(currentlyPlayingPriority.main[resultB.currentIndex].player.playing).to.equal(true);
		});

		it('multi-element seq: successor flag survives a parent-match advance, releases after last pass', async () => {
			const level1 = makePriorityObject({ priorityLevel: 1 });
			const mediaA = makeMedia('a.mp4');
			const mediaB = makeMedia('b.mp4');

			// A registers and plays
			const resultA = await priority.priorityBehaviour(mediaA, 'img1', 1, 'seq-M', 1, level1);
			priority.stateManager.clearSuccessor('main', resultA.currentIndex); // "ready to play"

			// B advances the seq (same parent 'seq-M', different media) while A is on screen
			// → parent match, same slot, successor flag set from A's playing state
			const resultB = await priority.priorityBehaviour(mediaB, 'img2', 1, 'seq-M', 1, level1);
			expect(resultB.currentIndex).to.equal(resultA.currentIndex);

			// A's completion signal arrives, but A isn't the last element of the seq → no-op
			await priority.handlePriorityWhenDone(
				mediaA, 'main', resultA.currentIndex, 1, false, 1, 1, {} as PlaylistTriggers,
			);
			expect(currentlyPlayingPriority.main[resultA.currentIndex].player.playing).to.equal(true);

			// B becomes ready to play, consuming its own successor claim
			priority.stateManager.clearSuccessor('main', resultA.currentIndex);

			// B finishes the last pass with no successor registered → releases
			await priority.handlePriorityWhenDone(
				mediaB, 'main', resultA.currentIndex, 1, true, 1, 1, {} as PlaylistTriggers,
			);
			expect(currentlyPlayingPriority.main[resultA.currentIndex].player.playing).to.equal(false);
		});
	});
});
