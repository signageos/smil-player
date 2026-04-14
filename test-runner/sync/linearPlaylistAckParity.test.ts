import { test } from '../fixtures';
import { createSyncGroup, cleanupSyncGroup, uniqueGroupName, SyncDevice } from '../syncHelpers';
import {
	waitForMasterElection,
	waitForConvergence,
	assertFrameCountSymmetry,
	assertSyncMessageInventory,
	assertBroadcastReceiptSpread,
} from './syncAssertions';

// ============================================================================
// Wrap-free ACK-parity guardrail.
//
// `playModeOneCoordination` widens `ackCountTolerancePct` to 0.4 because its
// SMIL wraps syncIndex every cycle and slaves legitimately skip ACKs during
// wrap-induced resync (`shouldSkipForResync` in SMILElementController.ts,
// `isWraparoundScenario` in smilElementDecisions.ts). That's correct protocol
// behaviour but it also means no existing sync test would notice a regression
// that causes slaves to skip ACKs in non-resync flow.
//
// This test fills that gap: a linear 10-element playlist observed for ~22 s
// after convergence sees zero wraps (the first wrap would come at ~30 s), so
// every master `cmd-prepare`/`cmd-play`/`cmd-finish` should produce a matching
// `ack-prepared`/`ack-playing`/`ack-finished` from each slave. Master's
// received ACK count should therefore sit within 5 % of the ideal
// `2 × masterCmdSent` — any larger drop signals either a new skip path or
// a protocol regression.
// ============================================================================

const ACK_TOLERANCE_PCT = 0.05;
const OBSERVATION_MS = 45_000;

test.describe.configure({ mode: 'serial' });
test.describe('sync · linear playlist ACK parity', () => {
	let devices: SyncDevice[] = [];

	test.afterEach(async () => {
		await cleanupSyncGroup(devices);
		devices = [];
	});

	test('3 devices maintain ≥95% ACK parity on a non-wrapping linear playlist', async ({
		browser,
		testServerBaseUrl,
	}, testInfo) => {
		devices = await createSyncGroup(browser, {
			smilUrl: `${testServerBaseUrl}/syncFiles/linearPlaylistAckParity.smil`,
			groupName: uniqueGroupName(testInfo.title),
			deviceCount: 3,
		});

		await waitForMasterElection(devices, 60_000);

		// Wait for the first image to render on all devices.
		const firstImg = (p: SyncDevice['page']) =>
			p.frameLocator('iframe').locator('img[src*="landscape1"]').first();
		await waitForConvergence(devices, firstImg, 120_000);

		// Post-convergence settle window. The first couple of elements are
		// noisy — slaves may still be catching up via resync right after join,
		// dropping early ACKs. Skipping ~2 elements' worth of time lets the
		// protocol reach true steady state before the measurement window.
		const SETTLE_BUFFER_MS = 6_000;
		const startCounts = devices.map((d) => d.wsFrames.length);
		await devices[0].page.waitForTimeout(SETTLE_BUFFER_MS);

		// Steady-state observation. At 3 s dur per element, 20 s covers ~6-7
		// elements, and the buffer+observation (26 s) stays comfortably before
		// the outer wrap at ~30 s.
		await devices[0].page.waitForTimeout(OBSERVATION_MS);

		// Diagnostic: per-device frame count before/after the settle buffer.
		// eslint-disable-next-line no-console
		console.log(`[linear-ack-parity] frames pre-settle=[${startCounts.join(', ')}] ` +
			`post-settle+observe=[${devices.map((d) => d.wsFrames.length).join(', ')}]`);

		// Cross-device frame-count symmetry — cheap noise insurance.
		assertFrameCountSymmetry(devices);

		// The load-bearing assertion: inside the observation window with no
		// wraps, slave ACKs should match master cmds ~1:1. A tight 5 % bound
		// leaves headroom only for end-of-window ACK truncation (master sends
		// `cmd-finish` just before the snapshot, its corresponding
		// `ack-finished` lands just after).
		assertSyncMessageInventory(devices, { ackCountTolerancePct: ACK_TOLERANCE_PCT });

		// Broadcast-receipt spread catches a different class of bug (one slave
		// silently dropping frames) that wouldn't always show up in the
		// inventory ratio.
		assertBroadcastReceiptSpread(devices);
	});
});
