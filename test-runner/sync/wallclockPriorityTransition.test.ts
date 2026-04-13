import { test } from '../fixtures';
import { expect } from '@playwright/test';
import { createSyncGroup, cleanupSyncGroup, uniqueGroupName, SyncDevice } from '../syncHelpers';
import {
	waitForMasterElection,
	waitForSyncIndexAgreement,
	getLatestSyncIndex,
	getVisibleElement,
	countSyncEvents,
	ElementCandidate,
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

		// Element candidates for the rendered-state half of each snapshot.
		// Both P_high and P_low render images in the iframe; the candidate set
		// is exhaustive for this fixture so a snapshot reporting `null` means
		// nothing visible at all (legitimate during very brief swap moments).
		const candidates: ElementCandidate[] = [
			{ name: 'landscape1', locator: (p) => p.frameLocator('iframe').locator('img[src*="landscape1"]') },
			{ name: 'landscape2', locator: (p) => p.frameLocator('iframe').locator('img[src*="landscape2"]') },
		];

		// Snapshot every 4s for ~60s. Each tick captures the (syncIndex, visibleElement)
		// tuple per device — both axes must hold lockstep for sync to be considered valid.
		// P_high's end-wallclock fires at +45s from fetch.
		type Snapshot = {
			t: number;
			tuples: Array<{ syncIndex: number | null; visible: string | null }>;
			spread: number | null;       // syncIndex max - min
			uniqueTuples: number;        // distinct (syncIndex, visible) tuples across devices
		};
		const snapshots: Snapshot[] = [];
		for (let i = 0; i < SAMPLES; i++) {
			await devices[0].page.waitForTimeout(SAMPLE_GAP_MS);
			const tuples = await Promise.all(
				devices.map(async (d) => ({
					syncIndex: getLatestSyncIndex(d),
					visible: await getVisibleElement(d.page, candidates),
				})),
			);
			const indices = tuples.map((t) => t.syncIndex);
			const known = indices.filter((v): v is number => v !== null);
			const spread = known.length === devices.length ? Math.max(...known) - Math.min(...known) : null;
			const uniqueTuples = new Set(tuples.map((t) => `${t.syncIndex}|${t.visible}`)).size;
			snapshots.push({ t: (i + 1) * SAMPLE_GAP_MS, tuples, spread, uniqueTuples });
		}

		// eslint-disable-next-line no-console
		console.log(
			'[wallclock-priority] snapshots:\n' +
				snapshots
					.map(
						(s) =>
							`  +${s.t}ms syncIndex=${JSON.stringify(s.tuples.map((t) => t.syncIndex))} ` +
							`visible=${JSON.stringify(s.tuples.map((t) => t.visible))} ` +
							`spread=${s.spread} uniqueTuples=${s.uniqueTuples}`,
					)
					.join('\n'),
		);

		// Every snapshot must have a known syncIndex on every device.
		for (const s of snapshots) {
			expect(s.spread, `a device never reported a syncIndex by +${s.t}ms`).not.toBeNull();
		}

		// Persistent syncIndex divergence is the 8ef7571 regression signature.
		const divergent = snapshots.filter((s) => (s.spread as number) > SYNC_SPREAD_MAX);
		expect(
			divergent.length,
			`${divergent.length}/${snapshots.length} snapshots had spread > ${SYNC_SPREAD_MAX} ` +
				`(${divergent.map((s) => `+${s.t}ms=${s.spread}`).join(', ')})`,
		).toBe(0);

		// Combined-state lockstep: at every snapshot, the (syncIndex, visibleElement)
		// tuples across the 3 devices must cluster into at most 2 distinct tuples
		// (1 = perfect lockstep; 2 = at most one device mid-transition). 3 distinct
		// tuples means at least one device's rendered state has drifted from its
		// protocol state in a way that doesn't align with the others.
		const tupleDivergent = snapshots.filter((s) => s.uniqueTuples > 2);
		expect(
			tupleDivergent.length,
			`${tupleDivergent.length}/${snapshots.length} snapshots had >2 unique (syncIndex, visible) tuples ` +
				`(${tupleDivergent.map((s) => `+${s.t}ms`).join(', ')})`,
		).toBe(0);

		// Player must have advanced past the initial syncIndex — proves it did
		// not freeze, and in particular that the transition past the wallclock
		// boundary actually happened.
		const peak = Math.max(
			...snapshots.flatMap((s) => s.tuples.map((t) => t.syncIndex).filter((v): v is number => v !== null)),
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
