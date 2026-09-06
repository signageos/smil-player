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

// Mirrors smilPlayer.main(): every playlist iteration pushes a fresh `false` onto
// cancelFunction, so after one SMIL refresh the array is [v0, v1] and v1 is current.
function processorWithTwoVersions(): TestablePlaylistProcessor {
	const processor = new TestablePlaylistProcessor(createMockSos(), createMockFiles(), createDefaultOptions(), {
		triggers: createMockTriggers(),
		priority: createMockPriority(),
	});
	processor.disableLoop(false); // version 0
	processor.disableLoop(false); // version 1 (current)
	return processor;
}

describe('waitTimeoutOrFileUpdate', () => {
	it('is NOT aborted by a cancel aimed at an older playlist version', async () => {
		const processor = processorWithTwoVersions();
		const start = Date.now();
		const wait = processor.exposedWaitTimeoutOrFileUpdate(200, 1);
		setTimeout(() => processor.setCancelFunction(true, 0), 50); // retire v0 (processVersionUpdate)
		const fileUpdated = await wait;
		const elapsed = Date.now() - start;
		expect(fileUpdated, `wait returned "file updated" after ${elapsed}ms`).to.equal(false);
		expect(elapsed).to.be.at.least(190);
	});

	it('survives an older-version cancel and is still aborted by a later cancel of its own version', async () => {
		const processor = processorWithTwoVersions();
		const start = Date.now();
		const wait = processor.exposedWaitTimeoutOrFileUpdate(1000, 1);
		setTimeout(() => processor.setCancelFunction(true, 0), 30);
		setTimeout(() => processor.setCancelFunction(true, 1), 100);
		expect(await wait).to.equal(true);
		const elapsed = Date.now() - start;
		expect(elapsed).to.be.at.least(95);
		expect(elapsed).to.be.below(500);
	});

	it('IS aborted by a cancel of the current playlist version', async () => {
		const processor = processorWithTwoVersions();
		const start = Date.now();
		const wait = processor.exposedWaitTimeoutOrFileUpdate(200, 1);
		setTimeout(() => processor.setCancelFunction(true, 1), 50);
		const fileUpdated = await wait;
		expect(fileUpdated).to.equal(true);
		expect(Date.now() - start).to.be.below(150);
	});
});
