import * as chai from 'chai';
import { PlaylistCommon } from '../../../src/components/playlist/playlistCommon/playlistCommon';
import { WaitStatus } from '../../../src/enums/priorityEnums';
import { PAUSE_CONTENT_VALUE } from '../../../src/enums/priorityEnums';
import {
	TestablePlaylistProcessor,
	createMockSos,
	createDefaultOptions,
	createMockFiles,
	createMockTriggers,
	createMockPriority,
	stub,
} from './testUtils';

const expect = chai.expect;

describe('PlaylistProcessor', () => {
	describe('constructor', () => {
		it('should construct with mock sos and injected overrides', () => {
			const sos = createMockSos();
			const files = createMockFiles();
			const options = createDefaultOptions();
			const triggers = createMockTriggers();
			const priority = createMockPriority();

			const processor = new TestablePlaylistProcessor(sos, files, options, {
				triggers,
				priority,
			});

			expect(processor).to.be.an.instanceOf(TestablePlaylistProcessor);
		});

		it('should read playerName and playerId from sos.config', () => {
			const sos = createMockSos();
			sos.config.playerName = 'myPlayer';
			sos.config.playerId = 'myId';
			const files = createMockFiles();
			const options = createDefaultOptions();

			const processor = new TestablePlaylistProcessor(sos, files, options, {
				triggers: createMockTriggers(),
				priority: createMockPriority(),
			});

			// playerName and playerId are private but we can test via getPlaylistVersion/setCancelFunction
			// which proves the constructor ran successfully
			expect(processor.getPlaylistVersion()).to.equal(0);
		});
	});

	describe('setCurrentlyPlaying', () => {
		it('should set basic playing info for a video element', () => {
			const sos = createMockSos();
			const options = createDefaultOptions();
			const processor = new TestablePlaylistProcessor(sos, createMockFiles(), options, {
				triggers: createMockTriggers(),
				priority: createMockPriority(),
			});

			const element = {
				src: 'test.mp4',
				regionInfo: { regionName: 'main', left: 0, top: 0, width: 100, height: 100 },
			} as any;

			processor.exposedSetCurrentlyPlaying(element, 'video', 'main');

			const playing = processor.getCurrentlyPlaying();
			expect(playing.main).to.not.equal(undefined);
			expect(playing.main.media).to.equal('video');
			expect(playing.main.playing).to.equal(true);
			expect(playing.main.src).to.equal('test.mp4');
		});

		it('should set dynamic value when element has dynamicValue', () => {
			const sos = createMockSos();
			const options = createDefaultOptions();
			const processor = new TestablePlaylistProcessor(sos, createMockFiles(), options, {
				triggers: createMockTriggers(),
				priority: createMockPriority(),
			});

			const element = {
				src: 'dynamic.mp4',
				regionInfo: { regionName: 'main', left: 0, top: 0, width: 100, height: 100 },
				dynamicValue: 'dynamic://test',
				syncGroupName: 'group1',
			} as any;

			processor.exposedSetCurrentlyPlaying(element, 'video', 'main');

			const playing = processor.getCurrentlyPlaying();
			expect(playing.main.dynamicValue).to.equal('dynamic://test');
			expect(playing.main.syncGroupName).to.equal('group1');
		});

		it('should delete dynamic properties when element has no dynamicValue', () => {
			const sos = createMockSos();
			const options = createDefaultOptions();
			// Pre-set a dynamic element
			options.currentlyPlaying.main = {
				src: 'old.mp4',
				media: 'video',
				playing: true,
				dynamicValue: 'dynamic://old',
				syncGroupName: 'oldGroup',
			} as any;

			const processor = new TestablePlaylistProcessor(sos, createMockFiles(), options, {
				triggers: createMockTriggers(),
				priority: createMockPriority(),
			});

			const element = {
				src: 'regular.mp4',
				regionInfo: { regionName: 'main', left: 0, top: 0, width: 100, height: 100 },
			} as any;

			processor.exposedSetCurrentlyPlaying(element, 'video', 'main');

			const playing = processor.getCurrentlyPlaying();
			expect(playing.main.dynamicValue).to.equal(undefined);
			expect(playing.main.syncGroupName).to.equal(undefined);
		});

		it('should preserve nextElement from previous currentlyPlaying', () => {
			const sos = createMockSos();
			const options = createDefaultOptions();
			const nextElem = { src: 'next.mp4' };
			options.currentlyPlaying.main = {
				src: 'current.mp4',
				media: 'video',
				playing: true,
				nextElement: nextElem,
			} as any;

			const processor = new TestablePlaylistProcessor(sos, createMockFiles(), options, {
				triggers: createMockTriggers(),
				priority: createMockPriority(),
			});

			const element = {
				src: 'new.mp4',
				regionInfo: { regionName: 'main', left: 0, top: 0, width: 100, height: 100 },
			} as any;

			processor.exposedSetCurrentlyPlaying(element, 'video', 'main');

			const playing = processor.getCurrentlyPlaying();
			expect(playing.main.nextElement).to.deep.equal(nextElem);
			expect(playing.main.src).to.equal('new.mp4');
		});

		it('should work for html tag (img)', () => {
			const sos = createMockSos();
			const options = createDefaultOptions();
			const processor = new TestablePlaylistProcessor(sos, createMockFiles(), options, {
				triggers: createMockTriggers(),
				priority: createMockPriority(),
			});

			const element = {
				src: 'image.jpg',
				regionInfo: { regionName: 'sidebar', left: 0, top: 0, width: 200, height: 200 },
			} as any;

			processor.exposedSetCurrentlyPlaying(element, 'html', 'sidebar');

			const playing = processor.getCurrentlyPlaying();
			expect(playing.sidebar.media).to.equal('html');
			expect(playing.sidebar.playing).to.equal(true);
		});
	});

	describe('playlist version management', () => {
		it('should start with version 0', () => {
			const processor = new TestablePlaylistProcessor(
				createMockSos(), createMockFiles(), createDefaultOptions(), {
					triggers: createMockTriggers(),
					priority: createMockPriority(),
				},
			);
			expect(processor.getPlaylistVersion()).to.equal(0);
		});

		it('should update version via setPlaylistVersion', () => {
			const processor = new TestablePlaylistProcessor(
				createMockSos(), createMockFiles(), createDefaultOptions(), {
					triggers: createMockTriggers(),
					priority: createMockPriority(),
				},
			);
			processor.setPlaylistVersion(5);
			expect(processor.getPlaylistVersion()).to.equal(5);
		});
	});

	describe('cancel function management', () => {
		it('should start with cancelFunction as false', () => {
			const processor = new TestablePlaylistProcessor(
				createMockSos(), createMockFiles(), createDefaultOptions(), {
					triggers: createMockTriggers(),
					priority: createMockPriority(),
				},
			);
			expect(processor.exposedGetCancelFunction()).to.equal(false);
		});

		it('should update cancelFunction via setCancelFunction', () => {
			const processor = new TestablePlaylistProcessor(
				createMockSos(), createMockFiles(), createDefaultOptions(), {
					triggers: createMockTriggers(),
					priority: createMockPriority(),
				},
			);
			processor.setCancelFunction(true, 0);
			expect(processor.exposedGetCancelFunction()).to.equal(true);
		});

		it('should support disableLoop', () => {
			const processor = new TestablePlaylistProcessor(
				createMockSos(), createMockFiles(), createDefaultOptions(), {
					triggers: createMockTriggers(),
					priority: createMockPriority(),
				},
			);
			processor.disableLoop(true);
			expect(processor.exposedGetCancelFunction()).to.equal(true);
		});
	});

	describe('synchronization state', () => {
		it('should have sync disabled by default', () => {
			const processor = new TestablePlaylistProcessor(
				createMockSos(), createMockFiles(), createDefaultOptions(), {
					triggers: createMockTriggers(),
					priority: createMockPriority(),
				},
			);
			expect(processor.getSynchronization().shouldSync).to.equal(false);
		});

		it('should accept custom synchronization options', () => {
			const options = createDefaultOptions();
			options.synchronization.shouldSync = true;
			options.synchronization.syncGroupName = 'testGroup';

			const processor = new TestablePlaylistProcessor(
				createMockSos(), createMockFiles(), options, {
					triggers: createMockTriggers(),
					priority: createMockPriority(),
				},
			);

			expect(processor.getSynchronization().shouldSync).to.equal(true);
			expect(processor.getSynchronization().syncGroupName).to.equal('testGroup');
		});
	});

	describe('resolveContentAvailability playCheckUrl gate', () => {
		function makeGateProcessor(files: any, smilOverrides: any = {}) {
			const processor = new TestablePlaylistProcessor(createMockSos(), files, createDefaultOptions(), {
				triggers: createMockTriggers(),
				priority: createMockPriority(),
			});
			processor.setSmilObject({
				checkBeforePlay: false,
				checkAheadCount: 0,
				skipPlaybackOnHttpStatus: [404],
				refresh: {
					refreshInterval: 20000,
					smilFileRefresh: 20000,
					timeOut: 2000,
					fallbackToPreviousPlaylist: false,
				},
				...smilOverrides,
			} as any);
			return processor;
		}

		function makeGatedImage(): any {
			return {
				src: 'http://example.com/image.png',
				localFilePath: 'filesystem/images/image.png',
				playCheckUrl: 'http://example.com/gate/image',
				regionInfo: { regionName: 'main' },
			};
		}

		it('should skip the pass (return true) when the gate says skip', async () => {
			const files = createMockFiles();
			files.playCheckGate = stub().resolves(true);
			const processor = makeGateProcessor(files);
			const value = makeGatedImage();

			const result = await (processor as any).resolveContentAvailability(value, 'img0', 'test');

			expect(result).to.equal(true);
			expect(files.playCheckGate.callCount()).to.equal(1);
			expect(files.playCheckGate.calls[0][0]).to.equal(value);
		});

		it('should play (return false) when the gate says play or fails open', async () => {
			const files = createMockFiles();
			files.playCheckGate = stub().resolves(false);
			const processor = makeGateProcessor(files);

			const result = await (processor as any).resolveContentAvailability(makeGatedImage(), 'img0', 'test');

			expect(result).to.equal(false);
			expect(files.playCheckGate.callCount()).to.equal(1);
		});

		it('should never call the gate when playCheckUrl is absent', async () => {
			const files = createMockFiles();
			files.playCheckGate = stub().resolves(true);
			const processor = makeGateProcessor(files);
			const value = makeGatedImage();
			delete value.playCheckUrl;

			const result = await (processor as any).resolveContentAvailability(value, 'img0', 'test');

			expect(result).to.equal(false);
			expect(files.playCheckGate.callCount()).to.equal(0);
		});

		it('should still consult the gate inline when checkAheadCount is set (lookahead never gates)', async () => {
			const files = createMockFiles();
			files.playCheckGate = stub().resolves(true);
			const processor = makeGateProcessor(files, { checkBeforePlay: true, checkAheadCount: 2 });

			const result = await (processor as any).resolveContentAvailability(makeGatedImage(), 'img0', 'test');

			expect(result).to.equal(true);
			expect(files.playCheckGate.callCount()).to.equal(1);
		});

		it('should skip on skipContentMark before burning a gate request (gate not called for skipContent slots)', async () => {
			const files = createMockFiles();
			files.playCheckGate = stub().resolves(false);
			const processor = makeGateProcessor(files);
			const value = makeGatedImage();
			value.skipContentMark = true;

			const result = await (processor as any).resolveContentAvailability(value, 'img0', 'test');

			expect(result).to.equal(true);
			expect(files.playCheckGate.callCount()).to.equal(0);
		});

		it('playElement releases the priority slot when the gate skips (phantom-slot guard)', async () => {
			// priorityBehaviour marks the slot playing BEFORE playElement runs the gate; a
			// gate-skip must releaseSlot or the never-painting element phantom-blocks every
			// peer/lower-priority waiter in the region (the historical "stuck on m3" freeze).
			const files = createMockFiles();
			files.playCheckGate = stub().resolves(true);
			files.getOrCreateMediaInfoFile = stub().resolves({});
			const priority = createMockPriority();
			const releaseCalls: any[][] = [];
			priority.stateManager = {
				releaseSlot: (...args: any[]) => {
					releaseCalls.push(args);
				},
			};
			const processor = new TestablePlaylistProcessor(createMockSos(), files, createDefaultOptions(), {
				triggers: createMockTriggers(),
				priority,
			});
			processor.setSmilObject({
				checkBeforePlay: false,
				checkAheadCount: 0,
				skipPlaybackOnHttpStatus: [404],
				refresh: {
					refreshInterval: 20000,
					smilFileRefresh: 20000,
					timeOut: 2000,
					fallbackToPreviousPlaylist: false,
				},
			} as any);
			const value = makeGatedImage();
			value.useInReportUrl = 'http://example.com/image.png'; // skip mediaInfo init path

			// (value, version, key, parent, currentIndex, previousPlayingIndex, endTime, isLast)
			await (processor as any).playElement(value, 0, 'img0', '0', 3, 0, 0, false);

			expect(files.playCheckGate.callCount()).to.equal(1);
			expect(releaseCalls).to.eql([['main', 3]]);
		});
	});

	describe('shouldWaitAndContinue - dynamic playlist cancel (sync stopped)', () => {
		// regionChangeDeferred is per-instance: the only waiter in production parks on the
		// TRIGGERS instance (handleTriggers -> waitForRegionChange), so the master-side
		// dynamic cancel must wake that instance, not the processor's own deferred.
		it('should wake a waiter parked on the triggers instance regionChangeDeferred', async () => {
			const sos = createMockSos();
			const files = createMockFiles();
			const options = createDefaultOptions();
			options.synchronization.shouldSync = false;
			options.currentlyPlayingPriority = { main: [{ behaviour: 'none' }] } as any;

			// Triggers double with a REAL PlaylistCommon regionChangeDeferred
			class TriggersDouble extends PlaylistCommon {
				public dynamicPlaylist: any = {};
				public handleTriggers: any = stub().resolves(undefined);
				public exposedWaitForRegionChange = () => (this as any).waitForRegionChange();
			}
			const triggers: any = new TriggersDouble(sos, files, options);
			triggers.dynamicPlaylist.dyn1 = {
				play: true,
				isMaster: false,
				regionInfo: { regionName: 'dynamic' },
				parentRegion: 'main',
			};

			const priority = createMockPriority();
			priority.stateManager = {
				ensurePromiseAwaiting: stub(),
				getPromiseAwaiting: () => undefined,
				cancelAllInRegion: stub(),
			};

			const processor = new TestablePlaylistProcessor(sos, files, options, { triggers, priority });

			let triggersWaiterWoken = false;
			triggers.exposedWaitForRegionChange().then(() => {
				triggersWaiterWoken = true;
			});

			const media = { dynamicValue: 'dyn1', src: 'http://test/dynamic.smil' } as any;
			const regionInfo = { regionName: 'dynamic' } as any;
			const timedDebug = { log: () => undefined } as any;

			const result = await (processor as any).shouldWaitAndContinue(
				media, regionInfo, 'main', 0, 0, 0, false, 0, timedDebug, undefined,
			);
			await Promise.resolve(); // flush microtasks so a resolved deferred runs its .then

			expect(result).to.equal(WaitStatus.SKIP);
			expect(triggersWaiterWoken).to.equal(true);
		});
	});

	describe('shouldWaitAndContinue - ready to play claims the slot', () => {
		it('clears the successor flag BEFORE marking the slot playing', async () => {
			const sos = createMockSos();
			const files = createMockFiles();
			const options = createDefaultOptions();
			options.currentlyPlayingPriority = {
				main: [{
					behaviour: 'none',
					player: { contentPause: 0, stop: false, endTime: 1, playing: true, timesPlayed: 0 },
				}],
			} as any;

			const order: string[] = [];
			const priority = createMockPriority();
			priority.stateManager = {
				ensurePromiseAwaiting: stub(),
				getPromiseAwaiting: () => undefined,
				cancelAllInRegion: stub(),
				clearSuccessor: (region: string, index: number) => order.push(`clear:${region}:${index}`),
				setPlaying: (region: string, index: number) => order.push(`play:${region}:${index}`),
			};
			const processor = new TestablePlaylistProcessor(sos, files, options, {
				triggers: createMockTriggers(),
				priority,
			});

			const media = { src: 'img.jpg', regionInfo: { regionName: 'main' } } as any;
			const timedDebug = { log: () => undefined } as any;
			const result = await (processor as any).shouldWaitAndContinue(
				media, media.regionInfo, 'main', 0, 0, 1, true, 0, timedDebug, undefined,
			);

			expect(result).to.equal(WaitStatus.CONTINUE);
			expect(order).to.deep.equal(['clear:main:0', 'play:main:0']);
		});
	});

	describe('handleVideoPlay - own slot paused/stopped while play() was in flight', () => {
		const regionInfo = { regionName: 'main', left: 0, top: 0, width: 10, height: 10 };
		const video = {
			src: 'http://x/a.mp4',
			localFilePath: 'videos/a.mp4',
			regionInfo,
			fullVideoDuration: 200, // bounds the onceEnded race without the 600s backstop timer
		} as any;
		const params = ['videos/a.mp4', 0, 0, 10, 10, 'RTP'];
		const timedDebug = { log: () => undefined } as any;

		function setup(contentPause: number, currentlyPlaying: any) {
			const sos = createMockSos();
			const options = createDefaultOptions();
			options.currentlyPlaying = currentlyPlaying;
			options.currentlyPlayingPriority = {
				main: [{
					behaviour: 'none', version: 0, priority: { priorityLevel: 0 }, controlledPlaylists: [],
					player: { contentPause, stop: false, endTime: 1, playing: true, timesPlayed: 0 },
				}],
			} as any;
			// real PlaylistPriority (no override): handleVideoPlay races on stateManager.waitUntil
			const processor = new TestablePlaylistProcessor(sos, createMockFiles(), options, {
				triggers: createMockTriggers(),
			});
			return { sos, processor };
		}

		it(
			'stops its own video and leaves the region to the higher-priority element that painted meanwhile',
			async () => {
				const { sos, processor } = setup(PAUSE_CONTENT_VALUE, {
					main: { src: 'campaign.jpg', media: 'html', playing: true },
				});
				await processor.exposedHandleVideoPlay(
					video, [...params], sos.video, regionInfo, regionInfo, 0, 0, timedDebug,
				);
				expect((sos.video.play as any).calledOnce()).to.equal(true);
				expect((sos.video.stop as any).calledOnce()).to.equal(true);
				expect(processor.getCurrentlyPlaying().main.src).to.equal('campaign.jpg');
			},
		);

		it('takes the region normally when its slot is untouched', async () => {
			const { sos, processor } = setup(0, {});
			await processor.exposedHandleVideoPlay(
				video, [...params], sos.video, regionInfo, regionInfo, 0, 0, timedDebug,
			);
			expect((sos.video.stop as any).callCount()).to.equal(0);
			expect(processor.getCurrentlyPlaying().main.src).to.equal('http://x/a.mp4');
		});
	});
});
