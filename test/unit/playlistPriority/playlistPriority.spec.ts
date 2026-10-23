import { noopLog } from '../../../src/logger';
import * as chai from 'chai';
import { PlaylistPriority } from '../../../src/components/playlist/playlistPriority/playlistPriority';
import { PriorityStateManager } from '../../../src/components/playlist/playlistPriority/priorityStateManager';
import { PriorityConflictResolver } from '../../../src/components/playlist/playlistPriority/priorityConflictResolver';
import { CurrentlyPlayingPriority, PlaylistOptions, PromiseAwaiting } from '../../../src/models/playlistModels';
import { PAUSE_CONTENT_VALUE } from '../../../src/enums/priorityEnums';
import { SMILMedia } from '../../../src/models/mediaModels';
import { makePriorityObject, makeMedia, makeRegion, makeMockSideEffects } from './testHelpers';

const expect = chai.expect;

function makeOptions(overrides: Partial<PlaylistOptions> = {}): PlaylistOptions {
	return {
		cancelFunction: [false],
		currentlyPlaying: {},
		currentlyPlayingPriority: {},
		promiseAwaiting: {},
		synchronization: { syncingInAction: false } as any,
		videoPreparing: {} as any,
		...overrides,
	} as PlaylistOptions;
}

describe('PlaylistPriority', () => {
	let state: CurrentlyPlayingPriority;
	let promiseAwaiting: PromiseAwaiting;
	let stateManager: PriorityStateManager;
	let sideEffects: ReturnType<typeof makeMockSideEffects>;
	let priority: PlaylistPriority;
	let cancelFunction: boolean[];
	let mockTriggers: any;

	beforeEach(() => {
		state = {};
		promiseAwaiting = {};
		cancelFunction = [false];
		stateManager = new PriorityStateManager(state, promiseAwaiting, noopLog);
		sideEffects = makeMockSideEffects();
		const conflictResolver = new PriorityConflictResolver(
			stateManager,
			sideEffects,
			{ syncingInAction: false },
			() => cancelFunction[cancelFunction.length - 1],
			() => undefined,
			noopLog,
		);
		priority = new PlaylistPriority(
			makeOptions({ cancelFunction, currentlyPlayingPriority: state, promiseAwaiting }),
			undefined,
			noopLog,
			{ stateManager, sideEffects, conflictResolver },
		);
		mockTriggers = { dynamicPlaylist: {} };
	});

	describe('handlePriorityWhenDone', () => {
		it('should increment timesPlayed for non-trigger element with matching isFirstInPlaylist', async () => {
			const media = makeMedia('video.mp4');
			state.main = [makeRegion({
				media,
				isFirstInPlaylist: media,
				player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0, playingCompletionDeferred: undefined },
			})];
			stateManager.setPlaying('main', 0);

			await priority.handlePriorityWhenDone(media, 'main', 0, 3, false, 1, 1, mockTriggers);
			expect(state.main[0].player.timesPlayed).to.equal(1);
		});

		it('should NOT increment timesPlayed for trigger element', async () => {
			const media = { ...makeMedia('video.mp4'), triggerValue: 'sensor1' } as SMILMedia;
			state.main = [makeRegion({
				media,
				isFirstInPlaylist: media,
				player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0, playingCompletionDeferred: undefined },
			})];
			stateManager.setPlaying('main', 0);

			await priority.handlePriorityWhenDone(media, 'main', 0, 3, false, 1, 1, mockTriggers);
			expect(state.main[0].player.timesPlayed).to.equal(0);
		});

		it('should NOT unlock playlist when conditions are not met', async () => {
			const media = makeMedia('video.mp4');
			state.main = [makeRegion({
				media,
				isFirstInPlaylist: media,
				player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0, playingCompletionDeferred: undefined },
			})];
			stateManager.setPlaying('main', 0);

			// endTime=0 (indefinite), isLast=false, same version, not cancelled
			await priority.handlePriorityWhenDone(media, 'main', 0, 0, false, 1, 1, mockTriggers);
			expect(state.main[0].player.playing).to.equal(true);
		});

		it('should unlock playlist when isLast and repeatCount expired', async () => {
			const media = makeMedia('video.mp4');
			state.main = [makeRegion({
				media,
				isFirstInPlaylist: media,
				player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 2, playingCompletionDeferred: undefined },
			})];
			stateManager.setPlaying('main', 0);

			// endTime=3 (repeat count), timesPlayed will be 3 after increment, isLast=true
			await priority.handlePriorityWhenDone(media, 'main', 0, 3, true, 1, 1, mockTriggers);
			expect(state.main[0].player.playing).to.equal(false);
			expect(state.main[0].player.timesPlayed).to.equal(0); // reset by markFinished
		});

		it('should unlock playlist when smilFileUpdated', async () => {
			const media = makeMedia('video.mp4');
			state.main = [makeRegion({
				media,
				isFirstInPlaylist: media,
				player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0, playingCompletionDeferred: undefined },
			})];
			stateManager.setPlaying('main', 0);
			cancelFunction[0] = true; // simulate SMIL file update

			await priority.handlePriorityWhenDone(media, 'main', 0, 0, false, 1, 1, mockTriggers);
			expect(state.main[0].player.playing).to.equal(false);
		});

		it('should unlock playlist when version expired', async () => {
			const media = makeMedia('video.mp4');
			state.main = [makeRegion({
				media,
				isFirstInPlaylist: media,
				player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0, playingCompletionDeferred: undefined },
			})];
			stateManager.setPlaying('main', 0);

			// version=1 < currentVersion=2 → expired
			await priority.handlePriorityWhenDone(media, 'main', 0, 0, false, 1, 2, mockTriggers);
			expect(state.main[0].player.playing).to.equal(false);
		});

		it('should unpause controlled playlist on finish', async () => {
			const media = makeMedia('video.mp4');
			state.main = [
				makeRegion({
					media: makeMedia('lower.mp4'),
					player: {
						contentPause: PAUSE_CONTENT_VALUE,
						stop: false,
						endTime: 0,
						playing: false,
						timesPlayed: 0,
						playingCompletionDeferred: undefined,
					},
				}),
				makeRegion({
					media,
					isFirstInPlaylist: media,
					controlledPlaylists: [0], // controls entry 0
					player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0, playingCompletionDeferred: undefined },
				}),
			];
			stateManager.setPlaying('main', 1);
			cancelFunction[0] = true; // force finish

			await priority.handlePriorityWhenDone(media, 'main', 1, 0, false, 1, 1, mockTriggers);
			expect(state.main[1].player.playing).to.equal(false);
			expect(state.main[0].player.contentPause).to.equal(0); // unpaused
		});

		it('should call cancelDynamicPlaylist for dynamic content with non-default priority', async () => {
			let cancelCalled = false;
			sideEffects.cancelDynamicPlaylist = async () => { cancelCalled = true; };

			const media = { ...makeMedia('video.mp4'), dynamicValue: 'dyn1' } as SMILMedia;
			state.main = [makeRegion({
				media,
				isFirstInPlaylist: media,
				priority: makePriorityObject({ priorityLevel: 2 }),
				player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0, playingCompletionDeferred: undefined },
			})];
			stateManager.setPlaying('main', 0);
			cancelFunction[0] = true; // force finish

			await priority.handlePriorityWhenDone(media, 'main', 0, 0, false, 1, 1, mockTriggers);
			expect(cancelCalled).to.equal(true);
		});

		it('should NOT call cancelDynamicPlaylist for default priority level 1000', async () => {
			let cancelCalled = false;
			sideEffects.cancelDynamicPlaylist = async () => { cancelCalled = true; };

			const media = { ...makeMedia('video.mp4'), dynamicValue: 'dyn1' } as SMILMedia;
			state.main = [makeRegion({
				media,
				isFirstInPlaylist: media,
				priority: makePriorityObject({ priorityLevel: 1000 }),
				player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0, playingCompletionDeferred: undefined },
			})];
			stateManager.setPlaying('main', 0);
			cancelFunction[0] = true; // force finish

			await priority.handlePriorityWhenDone(media, 'main', 0, 0, false, 1, 1, mockTriggers);
			expect(cancelCalled).to.equal(false);
		});
	});

	describe('handlePriorityWhenDone — successor hold between repeatCount passes', () => {
		const finishedPlayer = () => ({
			contentPause: 0,
			stop: false,
			endTime: 1,
			playing: true,
			timesPlayed: 0,
			playingCompletionDeferred: undefined,
		});

		function seedCampaign(successorRegistered: boolean, controlledPlaylists: number[] = [], endTime: number = 1) {
			const media = makeMedia('campaign.jpg');
			state.main = [
				makeRegion({
					media,
					isFirstInPlaylist: media,
					priority: makePriorityObject({ priorityLevel: 1 }),
					controlledPlaylists,
					player: { ...finishedPlayer(), successorRegistered, endTime },
				}),
			];
			stateManager.setPlaying('main', 0);
			stateManager.ensurePromiseAwaiting('main', 1);
			stateManager.updatePriorityTracking('main', 1, 1);
			return media;
		}

		it('keeps the slot and the level claim when the next pass already re-registered it', async () => {
			const media = seedCampaign(true);
			// endTime=1 (repeatCount 1) + isLast → this pass is "finished"
			await priority.handlePriorityWhenDone(media, 'main', 0, 1, true, 1, 1, mockTriggers);
			expect(state.main[0].player.playing).to.equal(true);
			expect(state.main[0].player.timesPlayed).to.equal(0);
			expect(state.main[0].player.successorRegistered).to.equal(false);
			expect(promiseAwaiting.main.highestProcessingPriority).to.equal(1);
		});

		it('releases the slot and the level claim when no successor registered (last pass)', async () => {
			const media = seedCampaign(false);
			await priority.handlePriorityWhenDone(media, 'main', 0, 1, true, 1, 1, mockTriggers);
			expect(state.main[0].player.playing).to.equal(false);
			expect(promiseAwaiting.main.highestProcessingPriority).to.equal(-1);
		});

		it('releases despite a successor when the version expired (SMIL update path)', async () => {
			const media = seedCampaign(true);
			await priority.handlePriorityWhenDone(media, 'main', 0, 1, true, 1, 2, mockTriggers);
			expect(state.main[0].player.playing).to.equal(false);
			expect(promiseAwaiting.main.highestProcessingPriority).to.equal(-1);
		});

		it('keeps pause victims paused while holding for the successor (no wallclock stamp needed)', async () => {
			state.main = [];
			const media = seedCampaign(true, [1]);
			state.main.push(
				makeRegion({
					media: makeMedia('lower.mp4'),
					parent: 'seq-lower',
					player: {
						contentPause: PAUSE_CONTENT_VALUE,
						stop: false,
						endTime: 1,
						playing: false,
						timesPlayed: 0,
						playingCompletionDeferred: undefined,
					},
				}),
			);
			await priority.handlePriorityWhenDone(media, 'main', 0, 1, true, 1, 1, mockTriggers);
			expect(state.main[1].player.contentPause).to.equal(PAUSE_CONTENT_VALUE);
			expect(state.main[0].controlledPlaylists).to.deep.equal([1]);
		});

		it('releases despite a successor when the wallclock window has closed (endTimeExpired)', async () => {
			state.main = [];
			const media = seedCampaign(true, [1], Date.now() - 1_000);
			state.main.push(
				makeRegion({
					media: makeMedia('lower.mp4'),
					parent: 'seq-lower',
					player: {
						contentPause: PAUSE_CONTENT_VALUE,
						stop: false,
						endTime: 1,
						playing: false,
						timesPlayed: 0,
						playingCompletionDeferred: undefined,
					},
				}),
			);
			await priority.handlePriorityWhenDone(media, 'main', 0, 1, true, 1, 1, mockTriggers);
			expect(state.main[0].player.playing).to.equal(false);
			expect(promiseAwaiting.main.highestProcessingPriority).to.equal(-1);
			expect(state.main[1].player.contentPause).to.equal(0);
			expect(state.main[0].controlledPlaylists).to.deep.equal([]);
		});
	});

	// Future-begin priority bug: a higher class's wallclock campaign
	// (seq repeatCount="1" begin/end) finishes a pass every N seconds while its
	// window is still open and immediately replays. The per-pass finish must NOT
	// release the cross-priority pause mid-window, or the paused lower class
	// wakes between passes and races the replay (flicker + sync stalls).
	describe('activeWindowEnd cross-priority unpause hold', () => {
		function seedPausedVictimsWithController(activeWindowEnd: number | undefined, victimCount: number = 1) {
			const media = makeMedia('higher.mp4');
			const victims = Array.from({ length: victimCount }, (_, i) =>
				makeRegion({
					media: makeMedia(`lower-${i}.mp4`),
					player: {
						contentPause: PAUSE_CONTENT_VALUE,
						stop: false,
						endTime: 1,
						playing: false,
						timesPlayed: 0,
						playingCompletionDeferred: undefined,
					},
				}),
			);
			state.main = [
				...victims,
				makeRegion({
					media,
					isFirstInPlaylist: media,
					controlledPlaylists: victims.map((_, i) => i),
					priority: makePriorityObject({ priorityLevel: 1, activeWindowEnd }),
					// timesPlayed=0; endTime=1 (repeat count) → after increment
					// repeatCountExpired && isLast → playlist "finished" per pass
					player: {
						contentPause: 0,
						stop: false,
						endTime: 1,
						playing: true,
						timesPlayed: 0,
						playingCompletionDeferred: undefined,
					},
				}),
			];
			stateManager.setPlaying('main', victimCount);
			return { media, controllerIndex: victimCount };
		}

		it('holds the unpause while the controller class window is still open', async () => {
			const { media, controllerIndex } = seedPausedVictimsWithController(Date.now() + 60_000);

			await priority.handlePriorityWhenDone(media, 'main', controllerIndex, 1, true, 1, 1, mockTriggers);

			// pass itself is finished (sibling handover unaffected)
			expect(state.main[controllerIndex].player.playing).to.equal(false);
			// but the victim stays paused mid-window
			expect(state.main[0].player.contentPause).to.equal(PAUSE_CONTENT_VALUE);
			// and the controller keeps the victim list for the eventual release
			expect(state.main[controllerIndex].controlledPlaylists).to.deep.equal([0]);
		});

		it('unpauses when the controller class window has closed', async () => {
			const { media, controllerIndex } = seedPausedVictimsWithController(Date.now() - 1_000);

			await priority.handlePriorityWhenDone(media, 'main', controllerIndex, 1, true, 1, 1, mockTriggers);

			expect(state.main[0].player.contentPause).to.equal(0);
			expect(state.main[controllerIndex].controlledPlaylists).to.deep.equal([]);
		});

		it('releases EVERY paused victim accumulated during the window, not just the last', async () => {
			const { media, controllerIndex } = seedPausedVictimsWithController(Date.now() - 1_000, 2);

			await priority.handlePriorityWhenDone(media, 'main', controllerIndex, 1, true, 1, 1, mockTriggers);

			expect(state.main[0].player.contentPause).to.equal(0);
			expect(state.main[1].player.contentPause).to.equal(0);
			expect(state.main[controllerIndex].controlledPlaylists).to.deep.equal([]);
		});

		it('unpauses when no window was ever stamped', async () => {
			const { media, controllerIndex } = seedPausedVictimsWithController(undefined);

			await priority.handlePriorityWhenDone(media, 'main', controllerIndex, 1, true, 1, 1, mockTriggers);

			expect(state.main[0].player.contentPause).to.equal(0);
		});

		it('unpauses on SMIL file update even with an open window', async () => {
			const { media, controllerIndex } = seedPausedVictimsWithController(Date.now() + 60_000);
			cancelFunction[0] = true;

			await priority.handlePriorityWhenDone(media, 'main', controllerIndex, 1, true, 1, 1, mockTriggers);

			expect(state.main[0].player.contentPause).to.equal(0);
		});

		it('unpauses on expired version even with an open window', async () => {
			const { media, controllerIndex } = seedPausedVictimsWithController(Date.now() + 60_000);

			// version=1 < currentVersion=2
			await priority.handlePriorityWhenDone(media, 'main', controllerIndex, 1, true, 1, 2, mockTriggers);

			expect(state.main[0].player.contentPause).to.equal(0);
		});
	});
});
