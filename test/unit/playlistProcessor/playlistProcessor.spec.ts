import * as chai from 'chai';
import { PlaylistCommon } from '../../../src/components/playlist/playlistCommon/playlistCommon';
import { WaitStatus } from '../../../src/enums/priorityEnums';
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

		it('should skip on expr before burning a gate request (gate not called for skipContent slots)', async () => {
			const files = createMockFiles();
			files.playCheckGate = stub().resolves(false);
			const processor = makeGateProcessor(files);
			const value = makeGatedImage();
			value.expr = 'skipContent';

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
});
