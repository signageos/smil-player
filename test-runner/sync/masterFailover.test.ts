import { test, expect } from '../fixtures';
import { createSyncGroup, cleanupSyncGroup, uniqueGroupName, SyncDevice } from '../syncHelpers';
import {
	waitForMasterElection,
	waitForConvergence,
	assertSynchronizedTransition,
} from './syncAssertions';

// Group G: master failover. No existing test covers the slave-promotion path —
// SyncGroup.masterStatus is cached per-device, and killing the master mid-cycle
// must trigger a re-election on the sync server, with the promoted slave
// resuming coordination without inheriting stale resync targets or pending ACKs.
// If this test hangs or fails, that is a real finding about the platform's
// failover behaviour, not a test-quality issue — document the failure mode
// before attempting to adjust the test.

test.describe.configure({ mode: 'serial' });
test.describe('sync · master failover', () => {
	let devices: SyncDevice[] = [];

	test.afterEach(async () => {
		await cleanupSyncGroup(devices);
		devices = [];
	});

	test('killing master mid-cycle: survivor is promoted and sync resumes', async ({
		browser,
		testServerBaseUrl,
	}, testInfo) => {
		devices = await createSyncGroup(browser, {
			smilUrl: `${testServerBaseUrl}/syncFiles/cycleWrapBoundary.smil`,
			groupName: uniqueGroupName(testInfo.title),
			deviceCount: 3,
		});
		const firstMaster = await waitForMasterElection(devices, 60_000);
		expect(firstMaster).toBe(devices[0]); // Staggered launch means dev0 wins.

		const l1 = (p: SyncDevice['page']) => p.frameLocator('iframe').locator('img[src*="landscape1"]');
		const l2 = (p: SyncDevice['page']) => p.frameLocator('iframe').locator('img[src*="landscape2"]');

		// Establish steady-state: all 3 reach l1, then transition to l2 together.
		await waitForConvergence(devices, l1, 60_000);
		await Promise.all(devices.map((d) => l1(d.page).first().waitFor({ state: 'hidden', timeout: 15_000 })));
		await waitForConvergence(devices, l2, 15_000);

		// Kill the master. Remove from `devices` BEFORE closing so afterEach
		// does not try to close the context a second time.
		const [dead, ...survivors] = devices;
		devices = survivors;
		await dead.context.close();

		// Survivors must re-elect among themselves. Budget 45 s: the sync
		// server's master-loss detection is ~30 s + one cycle to promote.
		const newMaster = await waitForMasterElection(survivors, 45_000);
		expect(survivors).toContain(newMaster);
		expect(newMaster).not.toBe(dead);

		// After promotion the two survivors must keep transitioning together.
		// Wider tolerance (2000 ms) because promotion is not timing-critical,
		// only correctness: we want to prove the group stays sync'd, not
		// measure normal-operation skew.
		await Promise.all(survivors.map((d) => l2(d.page).first().waitFor({ state: 'hidden', timeout: 30_000 })));
		const skew = await assertSynchronizedTransition(survivors, l1, {
			label: 'post-failover: landscape2→landscape1',
			maxSkewMs: 2000,
			timeoutMs: 30_000,
		});
		// eslint-disable-next-line no-console
		console.log(`[failover] post-promotion skew=${skew.skewMs}ms`);
	});
});
