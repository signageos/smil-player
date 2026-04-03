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
		synchronization: { syncingInAction: false, movingForward: false } as any,
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
		stateManager = new PriorityStateManager(state, promiseAwaiting);
		sideEffects = makeMockSideEffects();
		const conflictResolver = new PriorityConflictResolver(
			stateManager,
			sideEffects,
			{ syncingInAction: false, movingForward: false },
			() => cancelFunction[cancelFunction.length - 1],
			() => undefined,
		);
		priority = new PlaylistPriority(
			makeOptions({ cancelFunction, currentlyPlayingPriority: state, promiseAwaiting }),
			undefined,
			{ stateManager, sideEffects, conflictResolver },
		);
		mockTriggers = { dynamicPlaylist: {} };
	});

	describe('handlePriorityWhenDone', () => {
		it('should increment timesPlayed for non-trigger element with matching isFirstInPlaylist', async () => {
			const media = makeMedia('video.mp4');
			state['main'] = [makeRegion({
				media,
				isFirstInPlaylist: media,
				player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0, playingCompletionDeferred: undefined },
			})];
			stateManager.setPlaying('main', 0);

			await priority.handlePriorityWhenDone(media, 'main', 0, 3, false, 1, 1, mockTriggers);
			expect(state['main'][0].player.timesPlayed).to.equal(1);
		});

		it('should NOT increment timesPlayed for trigger element', async () => {
			const media = { ...makeMedia('video.mp4'), triggerValue: 'sensor1' } as SMILMedia;
			state['main'] = [makeRegion({
				media,
				isFirstInPlaylist: media,
				player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0, playingCompletionDeferred: undefined },
			})];
			stateManager.setPlaying('main', 0);

			await priority.handlePriorityWhenDone(media, 'main', 0, 3, false, 1, 1, mockTriggers);
			expect(state['main'][0].player.timesPlayed).to.equal(0);
		});

		it('should NOT unlock playlist when conditions are not met', async () => {
			const media = makeMedia('video.mp4');
			state['main'] = [makeRegion({
				media,
				isFirstInPlaylist: media,
				player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0, playingCompletionDeferred: undefined },
			})];
			stateManager.setPlaying('main', 0);

			// endTime=0 (indefinite), isLast=false, same version, not cancelled
			await priority.handlePriorityWhenDone(media, 'main', 0, 0, false, 1, 1, mockTriggers);
			expect(state['main'][0].player.playing).to.be.true;
		});

		it('should unlock playlist when isLast and repeatCount expired', async () => {
			const media = makeMedia('video.mp4');
			state['main'] = [makeRegion({
				media,
				isFirstInPlaylist: media,
				player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 2, playingCompletionDeferred: undefined },
			})];
			stateManager.setPlaying('main', 0);

			// endTime=3 (repeat count), timesPlayed will be 3 after increment, isLast=true
			await priority.handlePriorityWhenDone(media, 'main', 0, 3, true, 1, 1, mockTriggers);
			expect(state['main'][0].player.playing).to.be.false;
			expect(state['main'][0].player.timesPlayed).to.equal(0); // reset by markFinished
		});

		it('should unlock playlist when smilFileUpdated', async () => {
			const media = makeMedia('video.mp4');
			state['main'] = [makeRegion({
				media,
				isFirstInPlaylist: media,
				player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0, playingCompletionDeferred: undefined },
			})];
			stateManager.setPlaying('main', 0);
			cancelFunction[0] = true; // simulate SMIL file update

			await priority.handlePriorityWhenDone(media, 'main', 0, 0, false, 1, 1, mockTriggers);
			expect(state['main'][0].player.playing).to.be.false;
		});

		it('should unlock playlist when version expired', async () => {
			const media = makeMedia('video.mp4');
			state['main'] = [makeRegion({
				media,
				isFirstInPlaylist: media,
				player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0, playingCompletionDeferred: undefined },
			})];
			stateManager.setPlaying('main', 0);

			// version=1 < currentVersion=2 → expired
			await priority.handlePriorityWhenDone(media, 'main', 0, 0, false, 1, 2, mockTriggers);
			expect(state['main'][0].player.playing).to.be.false;
		});

		it('should unpause controlled playlist on finish', async () => {
			const media = makeMedia('video.mp4');
			state['main'] = [
				makeRegion({
					media: makeMedia('lower.mp4'),
					player: { contentPause: PAUSE_CONTENT_VALUE, stop: false, endTime: 0, playing: false, timesPlayed: 0, playingCompletionDeferred: undefined },
				}),
				makeRegion({
					media,
					isFirstInPlaylist: media,
					controlledPlaylist: 0, // controls entry 0
					player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0, playingCompletionDeferred: undefined },
				}),
			];
			stateManager.setPlaying('main', 1);
			cancelFunction[0] = true; // force finish

			await priority.handlePriorityWhenDone(media, 'main', 1, 0, false, 1, 1, mockTriggers);
			expect(state['main'][1].player.playing).to.be.false;
			expect(state['main'][0].player.contentPause).to.equal(0); // unpaused
		});

		it('should call cancelDynamicPlaylist for dynamic content with non-default priority', async () => {
			let cancelCalled = false;
			sideEffects.cancelDynamicPlaylist = async () => { cancelCalled = true; };

			const media = { ...makeMedia('video.mp4'), dynamicValue: 'dyn1' } as SMILMedia;
			state['main'] = [makeRegion({
				media,
				isFirstInPlaylist: media,
				priority: makePriorityObject({ priorityLevel: 2 }),
				player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0, playingCompletionDeferred: undefined },
			})];
			stateManager.setPlaying('main', 0);
			cancelFunction[0] = true; // force finish

			await priority.handlePriorityWhenDone(media, 'main', 0, 0, false, 1, 1, mockTriggers);
			expect(cancelCalled).to.be.true;
		});

		it('should NOT call cancelDynamicPlaylist for default priority level 1000', async () => {
			let cancelCalled = false;
			sideEffects.cancelDynamicPlaylist = async () => { cancelCalled = true; };

			const media = { ...makeMedia('video.mp4'), dynamicValue: 'dyn1' } as SMILMedia;
			state['main'] = [makeRegion({
				media,
				isFirstInPlaylist: media,
				priority: makePriorityObject({ priorityLevel: 1000 }),
				player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0, playingCompletionDeferred: undefined },
			})];
			stateManager.setPlaying('main', 0);
			cancelFunction[0] = true; // force finish

			await priority.handlePriorityWhenDone(media, 'main', 0, 0, false, 1, 1, mockTriggers);
			expect(cancelCalled).to.be.false;
		});
	});
});
