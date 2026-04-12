import { test, expect } from '../fixtures';
import { createSyncGroup, cleanupSyncGroup, uniqueGroupName, SyncDevice } from '../syncHelpers';
import { waitForMasterElection, waitForConvergence } from './syncAssertions';

// Diagnostic test: proves that with sync="true" on a region, all 3 devices
// converge on the SAME currently-playing element. Intentionally kept separate
// from the regression scenarios so it can be removed or kept as a smoke test.

test.describe.configure({ mode: 'serial' });
test.describe('sync diagnostic', () => {
	let devices: SyncDevice[] = [];

	test.afterEach(async () => {
		await cleanupSyncGroup(devices);
		devices = [];
	});

	test('3 devices converge on landscape1 → landscape2 in the same order', async ({
		browser,
		testServerBaseUrl,
	}, testInfo) => {
		devices = await createSyncGroup(browser, {
			smilUrl: `${testServerBaseUrl}/syncFiles/basicSyncDiagnostic.smil`,
			groupName: uniqueGroupName(testInfo.title),
			deviceCount: 3,
		});

		await waitForMasterElection(devices, 60_000);

		// All devices should show landscape1 at the same moment
		await waitForConvergence(
			devices,
			(p) => p.frameLocator('iframe').locator('img[src*="landscape1"]'),
			90_000,
		);

		// Then all should move to landscape2 at the same moment
		await waitForConvergence(
			devices,
			(p) => p.frameLocator('iframe').locator('img[src*="landscape2"]'),
			30_000,
		);

		// And loop back to landscape1
		await waitForConvergence(
			devices,
			(p) => p.frameLocator('iframe').locator('img[src*="landscape1"]'),
			30_000,
		);
	});
});
