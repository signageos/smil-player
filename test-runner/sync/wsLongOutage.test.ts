import { test, expect } from '../fixtures';
import { createSyncGroup, cleanupSyncGroup, uniqueGroupName, SyncDevice } from '../syncHelpers';
import {
	waitForMasterElection,
	waitForConvergence,
	assertSynchronizedTransition,
	countSyncEvents,
} from './syncAssertions';

// Group K: long WS outage — crosses the 60s SYNC_TIMEOUTS.networkFailureTimeout
// threshold. Complements G4 (5s blip, must NOT hit the timeout): this test
// takes a slave offline for 70s so the timeout must fire, then verifies
// the slave recovers via the planned RESYNC path rather than either hanging
// or falling through to the distinct 10-minute resync-target safety timeout.
//
// The two timeouts are intentionally separate code paths
// (SMILElementController.ts:908 vs 928). Conflating them, or having the 60s
// path never recover, are both plausible regression modes worth guarding.

test.describe.configure({ mode: 'serial' });
test.describe('sync · long WS outage', () => {
	let devices: SyncDevice[] = [];

	test.afterEach(async () => {
		await cleanupSyncGroup(devices);
		devices = [];
	});

	test('slave offline 70s triggers networkFailureTimeout and recovers', async ({
		browser,
		testServerBaseUrl,
	}, testInfo) => {
		// Extend Playwright's per-test timeout — 70s offline + reconnect + recovery
		// comfortably exceeds the 180s default budget.
		test.setTimeout(240_000);

		devices = await createSyncGroup(browser, {
			smilUrl: `${testServerBaseUrl}/syncFiles/cycleWrapBoundary.smil`,
			groupName: uniqueGroupName(testInfo.title),
			deviceCount: 3,
		});
		await waitForMasterElection(devices, 60_000);

		const l1 = (p: SyncDevice['page']) => p.frameLocator('iframe').locator('img[src*="landscape1"]');
		const l2 = (p: SyncDevice['page']) => p.frameLocator('iframe').locator('img[src*="landscape2"]');
		await waitForConvergence(devices, l1, 90_000);

		// Take slave[1] offline for 70s, well past the 60s networkFailureTimeout.
		// The slave's local setTimeout fires independent of network state, so the
		// timeout code path executes even while the browser is still offline.
		await devices[1].context.setOffline(true);
		await devices[0].page.waitForTimeout(70_000);
		await devices[1].context.setOffline(false);

		// The 60s timeout MUST have fired. The player uses logDebug with
		// debug-style %s/%d placeholders that Playwright's msg.text() keeps
		// literal (args appended at the tail), so the log text contains the
		// stable phrase below regardless of which cmd / syncIndex value it
		// fires for. Source: SMILElementController.ts:916
		//   logDebug(timedDebug, 'Timeout waiting for %s at syncIndex=%d - triggering resync', commandType, syncIndex);
		const sixtySecFired = countSyncEvents(
			devices[1],
			/Timeout waiting for .+ triggering resync/,
		);
		expect(
			sixtySecFired,
			'slave[1] should have hit the 60s networkFailureTimeout during 70s offline window',
		).toBeGreaterThan(0);

		// The distinct 10-minute safety timeout (SMILElementController.ts:904)
		// must NOT fire in 70s. Conflating these two paths would show here.
		for (const dev of devices) {
			expect(
				countSyncEvents(dev, /Timeout waiting for .+ at resync target=/),
				`dev ${dev.deviceId} unexpectedly hit the 10m resync-target timeout`,
			).toBe(0);
		}

		// After reconnect, slave[1] must re-integrate with the rest. Generous
		// budget — the slave's resync state machine needs both the cmd flow
		// back and its own target-reach cycle before normal lockstep resumes.
		await waitForConvergence(devices, l2, 120_000);

		// Next transition must complete on all 3 with loose tolerance. A much
		// larger value than G4's 3000ms — post-outage recovery has more
		// variance than a 5s blip.
		await Promise.all(
			devices.map((d) => l2(d.page).first().waitFor({ state: 'hidden', timeout: 30_000 })),
		);
		const skew = await assertSynchronizedTransition(devices, l1, {
			label: 'post-60s-recovery: l2→l1',
			maxSkewMs: 5000,
			timeoutMs: 30_000,
		});
		// eslint-disable-next-line no-console
		console.log(
			`[ws-long-outage] 60s-timeout-fires=${sixtySecFired}, post-recovery skew=${skew.skewMs}ms`,
		);
	});
});
