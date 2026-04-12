import { test, expect } from '../fixtures';
import { createSyncGroup, cleanupSyncGroup, uniqueGroupName, SyncDevice } from '../syncHelpers';
import { waitForMasterElection } from './syncAssertions';

test.describe.configure({ mode: 'serial' });
test.describe('sync pathfinder', () => {
	let devices: SyncDevice[] = [];

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

		const master = await waitForMasterElection(devices, 30_000);
		expect(devices).toContain(master);

		// sanity: all 3 pages reach the applet iframe
		for (const dev of devices) {
			const frame = dev.page.frameLocator('iframe');
			await expect(frame.locator('body')).toBeVisible({ timeout: 30_000 });
		}
	});
});
