import { test } from '../fixtures';
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

// Group F: late-join coverage. A 4th device joins a running 3-device group
// after it has stabilised through at least one transition, then must converge
// on the next transition alongside the original three. Exercises the
// resync-to-current-position path on the new device and the master's handling
// of a new participant mid-cycle — neither is covered by any existing test.

test.describe.configure({ mode: 'serial' });
test.describe('sync · late-join slave', () => {
	let devices: SyncDevice[] = [];

	test.afterEach(async () => {
		await cleanupSyncGroup(devices);
		devices = [];
	});

	test('4th device joining mid-run converges within 1 cycle', async ({
		browser,
		testServerBaseUrl,
	}, testInfo) => {
		const groupName = uniqueGroupName(testInfo.title);
		const smilUrl = `${testServerBaseUrl}/syncFiles/basicSyncDiagnostic.smil`;
		devices = await createSyncGroup(browser, { smilUrl, groupName, deviceCount: 3 });
		await waitForMasterElection(devices, 60_000);

		const l1 = (p: SyncDevice['page']) => p.frameLocator('iframe').locator('img[src*="landscape1"]');
		const l2 = (p: SyncDevice['page']) => p.frameLocator('iframe').locator('img[src*="landscape2"]');

		// Let the original 3 stabilise through at least one transition.
		await waitForConvergence(devices, l2, 90_000);

		// Join a 4th device. Same group, same SMIL, standard defaults.
		const late = await addSyncDevice(browser, 3, { smilUrl, groupName });
		devices.push(late);

		// Wait for the late joiner to catch up. It has to (a) load the SMIL,
		// (b) connect to the sync server, and (c) resync to the current
		// playback position — typically 5–15 s including one cycle of catch-up.
		// Convergence on l2 means all four devices are simultaneously on the
		// same element; the skew measurement only becomes meaningful after
		// that. Without this wait, the measured "skew" is dominated by the
		// late joiner's init latency (observed 15 s behind the others).
		await waitForConvergence(devices, l2, 120_000);

		// Now all four are in lockstep on l2. Measure the next l2→l1 transition
		// with the regular tight tolerance — the late joiner must behave
		// indistinguishably from the originals post-resync.
		await Promise.all(
			devices.map((d) => l2(d.page).first().waitFor({ state: 'hidden', timeout: 30_000 })),
		);
		const skew = await assertSynchronizedTransition(devices, l1, {
			label: 'post-join: landscape2→landscape1',
			maxSkewMs: 1000,
			timeoutMs: 30_000,
		});
		// eslint-disable-next-line no-console
		console.log(
			`[late-join] post-join skew=${skew.skewMs}ms offsets=[${skew.timestamps.map((t) => t - skew.minTs).join(', ')}]`,
		);
	});
});
