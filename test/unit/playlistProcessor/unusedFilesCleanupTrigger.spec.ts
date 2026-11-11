import { noopLog } from '@signageos/smil-logger';
import * as chai from 'chai';
import { TestablePlaylistProcessor, createMockSos, createDefaultOptions, createMockFiles, createMockTriggers } from './testUtils';
import { TimedDebugger } from '../../../src/components/playlist/playlistProcessor/TimedDebugger';

const expect = chai.expect;

const REGION = { regionName: 'main', left: 0, top: 0, width: 1920, height: 1080 };

/**
 * A processor in the state right after a content update was prepared: version 0 is still
 * playing a video in `main`, version 1 exists, and `checkFilesLoop` is false (update pending).
 * `order` records when the old video is stopped and when the deferred cleanup is started.
 */
function processorWithPendingUpdate() {
	const order: string[] = [];
	const sos = createMockSos();
	(sos.video.stop as any).callsFake(() => {
		order.push('stop');
	});
	const files = createMockFiles();
	files.runPendingUnusedFilesCleanup = () => order.push('cleanup');
	const processor = new TestablePlaylistProcessor(sos, files, createDefaultOptions(), noopLog, {
		triggers: createMockTriggers(),
	});
	processor.disableLoop(false); // version 0
	processor.disableLoop(false); // version 1
	processor.setCheckFilesLoop(false);
	processor.getCurrentlyPlaying().main = {
		media: 'video',
		playing: true,
		src: 'http://example.com/old.mp4',
		localFilePath: 'smil/videos/old.mp4',
		regionInfo: REGION,
	} as any;
	return { processor, order };
}

const cancellationArgs = (version: number) => ({
	element: { src: 'http://example.com/new.mp4' },
	regionInfo: REGION,
	parentRegion: REGION,
	version,
	timedDebug: new TimedDebugger('test', noopLog),
});

describe('unused files cleanup is started when the previous playlist version is cancelled', () => {
	describe('processVersionUpdate (primary cancel site)', () => {
		it('starts the cleanup after the previous content was stopped', async () => {
			const { processor, order } = processorWithPendingUpdate();

			expect(await (processor as any).processVersionUpdate(1)).to.equal(true);

			expect(order).to.deep.equal(['stop', 'cleanup']);
			expect(processor.getPlaylistVersion()).to.equal(1);
		});

		it('does not start it when no content update is pending', async () => {
			const { processor, order } = processorWithPendingUpdate();
			processor.setCheckFilesLoop(true);

			expect(await (processor as any).processVersionUpdate(1)).to.equal(false);

			expect(order).to.deep.equal([]);
		});

		it('does not start it for an element of the version that is already current', async () => {
			const { processor, order } = processorWithPendingUpdate();

			expect(await (processor as any).processVersionUpdate(0)).to.equal(false);

			expect(order).to.deep.equal([]);
		});

		it('starts it only once per update', async () => {
			const { processor, order } = processorWithPendingUpdate();

			await (processor as any).processVersionUpdate(1);
			await (processor as any).processVersionUpdate(1);

			expect(order.filter((step) => step === 'cleanup')).to.have.length(1);
		});
	});

	describe('checkRegionsForCancellation (fallback cancel site)', () => {
		it('starts the cleanup after the previous content was stopped', async () => {
			const { processor, order } = processorWithPendingUpdate();

			await (processor as any).checkRegionsForCancellation(cancellationArgs(1));

			expect(order).to.deep.equal(['stop', 'cleanup']);
			expect(processor.getPlaylistVersion()).to.equal(1);
		});

		it('does not start it when no content update is pending', async () => {
			const { processor, order } = processorWithPendingUpdate();
			processor.setCheckFilesLoop(true);

			await (processor as any).checkRegionsForCancellation(cancellationArgs(1));

			expect(order).to.not.include('cleanup');
		});
	});
});
