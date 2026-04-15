import * as chai from 'chai';
import { waitForWsQuiescence } from '../../../test-runner/sync/syncAssertions';

const expect = chai.expect;

/**
 * Unit coverage for `waitForWsQuiescence` — the helper replaces fixed
 * `waitForTimeout(500)` sleeps in sync tests with an adaptive wait keyed to
 * the actual WebSocket frame stream on each device.
 *
 * The helper polls `wsFrames.length` across a set of sources. Tests here use
 * plain objects typed as the helper's minimum contract (a `wsFrames` array);
 * real callers pass `SyncDevice[]`, whose `wsFrames` is a `WsFrame[]` buffer.
 */
describe('waitForWsQuiescence', () => {
	it('returns after quietMs once all sources stop growing', async () => {
		const a = { wsFrames: [] as unknown[] };
		const b = { wsFrames: [] as unknown[] };

		const startedAt = Date.now();
		await waitForWsQuiescence([a, b], { quietMs: 100, maxWaitMs: 1000, pollMs: 20 });
		const elapsed = Date.now() - startedAt;

		expect(elapsed).to.be.at.least(100);
		expect(elapsed).to.be.below(500);
	});

	it('restarts the quiet window when a frame arrives on any source', async () => {
		const a = { wsFrames: [] as unknown[] };
		const b = { wsFrames: [] as unknown[] };

		// Push a frame BEFORE the quietMs window would close, so the helper is
		// forced to observe it and reset. quietMs=200 and frame at 80 ms: the
		// helper would have returned at ~200 ms without interference; with the
		// frame, it must wait a further 200 ms after the frame lands (~280 ms).
		setTimeout(() => b.wsFrames.push({}), 80);

		const startedAt = Date.now();
		await waitForWsQuiescence([a, b], { quietMs: 200, maxWaitMs: 1000, pollMs: 20 });
		const elapsed = Date.now() - startedAt;

		expect(elapsed).to.be.at.least(260);
	});

	it('throws if frames keep arriving past maxWaitMs', async () => {
		const src = { wsFrames: [] as unknown[] };
		const interval = setInterval(() => src.wsFrames.push({}), 40);

		let threw: Error | null = null;
		try {
			await waitForWsQuiescence([src], { quietMs: 200, maxWaitMs: 400, pollMs: 20 });
		} catch (e) {
			threw = e as Error;
		} finally {
			clearInterval(interval);
		}

		expect(threw).to.not.be.null;
		expect(threw!.message).to.match(/did not settle/i);
	});

	it('accepts an empty sources array (returns after quietMs)', async () => {
		const startedAt = Date.now();
		await waitForWsQuiescence([], { quietMs: 80, maxWaitMs: 500, pollMs: 20 });
		const elapsed = Date.now() - startedAt;
		expect(elapsed).to.be.at.least(80);
		expect(elapsed).to.be.below(400);
	});
});
