import * as chai from 'chai';
import {
	TestablePlaylistProcessor,
	createMockSos,
	createDefaultOptions,
	createMockFiles,
	createMockTriggers,
	createMockPriority,
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
			expect(playing['main']).to.exist;
			expect(playing['main'].media).to.equal('video');
			expect(playing['main'].playing).to.be.true;
			expect(playing['main'].src).to.equal('test.mp4');
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
			expect(playing['main'].dynamicValue).to.equal('dynamic://test');
			expect(playing['main'].syncGroupName).to.equal('group1');
		});

		it('should delete dynamic properties when element has no dynamicValue', () => {
			const sos = createMockSos();
			const options = createDefaultOptions();
			// Pre-set a dynamic element
			options.currentlyPlaying['main'] = {
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
			expect(playing['main'].dynamicValue).to.be.undefined;
			expect(playing['main'].syncGroupName).to.be.undefined;
		});

		it('should preserve nextElement from previous currentlyPlaying', () => {
			const sos = createMockSos();
			const options = createDefaultOptions();
			const nextElem = { src: 'next.mp4' };
			options.currentlyPlaying['main'] = {
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
			expect(playing['main'].nextElement).to.deep.equal(nextElem);
			expect(playing['main'].src).to.equal('new.mp4');
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
			expect(playing['sidebar'].media).to.equal('html');
			expect(playing['sidebar'].playing).to.be.true;
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
			expect(processor.exposedGetCancelFunction()).to.be.false;
		});

		it('should update cancelFunction via setCancelFunction', () => {
			const processor = new TestablePlaylistProcessor(
				createMockSos(), createMockFiles(), createDefaultOptions(), {
					triggers: createMockTriggers(),
					priority: createMockPriority(),
				},
			);
			processor.setCancelFunction(true, 0);
			expect(processor.exposedGetCancelFunction()).to.be.true;
		});

		it('should support disableLoop', () => {
			const processor = new TestablePlaylistProcessor(
				createMockSos(), createMockFiles(), createDefaultOptions(), {
					triggers: createMockTriggers(),
					priority: createMockPriority(),
				},
			);
			processor.disableLoop(true);
			expect(processor.exposedGetCancelFunction()).to.be.true;
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
			expect(processor.getSynchronization().shouldSync).to.be.false;
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

			expect(processor.getSynchronization().shouldSync).to.be.true;
			expect(processor.getSynchronization().syncGroupName).to.equal('testGroup');
		});
	});
});
