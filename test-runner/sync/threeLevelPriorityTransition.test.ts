import { test } from '../fixtures';
import { expect } from '@playwright/test';
import { createSyncGroup, cleanupSyncGroup, uniqueGroupName, SyncDevice } from '../syncHelpers';
import {
	waitForMasterElection,
	waitForSyncIndexAgreement,
	getLatestSyncIndex,
	getVisibleElement,
	ElementCandidate,
} from './syncAssertions';

// Group J: 3-level priority cascade. Group D only tests a single cross-priority
// boundary (P_high → P_low). hasPriorityChanged() compares arbitrary numeric
// levels, so a 3-level chain (P1→P2→P3) exercises cross-priority detection on
// two consecutive boundaries and catches state residue between the first and
// second transition — e.g., stale cmd-prepare metadata, uncleared priority
// bookkeeping, or a resync flag that doesn't get fully cleared after boundary 1.
//
// Fixture: P1 ends at +30s, P2 ends at +60s, P3 always active. 25 × 4s samples
// cover ~100s so P2→P3 at +60s reliably lands inside the window even when
// master election + initial sync agreement is slow (~15s of fetch→sampling lag).
//
// Spread tolerance: 2 (not 1) — during a cross-priority boundary the master
// pre-broadcasts cmd-prepare for the next priority class's first element,
// which bumps its logged syncIndex ahead of the slaves briefly. Observed
// `[3,1,1]` on a stable run at the P1→P2 approach.

const SYNC_SPREAD_MAX = 2;
const SAMPLES = 25;
const SAMPLE_GAP_MS = 4_000;
// Transient divergence budget. During each cross-priority boundary the master
// briefly races ahead of the slaves; a single 4s snapshot can catch that
// intermediate state. With two boundaries in a 100s window we tolerate up to
// 2 divergent snapshots total. A real stall regression (8ef7571 class) would
// keep a slave N syncIndex values behind for many seconds — easily >5 snapshots.
const MAX_DIVERGENT_SNAPSHOTS = 2;

test.describe.configure({ mode: 'serial' });
test.describe('sync · three-level priority transition', () => {
	let devices: SyncDevice[] = [];

	test.afterEach(async () => {
		await cleanupSyncGroup(devices);
		devices = [];
	});

	test('3 devices stay on matching syncIndex across two consecutive priority boundaries', async ({
		browser,
		testServerBaseUrl,
	}, testInfo) => {
		devices = await createSyncGroup(browser, {
			smilUrl: `${testServerBaseUrl}/dynamic/threeLevelPriorityTransition.smil`,
			groupName: uniqueGroupName(testInfo.title),
			deviceCount: 3,
		});
		await waitForMasterElection(devices, 60_000);
		const start = await waitForSyncIndexAgreement(devices, { timeoutMs: 120_000 });
		// eslint-disable-next-line no-console
		console.log(`[3-level-priority] initial agreement: syncIndex=${start.syncIndex}`);

		const candidates: ElementCandidate[] = [
			{ name: 'landscape1', locator: (p) => p.frameLocator('iframe').locator('img[src*="landscape1"]') },
			{ name: 'landscape2', locator: (p) => p.frameLocator('iframe').locator('img[src*="landscape2"]') },
			{ name: 'img_1', locator: (p) => p.frameLocator('iframe').locator('img[src*="img_1"]') },
		];

		type Snapshot = {
			t: number;
			tuples: Array<{ syncIndex: number | null; visible: string | null }>;
			spread: number | null;
			uniqueTuples: number;
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
			const known = tuples.map((t) => t.syncIndex).filter((v): v is number => v !== null);
			const spread = known.length === devices.length ? Math.max(...known) - Math.min(...known) : null;
			const uniqueTuples = new Set(tuples.map((t) => `${t.syncIndex}|${t.visible}`)).size;
			snapshots.push({ t: (i + 1) * SAMPLE_GAP_MS, tuples, spread, uniqueTuples });
		}

		// eslint-disable-next-line no-console
		console.log(
			'[3-level-priority] snapshots:\n' +
				snapshots
					.map(
						(s) =>
							`  +${s.t}ms syncIndex=${JSON.stringify(s.tuples.map((t) => t.syncIndex))} ` +
							`visible=${JSON.stringify(s.tuples.map((t) => t.visible))} ` +
							`spread=${s.spread} uniqueTuples=${s.uniqueTuples}`,
					)
					.join('\n'),
		);

		for (const s of snapshots) {
			expect(s.spread, `a device never reported a syncIndex by +${s.t}ms`).not.toBeNull();
		}

		const divergent = snapshots.filter((s) => (s.spread as number) > SYNC_SPREAD_MAX);
		expect(
			divergent.length,
			`${divergent.length}/${snapshots.length} snapshots had spread > ${SYNC_SPREAD_MAX} ` +
				`(${divergent.map((s) => `+${s.t}ms=${s.spread}`).join(', ')})`,
		).toBeLessThanOrEqual(MAX_DIVERGENT_SNAPSHOTS);

		const tupleDivergent = snapshots.filter((s) => s.uniqueTuples > 2);
		expect(
			tupleDivergent.length,
			`${tupleDivergent.length}/${snapshots.length} snapshots had >2 unique (syncIndex, visible) tuples ` +
				`(${tupleDivergent.map((s) => `+${s.t}ms`).join(', ')})`,
		).toBeLessThanOrEqual(MAX_DIVERGENT_SNAPSHOTS);

		// Full 3-level cascade: syncIndex must advance through BOTH boundaries,
		// reaching start+2 (typically 3). start+1 would mean only P1→P2 fired
		// and the cascade stalled at P2 — the exact state residue regression
		// this fixture is designed to catch.
		const peak = Math.max(
			...snapshots.flatMap((s) =>
				s.tuples.map((t) => t.syncIndex).filter((v): v is number => v !== null),
			),
		);
		expect(
			peak,
			`syncIndex peak=${peak} did not reach start+2 (start=${start.syncIndex}) — P2→P3 boundary never fired within the sampling window`,
		).toBeGreaterThanOrEqual(start.syncIndex + 2);
	});
});
