import { test } from '../fixtures';
import { createSyncGroup, cleanupSyncGroup, uniqueGroupName, SyncDevice } from '../syncHelpers';
import {
	waitForMasterElection,
	waitForConvergence,
	assertSynchronizedTransition,
} from './syncAssertions';

// Group H: multi-region concurrent sync. Every existing fixture uses a single
// <region regionName="main"/>. SMILElementController maintains per-region
// state (slavePosition, maxSyncIndexPerRegion, etc.) but nothing asserts two
// synced regions advance independently-but-correctly. This fixture has one
// region on a 4s cadence and another on a 6s cadence, so they go out of phase
// and both schedulers must be running independently for the assertions to
// hold.
//
// Element selectors use id*="-<regionName>-" because the player encodes region
// name into element id (see generateElementId in src/.../generalTools.ts). The
// src attribute alone is ambiguous — both regions may show the same image.

test.describe.configure({ mode: 'serial' });
test.describe('sync · multi-region', () => {
	let devices: SyncDevice[] = [];

	test.afterEach(async () => {
		await cleanupSyncGroup(devices);
		devices = [];
	});

	test('two synced regions advance independently with per-region lockstep', async ({
		browser,
		testServerBaseUrl,
	}, testInfo) => {
		devices = await createSyncGroup(browser, {
			smilUrl: `${testServerBaseUrl}/syncFiles/multiRegionSync.smil`,
			groupName: uniqueGroupName(testInfo.title),
			deviceCount: 3,
		});
		await waitForMasterElection(devices, 60_000);

		const topL1 = (p: SyncDevice['page']) =>
			p.frameLocator('iframe').locator('img[id*="-top-"][src*="landscape1"]');
		const topL2 = (p: SyncDevice['page']) =>
			p.frameLocator('iframe').locator('img[id*="-top-"][src*="landscape2"]');
		const bottomL1 = (p: SyncDevice['page']) =>
			p.frameLocator('iframe').locator('img[id*="-bottom-"][src*="landscape1"]');
		const bottomL2 = (p: SyncDevice['page']) =>
			p.frameLocator('iframe').locator('img[id*="-bottom-"][src*="landscape2"]');

		// Initial convergence: top shows landscape1 (first sibling, 4s dur),
		// bottom shows landscape2 (first sibling, 6s dur).
		await waitForConvergence(devices, topL1, 120_000);
		await waitForConvergence(devices, bottomL2, 120_000);

		// Top transition (4 s cadence). Bottom should still be on l2 at this moment.
		await Promise.all(
			devices.map((d) => topL1(d.page).first().waitFor({ state: 'hidden', timeout: 15_000 })),
		);
		const topSkew = await assertSynchronizedTransition(devices, topL2, {
			label: 'top: l1→l2',
			timeoutMs: 15_000,
		});
		// eslint-disable-next-line no-console
		console.log(
			`[multi-region] top l1→l2 skew=${topSkew.skewMs}ms offsets=[${topSkew.timestamps.map((t) => t - topSkew.minTs).join(', ')}]`,
		);

		// Bottom transition (6 s cadence). Must be independent of top's state
		// (top may have cycled another time by now).
		await Promise.all(
			devices.map((d) => bottomL2(d.page).first().waitFor({ state: 'hidden', timeout: 15_000 })),
		);
		const bottomSkew = await assertSynchronizedTransition(devices, bottomL1, {
			label: 'bottom: l2→l1',
			timeoutMs: 15_000,
		});
		// eslint-disable-next-line no-console
		console.log(
			`[multi-region] bottom l2→l1 skew=${bottomSkew.skewMs}ms offsets=[${bottomSkew.timestamps.map((t) => t - bottomSkew.minTs).join(', ')}]`,
		);
	});
});
