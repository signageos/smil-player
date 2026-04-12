import { test } from '../fixtures';
import { createSyncGroup, cleanupSyncGroup, uniqueGroupName, SyncDevice } from '../syncHelpers';
import {
	waitForMasterElection,
	waitForConvergence,
	assertSynchronizedTransition,
} from './syncAssertions';

// Diagnostic test: proves sync is operational AND transitions are tight. Uses
// `assertSynchronizedTransition` (not just eventual convergence) so a device
// that drifts more than MAX_SKEW_MS from the others fails the test.
//
// Tolerance chosen deliberately:
//  - The pathfinder proves connection+election in ~9s.
//  - Once sync is up, cmd-prepare/ack-prepared round trips are sub-second in
//    practice. 1500ms leaves headroom for network jitter without masking
//    real regressions.

const MAX_SKEW_MS = 1500;

test.describe.configure({ mode: 'serial' });
test.describe('sync diagnostic', () => {
	let devices: SyncDevice[] = [];

	test.afterEach(async () => {
		await cleanupSyncGroup(devices);
		devices = [];
	});

	test('3 devices transition landscape1 ↔ landscape2 within 1.5s of each other', async ({
		browser,
		testServerBaseUrl,
	}, testInfo) => {
		devices = await createSyncGroup(browser, {
			smilUrl: `${testServerBaseUrl}/syncFiles/basicSyncDiagnostic.smil`,
			groupName: uniqueGroupName(testInfo.title),
			deviceCount: 3,
		});

		await waitForMasterElection(devices, 60_000);

		const landscape1 = (p: typeof devices[0]['page']) =>
			p.frameLocator('iframe').locator('img[src*="landscape1"]');
		const landscape2 = (p: typeof devices[0]['page']) =>
			p.frameLocator('iframe').locator('img[src*="landscape2"]');

		// Initial convergence — first-load noise can be large, don't measure skew.
		await waitForConvergence(devices, landscape1, 90_000);

		// Measure transition 1 → 2. landscape2 is not yet visible; Promise.all
		// subscribes on all devices, Date.now() captured on resolve.
		const l2 = await assertSynchronizedTransition(devices, landscape2, {
			maxSkewMs: MAX_SKEW_MS,
			timeoutMs: 30_000,
			label: 'landscape1 → landscape2',
		});
		// eslint-disable-next-line no-console
		console.log(
			`[sync-diagnostic] landscape1→landscape2 skew=${l2.skewMs}ms (per-device offsets from first: ${l2.timestamps
				.map((t) => t - l2.minTs)
				.join('ms, ')}ms)`,
		);

		// Wait for landscape1 to be hidden everywhere so the next waitFor(visible)
		// captures the fresh cycle-2 appearance rather than the stale cycle-1 DOM.
		await Promise.all(
			devices.map((d) => landscape1(d.page).first().waitFor({ state: 'hidden', timeout: 10_000 })),
		);

		const l1 = await assertSynchronizedTransition(devices, landscape1, {
			maxSkewMs: MAX_SKEW_MS,
			timeoutMs: 30_000,
			label: 'landscape2 → landscape1 (cycle 2)',
		});
		// eslint-disable-next-line no-console
		console.log(
			`[sync-diagnostic] landscape2→landscape1 skew=${l1.skewMs}ms (per-device offsets from first: ${l1.timestamps
				.map((t) => t - l1.minTs)
				.join('ms, ')}ms)`,
		);
	});
});
