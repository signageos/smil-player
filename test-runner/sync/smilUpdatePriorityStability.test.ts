import { test } from '../fixtures';
import { expect } from '@playwright/test';
import { createSyncGroup, cleanupSyncGroup, uniqueGroupName, SyncDevice } from '../syncHelpers';
import {
	waitForMasterElection,
	waitForSyncIndexAgreement,
	getLatestSyncIndex,
	countSyncEvents,
} from './syncAssertions';

// Group E regression test for bug 54f1a10 — false priority-change detection
// on SMIL update.
//
// The fixture serves a constant SMIL body on every GET. The
// /dynamic-refresh/:fileName endpoint rotates Last-Modified in 10s wall-clock
// buckets so all 3 devices see the same L-M at any instant and refresh in
// lockstep — unlike /dynamic-update/ which is GET-count based and hands
// different content to each device.
//
// Signal: syncIndex rather than DOM locators. All three devices must keep
// their currently-reported syncIndex in lockstep (spread ≤ 1 at every
// snapshot) for the whole run. Pre-fix, the first cmd-prepare after a
// reload carried priorityLevel=undefined; slaves' hasPriorityChanged treated
// that as a priority transition, triggered a spurious RESYNC, and stalled
// on a stale syncIndex. That stall shows up here as a snapshot where one
// device's syncIndex diverges from the others by more than 1.

const SYNC_SPREAD_MAX = 1; // allow at most one device mid-transition
const SAMPLES = 12;
const SAMPLE_GAP_MS = 4_000;

test.describe.configure({ mode: 'serial' });
test.describe('sync · SMIL update priority stability [54f1a10]', () => {
	let devices: SyncDevice[] = [];

	test.afterEach(async () => {
		await cleanupSyncGroup(devices);
		devices = [];
	});

	test('3 devices stay on matching syncIndex across Last-Modified-driven refreshes', async ({
		browser,
		testServerBaseUrl,
	}, testInfo) => {
		devices = await createSyncGroup(browser, {
			smilUrl: `${testServerBaseUrl}/dynamic-refresh/smilUpdateStability.smil`,
			groupName: uniqueGroupName(testInfo.title),
			deviceCount: 3,
		});

		await waitForMasterElection(devices, 60_000);

		// Initial agreement establishes the starting syncIndex. Generous timeout
		// for first-load + prefetch + first sync round across 3 devices.
		const start = await waitForSyncIndexAgreement(devices, { timeoutMs: 120_000 });
		// eslint-disable-next-line no-console
		console.log(`[smil-update-stability] initial agreement: syncIndex=${start.syncIndex}`);

		// Snapshot each device's currently-reported syncIndex every SAMPLE_GAP_MS.
		// Across SAMPLES, spans ~48s — covers 3+ refresh buckets (server
		// REFRESH_BUCKET_MS=10_000, REFRESH_STOP_AFTER_MS=30_000) plus stable
		// tail.
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
			'[smil-update-stability] snapshots:\n' +
				snapshots
					.map((s) => `  +${s.t}ms values=${JSON.stringify(s.values)} spread=${s.spread}`)
					.join('\n'),
		);

		// All devices must have reported at least one syncIndex by every snapshot.
		for (const s of snapshots) {
			expect(s.spread, `dev never reported a syncIndex by +${s.t}ms`).not.toBeNull();
		}

		// Every snapshot's spread must be within tolerance. A persistent
		// divergence is exactly the 54f1a10 symptom.
		const divergent = snapshots.filter((s) => (s.spread as number) > SYNC_SPREAD_MAX);
		expect(
			divergent.length,
			`${divergent.length}/${snapshots.length} snapshots had spread > ${SYNC_SPREAD_MAX} ` +
				`(${divergent.map((s) => `+${s.t}ms=${s.spread}`).join(', ')})`,
		).toBe(0);

		// Player must have advanced past the initial syncIndex at some point,
		// proving it kept playing across the refresh. Track highest observed
		// index across all snapshots.
		const peak = Math.max(
			...snapshots.flatMap((s) => s.values.filter((v): v is number => v !== null)),
		);
		expect(peak, 'syncIndex never advanced past initial — player froze through refresh').toBeGreaterThan(
			start.syncIndex,
		);

		// Pre-fix marker: post-refresh cmd-prepare carried undefined priority.
		// A regression would re-introduce log lines matching this pattern.
		for (const dev of devices) {
			expect(
				countSyncEvents(dev, /priority(?:Level)?\s*[:=]\s*undefined/i),
				`dev ${dev.deviceId} broadcast a cmd-prepare with undefined priority`,
			).toBe(0);
		}
	});
});
