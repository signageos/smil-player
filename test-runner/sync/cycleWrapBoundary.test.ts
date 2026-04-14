import { test, expect } from '../fixtures';
import { createSyncGroup, cleanupSyncGroup, uniqueGroupName, SyncDevice } from '../syncHelpers';
import {
	waitForMasterElection,
	waitForConvergence,
	assertSynchronizedTransition,
	assertFrameCountSymmetry,
	assertSyncMessageInventory,
	assertBroadcastReceiptSpread,
	assertFrameContentEquality,
	countSyncEvents,
} from './syncAssertions';
import { recordSkew } from '../../tools/record-sync-skew.mjs';

// Per-cycle cmd-prepare clear-event bound. dde1c2f's guard restricts
// cycle-wrap detection to state === 'prepared'; pre-fix, a finish(N) after
// prepare(N+1) would trigger spurious wrap cleanup mid-cycle. The current
// Group C skew assertions only catch regressions through their downstream
// effect (transitions eventually drift past 500 ms). This direct count
// bounds at ≤ 1 clear per wrap × 3 cycles = 3 clears per device; an
// over-count means finish-after-prepare is triggering spurious cleanup.
//
// Log sentinel: SyncGroup.ts:138 `debug('[syncGroup] cleared sync-coordination:
// group=%s, key=%s', ...)` with key = `sync-coord-cmd-prepare-<region>`.
// Playwright's msg.text() on a debug(...) call preserves the format string;
// the key (containing "cmd-prepare") appears later in the line as the %s arg.
const CMD_PREPARE_CLEAR_RE = /cleared sync-coordination.*cmd-prepare/;
const MAX_CMD_PREPARE_CLEARS_PER_3_CYCLES = 3;

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
				const offsets = skew.timestamps.map((t) => t - skew.minTs);
				measured.push({ cycle: c, label: step.label, skewMs: skew.skewMs, offsets });
				recordSkew({
					test: testInfo.title,
					label: `cycle ${c} ${step.label}`,
					skewMs: skew.skewMs,
					offsets,
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

		// Let the last broadcast settle across receivers before inspecting WS state.
		await devices[0].page.waitForTimeout(500);
		assertFrameCountSymmetry(devices);
		assertSyncMessageInventory(devices);
		assertBroadcastReceiptSpread(devices);
		assertFrameContentEquality(devices);

		// dde1c2f direct sensor: at most one cmd-prepare clear per cycle wrap.
		// The test runs 3 cycles → ≤ 3 clears per device. An over-count means
		// finish-after-prepare is triggering spurious cleanup mid-cycle.
		// Only slaves clear cmd-prepare in their local state (the master is
		// the producer, not a receiver), so 0 on the master is expected;
		// we require at least one slave to have a positive count so the
		// assertion isn't silently vacuous if the log sentinel shifts.
		const clearCounts = devices.map((d) => countSyncEvents(d, CMD_PREPARE_CLEAR_RE));
		// eslint-disable-next-line no-console
		console.log(`[cycle-wrap] cmd-prepare clears per device: [${clearCounts.join(', ')}]`);
		expect(
			Math.max(...clearCounts),
			`cmd-prepare clears per device: [${clearCounts.join(', ')}], max exceeds ${MAX_CMD_PREPARE_CLEARS_PER_3_CYCLES} (dde1c2f watchdog)`,
		).toBeLessThanOrEqual(MAX_CMD_PREPARE_CLEARS_PER_3_CYCLES);
		expect(
			Math.max(...clearCounts),
			`no device reported any cmd-prepare clears — regex drifted from the actual log format (expected 2–3 per slave across 3 cycles)`,
		).toBeGreaterThan(0);
	});
});
