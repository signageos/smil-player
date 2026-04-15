import { test, expect } from '../fixtures';
import { createSyncGroup, cleanupSyncGroup, uniqueGroupName, SyncDevice } from '../syncHelpers';
import {
	waitForMasterElection,
	waitForConvergence,
	waitForWsQuiescence,
	assertSynchronizedTransition,
	assertFrameCountSymmetry,
	assertSyncMessageInventory,
	assertBroadcastReceiptSpread,
	assertFrameContentEquality,
	countSyncEvents,
} from './syncAssertions';
import { recordSkew } from '../../tools/record-sync-skew.mjs';

// Per-transition resync log bound. db8da71's slave infinite-resync-loop
// regression would produce many more wrap/recovery log lines per transition
// than the current healthy ~0–1; the 30 s assertSynchronizedTransition
// timeout below only catches cases that never converge, not ones that
// converge after many extra resync cycles. 5 is generous enough to absorb
// one legitimate wrap plus a couple of protocol housekeeping lines per
// transition; calibrate downward after a reliable green-run baseline.
const RESYNC_LOG_RE = /Wrapping resync target|Master passed resync target|Timeout recovery: setting/;
const MAX_RESYNC_DELTA_PER_TRANSITION = 2;

// Group A regression test for playMode=one coordination bugs.
//
// One comprehensive test runs 2+ full playMode=one cycles (video → landscape1
// → landscape2 → video → ...) and asserts each transition happens within the
// default 500ms skew tolerance across all 3 devices. This catches all three
// shipping regressions by their shared symptom — sync drift:
//
//  - db8da71 — slave infinite resync loop with playMode=one: regression would
//    cause slaves to enter a resync cycle that never completes; the next
//    transition's `waitFor` would time out.
//  - 5a59d20 — stale cmd-playMode from a previous cycle: slaves would select
//    the wrong sibling, showing a different element than master; the skew
//    measurement would explode (or time out).
//  - 9faf699 — syncingInAction leak across playMode phases: slaves would get
//    stuck with the flag set, blocking subsequent transitions; `waitFor`
//    times out.
//
// Kept as one test because the regression signal is identical and splitting
// would multiply runtime with no extra diagnostic value. The test's label
// makes it clear which commits it guards.

test.describe.configure({ mode: 'serial' });
test.describe('sync · playMode=one coordination [db8da71, 5a59d20, 9faf699]', () => {
	let devices: SyncDevice[] = [];

	test.afterEach(async () => {
		await cleanupSyncGroup(devices);
		devices = [];
	});

	test('3 devices advance through 2 playMode=one cycles with <500ms skew per transition', async ({
		browser,
		testServerBaseUrl,
	}, testInfo) => {
		devices = await createSyncGroup(browser, {
			smilUrl: `${testServerBaseUrl}/syncFiles/playModeOneSync.smil`,
			groupName: uniqueGroupName(testInfo.title),
			deviceCount: 3,
		});

		await waitForMasterElection(devices, 60_000);

		const video = (p: SyncDevice['page']) => p.locator('video[src*="video-test_465b7757"]');
		const l1 = (p: SyncDevice['page']) =>
			p.frameLocator('iframe').locator('img[src*="landscape1"]');
		const l2 = (p: SyncDevice['page']) =>
			p.frameLocator('iframe').locator('img[src*="landscape2"]');

		// Cycle 1 — video plays first. Initial convergence (loose, first-load noise).
		await waitForConvergence(devices, video, 120_000);

		// Video → landscape1 (cycle 1 end → cycle 2 start)
		const resyncBefore1 = devices.map((d) => countSyncEvents(d, RESYNC_LOG_RE));
		await Promise.all(
			devices.map((d) => video(d.page).first().waitFor({ state: 'hidden', timeout: 30_000 })),
		);
		const s1 = await assertSynchronizedTransition(devices, l1, {
			label: 'cycle2: video→landscape1',
			timeoutMs: 30_000,
		});
		const deltaResync1 = devices.map((d, i) => countSyncEvents(d, RESYNC_LOG_RE) - resyncBefore1[i]);
		expect(
			Math.max(...deltaResync1),
			`cycle2 resync-log delta=[${deltaResync1}] exceeds ${MAX_RESYNC_DELTA_PER_TRANSITION} (db8da71 watchdog)`,
		).toBeLessThanOrEqual(MAX_RESYNC_DELTA_PER_TRANSITION);
		// eslint-disable-next-line no-console
		console.log(
			`[playMode-sync] video→landscape1 skew=${s1.skewMs}ms offsets=[${s1.timestamps
				.map((t) => t - s1.minTs)
				.join(', ')}]`,
		);
		recordSkew({
			test: testInfo.title,
			label: 'video→landscape1',
			skewMs: s1.skewMs,
			offsets: s1.timestamps.map((t) => t - s1.minTs),
		});

		// landscape1 → landscape2 (cycle 3)
		const resyncBefore2 = devices.map((d) => countSyncEvents(d, RESYNC_LOG_RE));
		await Promise.all(
			devices.map((d) => l1(d.page).first().waitFor({ state: 'hidden', timeout: 15_000 })),
		);
		const s2 = await assertSynchronizedTransition(devices, l2, {
			label: 'cycle3: landscape1→landscape2',
			timeoutMs: 15_000,
		});
		const deltaResync2 = devices.map((d, i) => countSyncEvents(d, RESYNC_LOG_RE) - resyncBefore2[i]);
		expect(
			Math.max(...deltaResync2),
			`cycle3 resync-log delta=[${deltaResync2}] exceeds ${MAX_RESYNC_DELTA_PER_TRANSITION} (db8da71 watchdog)`,
		).toBeLessThanOrEqual(MAX_RESYNC_DELTA_PER_TRANSITION);
		// eslint-disable-next-line no-console
		console.log(
			`[playMode-sync] landscape1→landscape2 skew=${s2.skewMs}ms offsets=[${s2.timestamps
				.map((t) => t - s2.minTs)
				.join(', ')}]`,
		);
		recordSkew({
			test: testInfo.title,
			label: 'landscape1→landscape2',
			skewMs: s2.skewMs,
			offsets: s2.timestamps.map((t) => t - s2.minTs),
		});

		// landscape2 → video (playMode wrap — back to child 0). This is the
		// transition db8da71 makes most likely to fail: a buggy slave would
		// either re-enter resync on the wrap, or pick the wrong sibling.
		const resyncBefore3 = devices.map((d) => countSyncEvents(d, RESYNC_LOG_RE));
		await Promise.all(
			devices.map((d) => l2(d.page).first().waitFor({ state: 'hidden', timeout: 15_000 })),
		);
		const s3 = await assertSynchronizedTransition(devices, video, {
			label: 'cycle4 (wrap): landscape2→video',
			timeoutMs: 30_000,
		});
		const deltaResync3 = devices.map((d, i) => countSyncEvents(d, RESYNC_LOG_RE) - resyncBefore3[i]);
		expect(
			Math.max(...deltaResync3),
			`cycle4 wrap resync-log delta=[${deltaResync3}] exceeds ${MAX_RESYNC_DELTA_PER_TRANSITION} (db8da71 watchdog)`,
		).toBeLessThanOrEqual(MAX_RESYNC_DELTA_PER_TRANSITION);
		// eslint-disable-next-line no-console
		console.log(
			`[playMode-sync] landscape2→video (wrap) skew=${s3.skewMs}ms offsets=[${s3.timestamps
				.map((t) => t - s3.minTs)
				.join(', ')}]`,
		);
		recordSkew({
			test: testInfo.title,
			label: 'landscape2→video (wrap)',
			skewMs: s3.skewMs,
			offsets: s3.timestamps.map((t) => t - s3.minTs),
		});

		// One more wrap to prove stability across cycles 4→5. This is where
		// 5a59d20 would bite: a stale cmd-playMode from cycle 1 could be
		// consumed, producing wrong-sibling selection.
		const resyncBefore4 = devices.map((d) => countSyncEvents(d, RESYNC_LOG_RE));
		await Promise.all(
			devices.map((d) => video(d.page).first().waitFor({ state: 'hidden', timeout: 30_000 })),
		);
		const s4 = await assertSynchronizedTransition(devices, l1, {
			label: 'cycle5: video→landscape1 (2nd wrap)',
			timeoutMs: 30_000,
		});
		const deltaResync4 = devices.map((d, i) => countSyncEvents(d, RESYNC_LOG_RE) - resyncBefore4[i]);
		expect(
			Math.max(...deltaResync4),
			`cycle5 2nd-wrap resync-log delta=[${deltaResync4}] exceeds ${MAX_RESYNC_DELTA_PER_TRANSITION} (db8da71 watchdog)`,
		).toBeLessThanOrEqual(MAX_RESYNC_DELTA_PER_TRANSITION);
		// eslint-disable-next-line no-console
		console.log(
			`[playMode-sync] video→landscape1 (2nd wrap) skew=${s4.skewMs}ms offsets=[${s4.timestamps
				.map((t) => t - s4.minTs)
				.join(', ')}]`,
		);
		recordSkew({
			test: testInfo.title,
			label: 'video→landscape1 (2nd wrap)',
			skewMs: s4.skewMs,
			offsets: s4.timestamps.map((t) => t - s4.minTs),
		});

		// Let the last broadcast settle across receivers before inspecting WS state.
		// Event-driven: returns as soon as per-device frame counts hold steady
		// for quietMs, instead of a fixed 500 ms sleep that either wastes time
		// on fast runs or races on slow-CI ACK arrivals.
		await waitForWsQuiescence(devices, { quietMs: 300, maxWaitMs: 3_000 });
		assertFrameCountSymmetry(devices);
		// This fixture wraps syncIndex every cycle (<seq repeatCount="indefinite">
		// around the inner playMode seq). Wraps trigger slave resyncs via
		// isWraparoundScenario (smilElementDecisions.ts:130-156); during the
		// resync skip, slaves don't ACK elements they're passing through —
		// legitimate protocol behaviour, not a bug. Empirically 60-67 % of
		// master cmds get ACKed per slave; 40 % tolerance absorbs that with
		// margin. The separate `linearPlaylistAckParity` test guards non-wrap
		// ACK parity at 5 % tolerance, so regressions that leak ACKs outside
		// the wrap window still fail loudly.
		assertSyncMessageInventory(devices, { ackCountTolerancePct: 0.4 });
		assertBroadcastReceiptSpread(devices);
		assertFrameContentEquality(devices);

		// ------------------------------------------------------------------
		// Option-C guardrails — fail hard if the playMode=one coordination
		// path (fixed in the commits below) ever regresses to "silently
		// skipped" without surface-level sync drift:
		//
		//  • 5ab5829 — getNextElementToPlay array handling. If reverted, the
		//    middle seq plays all three children per outer iteration; the
		//    visible sequence is indistinguishable but cycle-count semantics
		//    diverge.
		//  • cc9d6c5 — traverser regionName walk + data-prepare snapshot-delta
		//    range tracking. If reverted, cmd-playMode broadcasts cease
		//    entirely and [prepare] stored playMode range never logs.
		// ------------------------------------------------------------------

		// Part 2 catcher: playModeSyncRanges is populated only when the
		// playlistDataPrepare snapshot-delta tracker actually fires for this
		// SMIL shape. Before cc9d6c5 this log never appeared for nested-seq
		// children.
		const storedRangeMax = Math.max(
			...devices.map((d) => d.console.count('[prepare] stored playMode range')),
		);
		expect(
			storedRangeMax,
			'no device logged `[prepare] stored playMode range` — playModeSyncRanges tracker stopped entering the media branch for the nested-seq shape',
		).toBeGreaterThan(0);

		// Part 1 master-side catcher: the master's coordinatePlayModeSync
		// branch actually runs. Before cc9d6c5 the `if (regionName)` guard
		// was silently false because regionName was extracted from a non-leaf
		// wrapper, so no cmd-playMode went on the wire.
		const cmdPlayModeMax = Math.max(
			...devices.map((d) => d.console.count('Master sent cmd-playMode')),
		);
		expect(
			cmdPlayModeMax,
			'no device logged `Master sent cmd-playMode` — the coordinatePlayModeSync master path appears to be silently skipped',
		).toBeGreaterThan(0);

		// Part 1 slave-side catcher: at least one slave consumed a cmd-playMode
		// either via the stored-message fast path or by overriding its local
		// previousIndex on receipt. If master broadcasts but slaves ignore,
		// devices stay in lockstep only by parallel incrementing; this
		// assertion still fires regardless of whether the stored-message path
		// or the live-listener path wins the race.
		const slaveConsumedMax = Math.max(
			...devices.map((d) =>
				d.console.count('Slave overrode previousIndex')
				+ d.console.count('Found stored cmd-playMode'),
			),
		);
		expect(
			slaveConsumedMax,
			'no device logged slave-side playMode consumption (`Slave overrode previousIndex` or `Found stored cmd-playMode`) — slaves may be ignoring master broadcasts',
		).toBeGreaterThan(0);
	});
});
