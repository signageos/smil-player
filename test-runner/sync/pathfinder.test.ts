import { test, expect } from '../fixtures';
import { createSyncGroup, cleanupSyncGroup, uniqueGroupName, SyncDevice } from '../syncHelpers';
import { waitForMasterElection } from './syncAssertions';

test.describe.configure({ mode: 'serial' });
test.describe('sync pathfinder', () => {
	let devices: SyncDevice[] = [];

	// Pre-warm the worker's shared browser HTTP cache with the heavy CDN videos
	// referenced by wallclockSync.smil (the production-shaped fixture this
	// pathfinder uses). Browser contexts within the same browser instance share
	// the HTTP cache, so when the actual 3 contexts launch in the test below
	// they hit warm cache for the videos and reach master election within the
	// 60s budget. Without this, cold-CDN fetches per device (~10–15 s each)
	// plus a 1.5 s × 2 launch stagger consume the entire master-election
	// timeout. Per-context IndexedDB writes still happen per device but those
	// are local and fast (~1 s each).
	test.beforeAll(async ({ browser, testServerBaseUrl }) => {
		const ctx = await browser.newContext({
			viewport: { width: 1080, height: 1920 },
			bypassCSP: true,
		});
		const page = await ctx.newPage();
		const smilUrl = `${testServerBaseUrl}/syncFiles/wallclockSync.smil`;
		await page.goto(`http://localhost:8090/?smilUrl=${encodeURIComponent(smilUrl)}&duid=cachewarm00000000000000000000000000000000000000`);
		// Wait long enough for the player to fetch + cache the prefetched videos.
		// The fixture's prefetch list is fixed; once any visible content appears
		// inside the iframe the bulk of the work is done.
		const frame = page.frameLocator('iframe');
		await expect(frame.locator('body')).toBeVisible({ timeout: 60_000 });
		// Give the prefetch a few extra seconds to complete after first content.
		await page.waitForTimeout(5_000);
		await ctx.close();
	});

	test.afterEach(async () => {
		await cleanupSyncGroup(devices);
		devices = [];
	});

	test('3 devices connect to remote sync server and elect a master', async ({ browser, testServerBaseUrl }) => {
		const smilUrl = `${testServerBaseUrl}/syncFiles/wallclockSync.smil`;
		devices = await createSyncGroup(browser, {
			smilUrl,
			groupName: uniqueGroupName('pathfinder'),
			deviceCount: 3,
		});

		// 60s aligns with the rest of the sync suite. Pathfinder is a smoke
		// test, not a regression test — longer ceiling costs nothing on green
		// runs and absorbs cold-start variance even with the warm cache above.
		const master = await waitForMasterElection(devices, 60_000);
		expect(devices).toContain(master);

		// sanity: all 3 pages reach the applet iframe
		for (const dev of devices) {
			const frame = dev.page.frameLocator('iframe');
			await expect(frame.locator('body')).toBeVisible({ timeout: 30_000 });
		}
	});
});
