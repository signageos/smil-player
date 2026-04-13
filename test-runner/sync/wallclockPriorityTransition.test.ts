import { test } from '../fixtures';
import { expect } from '@playwright/test';
import { createSyncGroup, cleanupSyncGroup, uniqueGroupName, SyncDevice } from '../syncHelpers';
import {
	waitForMasterElection,
	waitForSyncIndexAgreement,
	getLatestSyncIndex,
	countSyncEvents,
} from './syncAssertions';

// Group D regression test for bug 8ef7571 — 60-second slave delay on
// wallclock-triggered priority transitions.
//
// Fixture shape: flat single-level <excl> with two <priorityClass>. P_high
// (landscape2) is already active at SMIL fetch and its wallclock end at +45s
// triggers the cross-priority cmd-prepare for P_low (landscape1). P_low is
// always active, so it takes over cleanly.
//
// Pre-fix, the slave's cmd-play / cmd-finish wait loop misread master's
// cross-priority cmd-prepare as a priority change, triggered a spurious
// RESYNC and stalled ~60s before following master. The fix adds
// hasPriorityChanged() plus cross-command priority detection in both the
// stored-message path and the live-listener path (SMILElementController.ts
// ~line 454..1040); slaves ACK the new prepare immediately and move on.
//
// Assertion: all 3 devices keep their current syncIndex in lockstep
// (spread <= 1) across the +45s boundary. A stalled slave would fall
// multiple syncIndex values behind master; the spread would explode.

const SYNC_SPREAD_MAX = 1;
const SAMPLES = 15;
const SAMPLE_GAP_MS = 4_000;

test.describe.configure({ mode: 'serial' });
test.describe('sync · wallclock-triggered priority transition [8ef7571]', () => {
	let devices: SyncDevice[] = [];

	test.afterEach(async () => {
		await cleanupSyncGroup(devices);
		devices = [];
	});

	test('3 devices stay on matching syncIndex across the P_high → P_low wallclock boundary', async ({
		browser,
		testServerBaseUrl,
	}, testInfo) => {
		devices = await createSyncGroup(browser, {
			smilUrl: `${testServerBaseUrl}/dynamic/wallclockPriorityTransition.smil`,
			groupName: uniqueGroupName(testInfo.title),
			deviceCount: 3,
		});

		await waitForMasterElection(devices, 60_000);

		// Initial convergence under P_high (landscape2). Generous timeout for
		// first-load + prefetch + first sync round on 3 devices.
		const start = await waitForSyncIndexAgreement(devices, { timeoutMs: 120_000 });
		// eslint-disable-next-line no-console
		console.log(`[wallclock-priority] initial agreement: syncIndex=${start.syncIndex}`);

		// Snapshot every 4s for ~60s. P_high's end-wallclock fires at +45s from
		// fetch, so the sampled window covers: pre-transition (P_high playing),
		// the transition itself, and post-transition (P_low playing).
		const snapshots: Array<{ t: number; values: Array<number | null>; spread: number | null }> = [];
		for (let i = 0; i < SAMPLES; i++) {
			await devices[0].page.waitForTimeout(SAMPLE_GAP_MS);
			const values = devices.map((d) => getLatestSyncIndex(d));
			const known = values.filter((v): v is number => v !== null);
			const spread = known.length === devices.length ? Math.max(...known) - Math.min(...known) : null;
			snapshots.push({ t: (i + 1) * SAMPLE_GAP_MS, values, spread });
		}

		// eslint-disable-next-line no-console
		console.log(
			'[wallclock-priority] snapshots:\n' +
				snapshots
					.map((s) => `  +${s.t}ms values=${JSON.stringify(s.values)} spread=${s.spread}`)
					.join('\n'),
		);

		// Every snapshot must have a known syncIndex on every device.
		for (const s of snapshots) {
			expect(s.spread, `a device never reported a syncIndex by +${s.t}ms`).not.toBeNull();
		}

		// Persistent divergence is the 8ef7571 regression signature.
		const divergent = snapshots.filter((s) => (s.spread as number) > SYNC_SPREAD_MAX);
		expect(
			divergent.length,
			`${divergent.length}/${snapshots.length} snapshots had spread > ${SYNC_SPREAD_MAX} ` +
				`(${divergent.map((s) => `+${s.t}ms=${s.spread}`).join(', ')})`,
		).toBe(0);

		// Player must have advanced past the initial syncIndex — proves it did
		// not freeze, and in particular that the transition past the wallclock
		// boundary actually happened.
		const peak = Math.max(
			...snapshots.flatMap((s) => s.values.filter((v): v is number => v !== null)),
		);
		expect(peak, 'syncIndex never advanced — player froze through transition').toBeGreaterThan(
			start.syncIndex,
		);

		// Belt-and-braces: no cmd-prepare with undefined priority should ever
		// appear (that is the shape that 54f1a10 / 8ef7571 guard against).
		for (const dev of devices) {
			expect(
				countSyncEvents(dev, /priority(?:Level)?\s*[:=]\s*undefined/i),
				`dev ${dev.deviceId} saw a cmd-prepare with undefined priority`,
			).toBe(0);
		}
	});
});
