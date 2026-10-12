import * as chai from 'chai';
if (typeof (global as any).window === 'undefined') {
	const { JSDOM } = require('jsdom');
	const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost' });
	(global as any).window = dom.window;
}
import { createFetchingStrategies } from '../../../src/components/files/fetchingStrategies/fetchingStrategies';
import { noopLog } from '../../../src/logger';
import { SMILEnums } from '../../../src/enums/generalEnums';
import { MergedDownloadList } from '../../../src/models/filesModels';

// Mirrors the global augmentation in filesManager.ts, which ts-node does not
// load when compiling the strategy module standalone for this spec.
declare global {
	interface Window {
		getAuthHeaders?: (url: string) => Record<string, string>;
	}
}

const expect = chai.expect;

const DECLARATIVE_EXPR = "adapi-compare(adapi-weekday(), '1')";

const makeMedia = (): MergedDownloadList =>
	({
		src: 'http://cdn/media_a.mp4',
		expr: DECLARATIVE_EXPR,
		allowLocalFallback: false,
	} as unknown as MergedDownloadList);

const makeResponse = (status: number, headers: { [key: string]: string } = {}) =>
	({
		status,
		url: 'http://cdn/media_a.mp4',
		headers: { get: (key: string) => headers[key.toLowerCase()] ?? null },
	} as unknown as Response);

const { getStrategy } = createFetchingStrategies(noopLog);
const strategy = getStrategy(SMILEnums.lastModified);

describe('fetchingStrategies skipContent marking', () => {
	// The skip mark must live on a dedicated runtime flag, NOT in media.expr:
	// overwriting expr destroys the element's declarative daypart condition
	// (permanently — the recovery path deletes expr) and drifts the parent hash.

	it('skip-code response (404) sets skipContentMark and preserves the declarative expr', async () => {
		const media = makeMedia();
		await strategy(media, 2000, [404], [], async () => makeResponse(404));
		expect((media as any).skipContentMark).to.be.equal(true);
		expect(media.expr).to.be.equal(DECLARATIVE_EXPR);
	});

	it('recovery (200 after mark) clears skipContentMark and keeps the declarative expr', async () => {
		const media = makeMedia();
		await strategy(media, 2000, [404], [], async () => makeResponse(404));
		await strategy(media, 2000, [404], [], async () => makeResponse(200, { 'last-modified': 'Tue, 01 Jan 2030 00:00:00 GMT' }));
		expect((media as any).skipContentMark).to.be.equal(undefined);
		expect(media.expr).to.be.equal(DECLARATIVE_EXPR);
	});

	it('HEAD transport failure with allowLocalFallback=false sets skipContentMark, expr untouched', async () => {
		const media = makeMedia();
		await strategy(media, 2000, [404], [], async () => {
			throw new Error('network down');
		});
		expect((media as any).skipContentMark).to.be.equal(true);
		expect(media.expr).to.be.equal(DECLARATIVE_EXPR);
	});

	it('5xx with allowLocalFallback=false sets skipContentMark, expr untouched', async () => {
		const media = makeMedia();
		await strategy(media, 2000, [404], [], async () => makeResponse(503));
		expect((media as any).skipContentMark).to.be.equal(true);
		expect(media.expr).to.be.equal(DECLARATIVE_EXPR);
	});

	it('5xx with local fallback allowed does NOT set skipContentMark', async () => {
		const media = makeMedia();
		(media as any).allowLocalFallback = undefined;
		await strategy(media, 2000, [404], [], async () => makeResponse(503));
		expect((media as any).skipContentMark).to.be.equal(undefined);
	});
});
