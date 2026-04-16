import { test, expect } from '../fixtures';
import {
	addSyncDevice,
	createSyncGroup,
	cleanupSyncGroup,
	uniqueGroupName,
	SyncDevice,
} from '../syncHelpers';
import {
	waitForMasterElection,
	waitForConvergence,
	assertSynchronizedTransition,
} from './syncAssertions';

// Group L: killed-master re-joins. G2 covers the failover path (master dies,
// survivor gets promoted). This test extends that scenario: the ORIGINAL master
// is revived after failover with the same DUID — the sync server sees "a
// device that was previously master just came back." Regressions to watch for:
//   - Revived device re-claims master and bumps the current master off
//     (assuming the server's election policy is "newest wins"), disrupting
//     the group.
//   - Revived device inherits stale pre-kill state (resync target, pending
//     ACKs) and drags the rest into incoherent behaviour.
//   - Sync server refuses to accept the same DUID back and the revived
//     device hangs at "waiting for master" indefinitely.
// The test's success criterion is operational: all 3 devices complete the
// next transition together with bounded skew after revival.

test.describe.configure({ mode: 'serial' });
test.describe('sync · killed-master re-join', () => {
	let devices: SyncDevice[] = [];

	test.afterEach(async () => {
		await cleanupSyncGroup(devices);
		devices = [];
	});

	test('revived master rejoins the group and sync resumes across all 3', async ({
		browser,
		testServerBaseUrl,
	}, testInfo) => {
		test.setTimeout(240_000);

		const groupName = uniqueGroupName(testInfo.title);
		const smilUrl = `${testServerBaseUrl}/syncFiles/cycleWrapBoundary.smil`;
		devices = await createSyncGroup(browser, { smilUrl, groupName, deviceCount: 3 });

		const firstMaster = await waitForMasterElection(devices, 60_000);
		// Platform master election is not deterministic w.r.t. launch order;
		// pin down which device was elected so we can revive the same DUID later.
		expect(devices).toContain(firstMaster);
		const killedIndex = devices.indexOf(firstMaster);

		const l1 = (p: SyncDevice['page']) => p.frameLocator('iframe').locator('img[src*="landscape1"]');
		const l2 = (p: SyncDevice['page']) => p.frameLocator('iframe').locator('img[src*="landscape2"]');

		// Establish steady-state through one transition so the group is firmly
		// operating before we kill the master.
		await waitForConvergence(devices, l1, 60_000);
		await Promise.all(devices.map((d) => l1(d.page).first().waitFor({ state: 'hidden', timeout: 15_000 })));
		await waitForConvergence(devices, l2, 15_000);

		// Kill the actual master (not a fixed slot). Remove from devices BEFORE
		// closing so afterEach doesn't try to close its context a second time.
		const killed = firstMaster;
		const survivors = devices.filter((d) => d !== killed);
		devices = survivors;
		await killed.context.close();

		// Survivors must re-elect among themselves (G2 coverage). Keep this
		// tight — if it fails, the issue is with failover, not re-join.
		const newMaster = await waitForMasterElection(survivors, 45_000);
		expect(survivors).toContain(newMaster);

		// Let the survivors complete a post-promotion transition so the new
		// master is firmly in charge when the original master returns.
		await Promise.all(survivors.map((d) => l2(d.page).first().waitFor({ state: 'hidden', timeout: 30_000 })));
		await assertSynchronizedTransition(survivors, l1, {
			label: 'post-failover, pre-revival',
			maxSkewMs: 2000,
			timeoutMs: 30_000,
		});

		// Revive the original master: same DUID (derived from its original
		// index), same group name, same SMIL. The sync server sees the identity
		// returning.
		const revived = await addSyncDevice(browser, killedIndex, { smilUrl, groupName });
		devices = [...survivors, revived];

		// All 3 must converge. Generous budget — the revived device has to
		// load the SMIL, reconnect to the sync server, and catch up to the
		// running group's current element.
		await waitForConvergence(devices, l1, 120_000);

		// Next l1→l2 transition must complete on all 3 with loose tolerance.
		// The meaningful regression signal is a 30s timeout (revived device
		// can't integrate) or skew exceeding this post-revival tolerance.
		await Promise.all(
			devices.map((d) => l1(d.page).first().waitFor({ state: 'hidden', timeout: 30_000 })),
		);
		const skew = await assertSynchronizedTransition(devices, l2, {
			label: 'post-revival: l1→l2 across all 3',
			maxSkewMs: 3000,
			timeoutMs: 30_000,
		});
		// eslint-disable-next-line no-console
		console.log(`[master-rejoin] post-revival skew=${skew.skewMs}ms`);
	});
});
