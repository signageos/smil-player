import { test } from '../fixtures';
import { createSyncGroup, cleanupSyncGroup, uniqueGroupName, SyncDevice } from '../syncHelpers';
import {
	waitForMasterElection,
	waitForConvergence,
	assertSynchronizedTransition,
} from './syncAssertions';

// Group C regression test for cycle-wrap boundary bugs.
//
// The fixture is a 3-element seq (landscape1 → landscape2 → video) with
// indefinite repeat. Running it through 3+ full cycles exercises the cycle
// wrap — transitions where the slave's syncIndex jumps back from the end of
// the cycle to the beginning of the next.
//
//  - 7cda9a4: pre-fix, the first cycle's wraparound detection used a
//    fallback to slaveMaxSyncIndex while it was still growing, producing
//    false wraparound detections. If this regresses, cycle 1 wraps will
//    falsely trigger resync and the next transition times out.
//  - a517e8d: pre-fix, cmd-prepare for the new cycle's first element was
//    unconditionally cleared on wrap, deleting fresh messages. Slaves
//    would then wait indefinitely for a cmd-prepare that was never re-sent.
//  - dde1c2f: pre-fix, wrap detection fired whenever syncIndex went
//    backward, even on a finish(N) after prepare(N+1) mid-cycle (not an
//    actual wrap). That fired spurious cleanups mid-cycle.
//
// All three share the same failure symptom under the skew test: spurious
// resync → transition times out OR drifts past 500ms.

test.describe.configure({ mode: 'serial' });
test.describe('sync · cycle-wrap boundary [7cda9a4, a517e8d, dde1c2f]', () => {
	let devices: SyncDevice[] = [];

	test.afterEach(async () => {
		await cleanupSyncGroup(devices);
		devices = [];
	});

	test('3 devices survive 3 full cycle wraps with <500ms skew per transition', async ({
		browser,
		testServerBaseUrl,
	}, testInfo) => {
		devices = await createSyncGroup(browser, {
			smilUrl: `${testServerBaseUrl}/syncFiles/cycleWrapBoundary.smil`,
			groupName: uniqueGroupName(testInfo.title),
			deviceCount: 3,
		});

		await waitForMasterElection(devices, 60_000);

		const video = (p: SyncDevice['page']) => p.locator('video[src*="video-test_465b7757"]');
		const l1 = (p: SyncDevice['page']) =>
			p.frameLocator('iframe').locator('img[src*="landscape1"]');
		const l2 = (p: SyncDevice['page']) =>
			p.frameLocator('iframe').locator('img[src*="landscape2"]');

		// Cycle 1: initial convergence on landscape1.
		await waitForConvergence(devices, l1, 120_000);

		type Step = { label: string; hide: typeof l1; next: typeof l1; timeoutMs: number };
		const cycle: Step[] = [
			{ label: 'l1→l2', hide: l1, next: l2, timeoutMs: 15_000 },
			{ label: 'l2→video', hide: l2, next: video, timeoutMs: 15_000 },
			// Wrap: video→l1 is where 7cda9a4 / a517e8d / dde1c2f bite.
			{ label: 'video→l1 (WRAP)', hide: video, next: l1, timeoutMs: 30_000 },
		];

		const measured: Array<{ cycle: number; label: string; skewMs: number; offsets: number[] }> = [];
		// Run 3 full cycles through the seq. Each cycle has 3 transitions.
		for (let c = 1; c <= 3; c++) {
			for (const step of cycle) {
				await Promise.all(
					devices.map((d) => step.hide(d.page).first().waitFor({ state: 'hidden', timeout: step.timeoutMs })),
				);
				const skew = await assertSynchronizedTransition(devices, step.next, {
					label: `cycle ${c} ${step.label}`,
					timeoutMs: step.timeoutMs,
				});
				measured.push({
					cycle: c,
					label: step.label,
					skewMs: skew.skewMs,
					offsets: skew.timestamps.map((t) => t - skew.minTs),
				});
			}
		}

		// eslint-disable-next-line no-console
		console.log(
			'[cycle-wrap] per-transition skew:\n' +
				measured
					.map((m) => `  cycle ${m.cycle} ${m.label}: ${m.skewMs}ms offsets=[${m.offsets.join(', ')}]`)
					.join('\n'),
		);
	});
});
