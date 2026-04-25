import { test } from '../fixtures';
import { expect } from '@playwright/test';
import { addSyncDevice, cleanupSyncGroup, uniqueGroupName, SyncDevice } from '../syncHelpers';
import {
	waitForSyncIndexAgreement,
	getVisibleElement,
	hasConsoleError,
	countSyncEvents,
	ElementCandidate,
} from './syncAssertions';

// ============================================================================
// Cross-version peer alignment-peek (commit f5ad0a8).
//
// When peers in a sync group run different SMIL versions, their broadcasts
// reference priority bounds / syncIndex ranges that don't map to a peer's
// local playlist. Pre-fix: the affected peer waited up to 60s for a matching
// cmd-prepare, hit networkFailureTimeout, set an unreachable RESYNC target,
// and the playlist processor scrolled through elements without playing any —
// frozen on the last frame for up to 5 minutes.
//
// Post-fix: SMILElementController.isBroadcastAligned() short-circuits both
// `waitForCommandAndCheckSync` and `handleSlavePhaseComplete`, returning
// CONTINUE so the device plays its current element solo. Sync resumes the
// next time a structurally compatible broadcast arrives.
//
// Cross-version is modelled as two devices in the same sync group on
// DIFFERENT SMIL URLs (option A — same syncGroupName, different fixtures):
//   - crossVersionShort.smil — 5 elements; maxSyncIndexPerRegion[main] = 5.
//   - crossVersionLong.smil  — 10 elements; maxSyncIndexPerRegion[main] = 10.
// A LONG-fixture peer broadcasts syncIndex 1-10. A SHORT-fixture peer's
// alignment peek rejects broadcasts of syncIndex 6-10 → plays solo.
// ============================================================================

const LONG_URL_FOR = (port: number) => `http://localhost:${port}/syncFiles/crossVersionLong.smil`;
const SHORT_URL_FOR = (port: number) => `http://localhost:${port}/syncFiles/crossVersionShort.smil`;

const CROSS_VERSION_LOG = /Peer broadcast cross-version/;
const NETWORK_FAILURE_LOG = /networkFailureTimeout|signal-ready timed out/i;
const WRAPPING_RESYNC_LOG = /Wrapping resync target/;

const LAUNCH_STAGGER_MS = 1500;

// Five SHORT-fixture image candidates. The cross-version slave should cycle
// through these in real time even though the master's broadcasts no longer
// help it advance.
const SHORT_CANDIDATES: ElementCandidate[] = [1, 2, 3, 4, 5].map((n) => ({
	name: `img_${n}`,
	locator: (p) => p.frameLocator('iframe').locator(`img[src*="img_${n}_"]`),
}));

// Wait for any candidate to become visible, then sample DOM repeatedly and
// assert ≥minDistinct unique elements were observed across the window. The
// initial wait absorbs the slave's intro/loader phase so the cycling check
// only measures real playlist playback. Pre-fix the slave freezes on the
// first or last successfully-rendered element, so this collapses to one
// distinct value (or never enters the warmup at all → test fails on warmup).
async function assertDomCycles(
	device: SyncDevice,
	candidates: ElementCandidate[],
	opts: { warmupTimeoutMs?: number; samples?: number; gapMs?: number; minDistinct?: number } = {},
) {
	// 10 samples × 5s = 50s observation window. With master broadcasting at
	// ~5s/element, this spans master's syncIndex 1→10, so the cross-version
	// predicate has had time to fire by the end. minDistinct=3 distinguishes a
	// cycling slave (sees 3+ images) from a frozen one (stuck on ≤1).
	const { warmupTimeoutMs = 60_000, samples = 10, gapMs = 5_000, minDistinct = 3 } = opts;

	// Behavioral warmup — block until at least one candidate is rendering.
	// Pre-fix this hangs (slave never advances past intro / freezes on first
	// element) and the assertion below catches the timeout.
	const warmupDeadline = Date.now() + warmupTimeoutMs;
	let warmupHit: string | null = null;
	while (Date.now() < warmupDeadline) {
		const visible = await getVisibleElement(device.page, candidates);
		if (visible) {
			warmupHit = visible;
			break;
		}
		await device.page.waitForTimeout(500);
	}
	expect(
		warmupHit,
		`No candidate became visible on ${device.deviceId} within ${warmupTimeoutMs}ms — slave never entered playback.`,
	).not.toBeNull();

	// Now sample for cycling. With minDistinct=3 over 6×5s, the slave must
	// transition through ≥3 distinct images to pass. Pre-fix it stays on one.
	const seen = new Set<string>();
	if (warmupHit) warmupHit.split('+').forEach((s) => seen.add(s));
	const trail: Array<{ t: number; visible: string | null }> = [{ t: 0, visible: warmupHit }];
	const startTs = Date.now();
	for (let i = 0; i < samples; i++) {
		await device.page.waitForTimeout(gapMs);
		const visible = await getVisibleElement(device.page, candidates);
		trail.push({ t: Date.now() - startTs, visible });
		if (visible) {
			// `getVisibleElement` joins overlapping candidates with `+` during a
			// transition; split so each candidate counts independently.
			visible.split('+').forEach((s) => seen.add(s));
		}
	}
	expect(
		seen.size,
		`Expected ≥${minDistinct} distinct visible elements over ${samples} samples on ${device.deviceId}, ` +
			`got ${seen.size}: ${[...seen].join(', ')}. Trail: ${JSON.stringify(trail)}`,
	).toBeGreaterThanOrEqual(minDistinct);
}

function assertNoStallSymptoms(device: SyncDevice) {
	expect(
		hasConsoleError(device, NETWORK_FAILURE_LOG),
		`${device.deviceId} hit networkFailureTimeout / signal-ready timeout — alignment peek did not short-circuit.`,
	).toBe(false);
	expect(
		hasConsoleError(device, WRAPPING_RESYNC_LOG),
		`${device.deviceId} logged "Wrapping resync target" — false RESYNC target despite alignment peek.`,
	).toBe(false);
}

async function waitForCrossVersionLog(device: SyncDevice, timeoutMs = 60_000): Promise<number> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const count = countSyncEvents(device, CROSS_VERSION_LOG);
		if (count > 0) return count;
		await device.page.waitForTimeout(500);
	}
	const recv = countSyncEvents(device, /received .*: group=.*type=cmd-(prepare|play|finish)/);
	const slaveAhead = countSyncEvents(device, /Slave ahead at/);
	const tail = device.console.messages.slice(-30).map((m) => m.text).join('\n');
	throw new Error(
		`${device.deviceId} did not log "Peer broadcast cross-version" within ${timeoutMs}ms.\n` +
			`Diagnostic: cmd-* received=${recv}, "Slave ahead at" lines=${slaveAhead}.\n` +
			`Console tail (last 30 lines):\n${tail}`,
	);
}

/** Master-elected check tailored for cross-version cohorts. The default
 * `waitForMasterElection` looks for "Master received all ACKs", which never
 * fires here because slaves intentionally skip ACK on cross-version
 * broadcasts. Use the device-side "master status changed: ... null true"
 * line instead — emitted by SyncGroup.onStatus the moment the device wins
 * the election. */
const MASTER_BECAME_TRUE = /master status changed[\s\S]*?\bnull[\s\S]*?\btrue\b/;
async function waitForMasterFromCohort(devices: SyncDevice[], timeoutMs = 60_000): Promise<SyncDevice> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		for (const dev of devices) {
			if (dev.console.messages.some((m) => MASTER_BECAME_TRUE.test(m.text))) return dev;
		}
		await new Promise((r) => setTimeout(r, 250));
	}
	throw new Error(
		`No device logged "master status changed: null -> true" within ${timeoutMs}ms — sync group never converged on a master.`,
	);
}

/** Build a heterogeneous sync group: per-device SMIL URL, staggered launch. */
async function buildHeterogeneousGroup(
	browser: Parameters<typeof addSyncDevice>[0],
	groupName: string,
	smilUrlsByIndex: string[],
): Promise<SyncDevice[]> {
	const devices: SyncDevice[] = [];
	for (let i = 0; i < smilUrlsByIndex.length; i++) {
		devices.push(await addSyncDevice(browser, i, { smilUrl: smilUrlsByIndex[i], groupName }));
		if (i < smilUrlsByIndex.length - 1) {
			await new Promise((r) => setTimeout(r, LAUNCH_STAGGER_MS));
		}
	}
	return devices;
}

test.describe.configure({ mode: 'serial' });
test.describe('sync · cross-version peer alignment peek [f5ad0a8]', () => {
	let devices: SyncDevice[] = [];

	test.afterEach(async () => {
		await cleanupSyncGroup(devices);
		devices = [];
	});

	// -----------------------------------------------------------------
	// Test 1: cross-version SLAVE.
	// 2 devices on LONG (one wins master), 1 device on SHORT joins last.
	// The SHORT device receives master broadcasts of syncIndex 6-10 that
	// don't map to its local 5-element playlist → alignment peek fires.
	// -----------------------------------------------------------------
	test('cross-version slave plays solo without freezing', async ({ browser, testServerPort }, testInfo) => {
		const groupName = uniqueGroupName(testInfo.title);
		const longUrl = LONG_URL_FOR(testServerPort);
		const shortUrl = SHORT_URL_FOR(testServerPort);
		devices = await buildHeterogeneousGroup(browser, groupName, [longUrl, longUrl, shortUrl]);

		await waitForMasterFromCohort(devices, 60_000);
		const shortSlave = devices[2];

		// LOAD-BEARING behavioral assertions — independent of how the predicate
		// is implemented or what it logs. These catch the bug's actual user-
		// visible fingerprints (DOM frozen on last frame + 60s stall symptoms),
		// so a future change that renames the log message but keeps the behavior
		// will not break this test.
		await assertDomCycles(shortSlave, SHORT_CANDIDATES);
		assertNoStallSymptoms(shortSlave);

		// DIAGNOSTIC: confirm the predicate took the peek path. Runs AFTER the
		// behavioral assertions and is intentionally a separate expect() so that
		// a renamed log message doesn't mask a behavioral break (or vice versa).
		const crossVersionCount = countSyncEvents(shortSlave, CROSS_VERSION_LOG);
		expect(
			crossVersionCount,
			`Cross-version log did not fire on ${shortSlave.deviceId} — either the log message changed ` +
				'or the peek branch was bypassed. Behavioral assertions above must still pass for the test to count.',
		).toBeGreaterThan(0);

		// Master never enters the predicate's false branch (it's the broadcast
		// source, not consumer). Structural sanity check.
		expect(countSyncEvents(devices[0], CROSS_VERSION_LOG)).toBe(0);
	});

	// -----------------------------------------------------------------
	// Test 1b: cross-version MASTER (single odd-out wins election).
	// 1 device on LONG (joins first → master). 2 devices on SHORT join later
	// → both are victims. Stresses the alignment peek under simultaneous
	// activation on multiple slaves.
	// -----------------------------------------------------------------
	test('cross-version master leaves both short slaves playing solo', async ({ browser, testServerPort }, testInfo) => {
		const groupName = uniqueGroupName(testInfo.title);
		const longUrl = LONG_URL_FOR(testServerPort);
		const shortUrl = SHORT_URL_FOR(testServerPort);
		devices = await buildHeterogeneousGroup(browser, groupName, [longUrl, shortUrl, shortUrl]);

		await waitForMasterFromCohort(devices, 60_000);

		const shortSlaveA = devices[1];
		const shortSlaveB = devices[2];

		// LOAD-BEARING behavioral assertions on both slaves (parallel).
		await Promise.all([assertDomCycles(shortSlaveA, SHORT_CANDIDATES), assertDomCycles(shortSlaveB, SHORT_CANDIDATES)]);
		assertNoStallSymptoms(shortSlaveA);
		assertNoStallSymptoms(shortSlaveB);

		// DIAGNOSTIC.
		expect(countSyncEvents(shortSlaveA, CROSS_VERSION_LOG), `dev1 missing cross-version log`).toBeGreaterThan(0);
		expect(countSyncEvents(shortSlaveB, CROSS_VERSION_LOG), `dev2 missing cross-version log`).toBeGreaterThan(0);

		// Master never hits the predicate (broadcast source, not consumer).
		expect(countSyncEvents(devices[0], CROSS_VERSION_LOG)).toBe(0);
	});

	// -----------------------------------------------------------------
	// Test 2: recovery / auto-resume after SMIL update.
	// Setup like Test 1. After the cross-version peek has fired on the
	// short slave, swap its SMIL URL to LONG via init-script + reload.
	// Sync coordination must resume (waitForSyncIndexAgreement succeeds)
	// and no NEW cross-version log lines appear after recovery.
	// -----------------------------------------------------------------
	test('cross-version slave rejoins sync after its SMIL is updated', async ({ browser, testServerPort }, testInfo) => {
		const groupName = uniqueGroupName(testInfo.title);
		const longUrl = LONG_URL_FOR(testServerPort);
		const shortUrl = SHORT_URL_FOR(testServerPort);
		devices = await buildHeterogeneousGroup(browser, groupName, [longUrl, longUrl, shortUrl]);

		await waitForMasterFromCohort(devices, 60_000);

		const victim = devices[2];
		await waitForCrossVersionLog(victim, 120_000);
		const cutoffTs = Date.now();

		// Simulate a SMIL update on the victim by stacking a new init script
		// that overrides __SMIL_URL__ to the LONG fixture, then reload.
		// addInitScript callbacks run in registration order, so the second
		// callback wins on every subsequent navigation.
		await victim.context.addInitScript((newUrl: string) => {
			(window as any).__SMIL_URL__ = newUrl;
		}, longUrl);
		await victim.page.reload();

		// All three devices now run LONG and should converge on the same
		// syncIndex. Generous timeout — the victim has to download the new
		// SMIL, prefetch assets, and rejoin the sync group from scratch.
		const agreement = await waitForSyncIndexAgreement(devices, { timeoutMs: 120_000 });
		// eslint-disable-next-line no-console
		console.log(`[crossVersion-recovery] post-recovery agreement: syncIndex=${agreement.syncIndex} skewMs=${agreement.skewMs}`);

		// After recovery, NEW cross-version log lines should be at most one — the
		// in-flight broadcast may still emit briefly before the reload completes.
		const newCrossVersionLines = victim.console.messages.filter(
			(m) => CROSS_VERSION_LOG.test(m.text) && m.time > cutoffTs,
		);
		expect(
			newCrossVersionLines.length,
			`Recovered device emitted ${newCrossVersionLines.length} cross-version log line(s) after recovery — ` +
				'predicate should stop firing once bounds align.',
		).toBeLessThanOrEqual(1);

		assertNoStallSymptoms(victim);
	});
});
