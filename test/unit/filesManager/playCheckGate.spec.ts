// Provide browser globals needed by @signageos/front-applet module at import time
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { JSDOM } = require('jsdom');
if (typeof (global as any).window === 'undefined') {
	const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
	(global as any).window = dom.window;
	(global as any).document = dom.window.document;
	(global as any).navigator = dom.window.navigator;
	(global as any).HTMLElement = dom.window.HTMLElement;
}

import { expect } from 'chai';
import { FilesManager } from '../../../src/components/files/filesManager';
import { ISos } from '../../../src/models/sosModels';
import { SMILFileObject } from '../../../src/models/filesModels';
import { SMILImage } from '../../../src/models/mediaModels';

function makeGatedImage(overrides: Partial<SMILImage> = {}): SMILImage {
	return {
		src: 'https://cdn.example.com/image.png',
		playCheckUrl: 'https://api.example.com/gate/image',
		...overrides,
	} as unknown as SMILImage;
}

function makeSmilObject(skipPlaybackOnHttpStatus: number[] | undefined): SMILFileObject {
	return {
		skipPlaybackOnHttpStatus,
		refresh: { timeOut: 2000 },
	} as unknown as SMILFileObject;
}

/** FilesManager with its private XHR primitive stubbed; records calls. */
function makeFilesManager(xhr: { status?: number; reject?: boolean }) {
	const fm = new FilesManager({} as unknown as ISos);
	const calls: any[][] = [];
	(fm as any).makeXhrRequest = async (...args: any[]) => {
		calls.push(args);
		if (xhr.reject) {
			throw new Error('network down');
		}
		return { status: xhr.status ?? 200 };
	};
	return { fm, calls };
}

describe('components/files/filesManager - playCheckGate', () => {
	it('skips when the gate answers a listed status', async () => {
		const { fm, calls } = makeFilesManager({ status: 404 });
		const result = await fm.playCheckGate(makeGatedImage(), makeSmilObject([404]));
		expect(result).to.be.equal(true);
		expect(calls.length).to.be.equal(1);
		expect(calls[0][0]).to.be.equal('GET');
		// gate URL gets the cache-buster appended, base URL must be preserved
		expect(calls[0][1]).to.contain('https://api.example.com/gate/image');
	});

	it('plays on an unlisted status (including 5xx)', async () => {
		const { fm } = makeFilesManager({ status: 500 });
		const result = await fm.playCheckGate(makeGatedImage(), makeSmilObject([404]));
		expect(result).to.be.equal(false);
	});

	it('fails open on transport error', async () => {
		const { fm } = makeFilesManager({ reject: true });
		const result = await fm.playCheckGate(makeGatedImage(), makeSmilObject([404]));
		expect(result).to.be.equal(false);
	});

	it('is inert without playCheckUrl - no request made', async () => {
		const { fm, calls } = makeFilesManager({ status: 404 });
		const result = await fm.playCheckGate(makeGatedImage({ playCheckUrl: undefined }), makeSmilObject([404]));
		expect(result).to.be.equal(false);
		expect(calls.length).to.be.equal(0);
	});

	it('is inert when skipPlaybackOnHttpStatus meta is empty - no request, warn-once flag set', async () => {
		const { fm, calls } = makeFilesManager({ status: 404 });
		const result = await fm.playCheckGate(makeGatedImage(), makeSmilObject([]));
		expect(result).to.be.equal(false);
		expect(calls.length).to.be.equal(0);
		expect((fm as any).playCheckGateMissingMetaWarned).to.be.equal(true);
	});

	it('skips on transport error when playCheckSkipOnError is true', async () => {
		const { fm } = makeFilesManager({ reject: true });
		const result = await fm.playCheckGate(makeGatedImage({ playCheckSkipOnError: true }), makeSmilObject([404]));
		expect(result).to.be.equal(true);
	});

	it('skips on unlisted 5xx when playCheckSkipOnError is true', async () => {
		const { fm } = makeFilesManager({ status: 503 });
		const result = await fm.playCheckGate(makeGatedImage({ playCheckSkipOnError: true }), makeSmilObject([404]));
		expect(result).to.be.equal(true);
	});

	it('still fails open on transport error when playCheckSkipOnError is absent or false', async () => {
		const { fm } = makeFilesManager({ reject: true });
		expect(await fm.playCheckGate(makeGatedImage(), makeSmilObject([404]))).to.be.equal(false);
		expect(
			await fm.playCheckGate(makeGatedImage({ playCheckSkipOnError: false }), makeSmilObject([404])),
		).to.be.equal(false);
	});

	it('playCheckSkipOnError has no effect without playCheckUrl - no request, plays', async () => {
		const { fm, calls } = makeFilesManager({ reject: true });
		const result = await fm.playCheckGate(
			makeGatedImage({ playCheckUrl: undefined, playCheckSkipOnError: true }),
			makeSmilObject([404]),
		);
		expect(result).to.be.equal(false);
		expect(calls.length).to.be.equal(0);
	});

	it('playCheckSkipOnError has no effect when the meta is missing - gate stays inert', async () => {
		const { fm, calls } = makeFilesManager({ reject: true });
		const result = await fm.playCheckGate(makeGatedImage({ playCheckSkipOnError: true }), makeSmilObject([]));
		expect(result).to.be.equal(false);
		expect(calls.length).to.be.equal(0);
	});

	it('is inert when skipPlaybackOnHttpStatus meta is absent (undefined) - no request', async () => {
		const { fm, calls } = makeFilesManager({ status: 404 });
		const result = await fm.playCheckGate(makeGatedImage(), makeSmilObject(undefined));
		expect(result).to.be.equal(false);
		expect(calls.length).to.be.equal(0);
	});
});
