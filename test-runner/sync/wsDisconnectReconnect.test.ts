import { test, expect } from '../fixtures';
import { createSyncGroup, cleanupSyncGroup, uniqueGroupName, SyncDevice } from '../syncHelpers';
import {
	waitForMasterElection,
	waitForConvergence,
	assertSynchronizedTransition,
	countSyncEvents,
} from './syncAssertions';

// Group I: short WebSocket outage + clean reconnect.
//
// SYNC_TIMEOUTS.networkFailureTimeout = 60 s is meant as a genuine network-
// death safety net. Nothing currently tests either that the timeout fires
// when expected OR that a short WS blip recovers without hitting it. A real
// reconnect path failure would either:
//   (a) Stall the slave until the 60 s safety timeout fires
//       (observable via "Timeout waiting for … at resync target=" in console),
//   (b) Skew subsequent transitions well beyond the loose 3000 ms budget.
// Both are regressions in the normal reconnect flow that should be caught.

test.describe.configure({ mode: 'serial' });
test.describe('sync · WS disconnect/reconnect', () => {
	let devices: SyncDevice[] = [];

	test.afterEach(async () => {
		await cleanupSyncGroup(devices);
		devices = [];
	});

	test('slave survives a 5 s WS outage without triggering networkFailureTimeout', async ({
		browser,
		testServerBaseUrl,
	}, testInfo) => {
		devices = await createSyncGroup(browser, {
			smilUrl: `${testServerBaseUrl}/syncFiles/cycleWrapBoundary.smil`,
			groupName: uniqueGroupName(testInfo.title),
			deviceCount: 3,
		});
		await waitForMasterElection(devices, 60_000);

		const l1 = (p: SyncDevice['page']) => p.frameLocator('iframe').locator('img[src*="landscape1"]');
		const l2 = (p: SyncDevice['page']) => p.frameLocator('iframe').locator('img[src*="landscape2"]');
		await waitForConvergence(devices, l1, 90_000);

		// Take slave[1] offline for 5 s — enough to miss a cmd-prepare round but
		// well under the 60 s networkFailureTimeout. Playwright's setOffline
		// tears down WS connections and returns ERR_INTERNET_DISCONNECTED for
		// new requests.
		await devices[1].context.setOffline(true);
		await devices[0].page.waitForTimeout(5_000);
		await devices[1].context.setOffline(false);

		// After reconnect, slave[1] should rejoin the group and complete the
		// next transition with the rest. Wider tolerance (3000 ms) because
		// reconnect costs real time and the measurement starts at the hide
		// edge, not the reconnect edge.
		await Promise.all(
			devices.map((d) => l1(d.page).first().waitFor({ state: 'hidden', timeout: 30_000 })),
		);
		const s1 = await assertSynchronizedTransition(devices, l2, {
			label: 'post-reconnect: l1→l2',
			maxSkewMs: 3000,
			timeoutMs: 20_000,
		});
		// eslint-disable-next-line no-console
		console.log(`[ws-blip] post-reconnect l1→l2 skew=${s1.skewMs}ms`);

		// No device should have hit the 10 min resync-target safety timeout.
		// If this fires, the reconnect path is relying on the timeout to
		// recover rather than the normal ACK flow — a real finding about the
		// reconnect code path.
		for (const dev of devices) {
			expect(
				countSyncEvents(dev, /Timeout waiting for .+ at resync target=/),
				`dev ${dev.deviceId} hit the resync-target timeout`,
			).toBe(0);
		}
	});
});
