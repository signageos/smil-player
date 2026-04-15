import * as chai from 'chai';
import { waitForRatioStable } from '../../../test-runner/sync/syncAssertions';

const expect = chai.expect;

/**
 * Unit coverage for `waitForRatioStable` — generic polling helper that lets
 * sync e2e tests early-exit a fixed observation window once the running
 * ratio has held inside the target band for N consecutive samples.
 *
 * The helper takes a `getRatio: () => number` so tests can mock the ratio
 * source; the real caller passes a closure over `computeAckParityRatio`.
 */
describe('waitForRatioStable', () => {
	it('exits with reason="stable" once the ratio holds in band for stableSamplesNeeded polls', async () => {
		const getRatio = () => 1.0;
		const startedAt = Date.now();
		const result = await waitForRatioStable(getRatio, {
			minObserveMs: 50,
			maxObserveMs: 5_000,
			pollMs: 30,
			stableSamplesNeeded: 3,
			targetMin: 0.95,
			targetMax: 1.05,
		});
		const elapsed = Date.now() - startedAt;

		expect(result.reason).to.equal('stable');
		expect(result.finalRatio).to.equal(1.0);
		// minObserveMs=50, then 3 polls of 30 ms each before stable counter trips.
		expect(elapsed).to.be.at.least(50);
		expect(elapsed).to.be.below(500);
	});

	it('resets the stable counter when ratio drops out of band mid-observation', async () => {
		// Ratio sequence: out for first 2 polls, then in. Stable streak must
		// only count the in-band polls.
		let call = 0;
		const ratios = [0.80, 0.80, 1.00, 1.00, 1.00];
		const getRatio = () => ratios[Math.min(call++, ratios.length - 1)];

		const startedAt = Date.now();
		const result = await waitForRatioStable(getRatio, {
			minObserveMs: 0,
			maxObserveMs: 5_000,
			pollMs: 30,
			stableSamplesNeeded: 3,
			targetMin: 0.95,
			targetMax: 1.05,
		});
		const elapsed = Date.now() - startedAt;

		expect(result.reason).to.equal('stable');
		// 5 ratio reads, 4 sleeps between them: poll → sleep → poll → sleep →
		// poll → sleep → poll → sleep → poll(returns). 4 × 30 ms = 120 ms.
		expect(elapsed).to.be.at.least(120);
	});

	it('returns reason="maxReached" if ratio never stabilizes', async () => {
		// Ratio always out of band.
		const getRatio = () => 0.50;
		const startedAt = Date.now();
		const result = await waitForRatioStable(getRatio, {
			minObserveMs: 30,
			maxObserveMs: 300,
			pollMs: 30,
			stableSamplesNeeded: 3,
			targetMin: 0.95,
			targetMax: 1.05,
		});
		const elapsed = Date.now() - startedAt;

		expect(result.reason).to.equal('maxReached');
		expect(result.finalRatio).to.equal(0.50);
		expect(elapsed).to.be.at.least(300);
	});

	it('honors minObserveMs even when ratio is already in band on first poll', async () => {
		const getRatio = () => 1.0;
		const startedAt = Date.now();
		await waitForRatioStable(getRatio, {
			minObserveMs: 200,
			maxObserveMs: 5_000,
			pollMs: 30,
			stableSamplesNeeded: 1,
			targetMin: 0.95,
			targetMax: 1.05,
		});
		const elapsed = Date.now() - startedAt;

		expect(elapsed).to.be.at.least(200);
	});
});
