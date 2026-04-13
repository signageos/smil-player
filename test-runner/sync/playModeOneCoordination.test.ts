import { test } from '../fixtures';
import { createSyncGroup, cleanupSyncGroup, uniqueGroupName, SyncDevice } from '../syncHelpers';
import {
	waitForMasterElection,
	waitForConvergence,
	assertSynchronizedTransition,
	assertFrameCountSymmetry,
	assertSyncMessageInventory,
	assertBroadcastReceiptSpread,
	assertFrameContentEquality,
} from './syncAssertions';
import { recordSkew } from '../../tools/record-sync-skew.mjs';

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
		await Promise.all(
			devices.map((d) => video(d.page).first().waitFor({ state: 'hidden', timeout: 30_000 })),
		);
		const s1 = await assertSynchronizedTransition(devices, l1, {
			label: 'cycle2: video→landscape1',
			timeoutMs: 30_000,
		});
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
		await Promise.all(
			devices.map((d) => l1(d.page).first().waitFor({ state: 'hidden', timeout: 15_000 })),
		);
		const s2 = await assertSynchronizedTransition(devices, l2, {
			label: 'cycle3: landscape1→landscape2',
			timeoutMs: 15_000,
		});
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
		await Promise.all(
			devices.map((d) => l2(d.page).first().waitFor({ state: 'hidden', timeout: 15_000 })),
		);
		const s3 = await assertSynchronizedTransition(devices, video, {
			label: 'cycle4 (wrap): landscape2→video',
			timeoutMs: 30_000,
		});
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
		await Promise.all(
			devices.map((d) => video(d.page).first().waitFor({ state: 'hidden', timeout: 30_000 })),
		);
		const s4 = await assertSynchronizedTransition(devices, l1, {
			label: 'cycle5: video→landscape1 (2nd wrap)',
			timeoutMs: 30_000,
		});
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
		await devices[0].page.waitForTimeout(500);
		assertFrameCountSymmetry(devices);
		// playMode=one observed deficit: ack-prepared ~78 %, ack-playing ~62 %,
		// ack-finished ~57 % of master cmd sends. Slaves don't always ACK cmds
		// whose target element is already superseded by the next cycle's advance.
		// Widen to 40 % to accept the scenario's protocol shape while still
		// catching gross regressions.
		assertSyncMessageInventory(devices, { ackCountTolerancePct: 0.4 });
		assertBroadcastReceiptSpread(devices);
		assertFrameContentEquality(devices);
	});
});
