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

// Group B regression test for wallclock-bounded resync bugs.
//
// The fixture places wallclock-gated siblings around playable content so
// maxSyncIndexPerRegion is inflated (future-wallclock at the end) and
// minSyncIndex is left-clipped (expired-wallclock at the start). Pre-fix,
// slaves either:
//  - 0484bc9: computed a resync target that included the future element
//    and timed out trying to reach it ("unreachable resync target"), or
//  - c34f811: hardcoded the wrap target to 1 and kept trying to play the
//    expired first element in a loop.
//
// Post-fix, slaves use the slave-observed min/max syncIndex, so the resync
// target is always reachable. The test confirms convergence across cycles
// and keeps transitions tight under the 500ms skew ceiling.

test.describe.configure({ mode: 'serial' });
test.describe('sync · wallclock-bounded resync [0484bc9, c34f811]', () => {
	let devices: SyncDevice[] = [];

	test.afterEach(async () => {
		await cleanupSyncGroup(devices);
		devices = [];
	});

	test('slaves converge despite inflated/clipped syncIndex range', async ({
		browser,
		testServerBaseUrl,
	}, testInfo) => {
		devices = await createSyncGroup(browser, {
			smilUrl: `${testServerBaseUrl}/syncFiles/wallclockInflatedBounds.smil`,
			groupName: uniqueGroupName(testInfo.title),
			deviceCount: 3,
		});

		await waitForMasterElection(devices, 60_000);

		const video = (p: SyncDevice['page']) => p.locator('video[src*="video-test_465b7757"]');
		const l2 = (p: SyncDevice['page']) =>
			p.frameLocator('iframe').locator('img[src*="landscape2"]');

		// Element 1 (expired 2020) is skipped. Element 2 (landscape2) is the first
		// real thing all devices play. Initial convergence — loose.
		await waitForConvergence(devices, l2, 120_000);

		// landscape2 → video (element 2 → element 3). The element-4 future wallclock
		// inflates the slave's maxSyncIndexPerRegion, so pre-0484bc9 the slave would
		// time out here.
		await Promise.all(
			devices.map((d) => l2(d.page).first().waitFor({ state: 'hidden', timeout: 15_000 })),
		);
		const s1 = await assertSynchronizedTransition(devices, video, {
			label: 'landscape2→video (inflated max)',
			timeoutMs: 30_000,
		});
		// eslint-disable-next-line no-console
		console.log(
			`[wallclock-bounds] landscape2→video skew=${s1.skewMs}ms offsets=[${s1.timestamps
				.map((t) => t - s1.minTs)
				.join(', ')}]`,
		);

		// video → landscape2 (wrap past the expired and future wallclock elements).
		// Pre-c34f811, slave would wrap to hardcoded 1 and fail to advance past
		// the expired element.
		await Promise.all(
			devices.map((d) => video(d.page).first().waitFor({ state: 'hidden', timeout: 30_000 })),
		);
		const s2 = await assertSynchronizedTransition(devices, l2, {
			label: 'video→landscape2 (wrap past expired start)',
			timeoutMs: 30_000,
		});
		// eslint-disable-next-line no-console
		console.log(
			`[wallclock-bounds] video→landscape2 (wrap) skew=${s2.skewMs}ms offsets=[${s2.timestamps
				.map((t) => t - s2.minTs)
				.join(', ')}]`,
		);

		// One more transition to confirm stability across wrap.
		await Promise.all(
			devices.map((d) => l2(d.page).first().waitFor({ state: 'hidden', timeout: 15_000 })),
		);
		const s3 = await assertSynchronizedTransition(devices, video, {
			label: 'landscape2→video (2nd cycle)',
			timeoutMs: 30_000,
		});
		// eslint-disable-next-line no-console
		console.log(
			`[wallclock-bounds] landscape2→video (2nd) skew=${s3.skewMs}ms offsets=[${s3.timestamps
				.map((t) => t - s3.minTs)
				.join(', ')}]`,
		);

		// The pre-fix symptom is that the slave cannot reach an inflated max
		// and stalls; that is caught directly by the 30 s transition timeout
		// on each assertSynchronizedTransition above. (An earlier version of
		// this test also grepped for "unreachable resync target" in console
		// logs, but that string never existed in the source — it was a dead
		// assertion providing false confidence.)

		// Let the last broadcast settle across receivers before inspecting WS state.
		await devices[0].page.waitForTimeout(500);
		assertFrameCountSymmetry(devices);
		// Wallclock-gated fixture: slaves skip expired/future siblings, so
		// master-broadcast cmd-* frames targeting those elements go unack'd.
		// Observed ratio ~65 % (~35 % deficit). 40 % tolerance accepts the
		// scenario's protocol shape while catching major regressions.
		assertSyncMessageInventory(devices, { ackCountTolerancePct: 0.4 });
		assertBroadcastReceiptSpread(devices);
		assertFrameContentEquality(devices);
	});
});
