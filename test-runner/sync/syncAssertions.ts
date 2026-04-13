import { expect, Locator, Page } from '@playwright/test';
import { SyncDevice, WsFrame } from '../syncHelpers';

/**
 * Playwright's `msg.text()` concatenates the console format string with its
 * args rather than substituting `%s` / `%c`, so logs look like:
 *   `%c[syncGroup] initial master status: group=%s, isMaster=%s%c +0ms color1 color2 <groupname> true color3`
 * We match master-signalling logs from three sources in order of strongest evidence:
 *  1. `playlistProcessor.ts` "Master received all ... ACKs for ..." — only logged by
 *     the master after collecting ACKs, so a hard signal.
 *  2. `SyncGroup.ts` `isMaster()` initial-status log with the args ending in `true`.
 *  3. `SyncGroup.ts` onStatus handler logging "master status changed: ... false -> true".
 *  4. Generic "becoming master" phrase (defensive, may appear from native code).
 */
const MASTER_ELECTED_RE =
	/Master received all|isMaster[\s\S]*?\btrue\b|master status changed[\s\S]*?\bfalse\b[\s\S]*?\btrue\b|becoming\s+master/i;

export async function waitForMasterElection(
	devices: SyncDevice[],
	timeoutMs = 20000,
): Promise<SyncDevice> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		for (const dev of devices) {
			if (dev.console.messages.some((m) => MASTER_ELECTED_RE.test(m.text))) {
				return dev;
			}
		}
		await new Promise((r) => setTimeout(r, 250));
	}
	throw new Error(
		`No master elected within ${timeoutMs}ms. Console tails:\n` +
			devices
				.map((d, i) => `dev${i}:\n${d.console.messages.slice(-20).map((m) => m.text).join('\n')}`)
				.join('\n\n'),
	);
}

/**
 * Asserts each device's locator becomes visible within `timeoutMs`.
 * NOTE: This checks **eventual** visibility per device, not simultaneous visibility.
 * For "all devices show the same element at the same moment" use `waitForConvergence`.
 */
export async function assertAllDevicesShow(
	devices: SyncDevice[],
	locatorForPage: (p: Page) => Locator,
	timeoutMs = 15000,
) {
	await Promise.all(
		devices.map((d) => expect(locatorForPage(d.page)).toBeVisible({ timeout: timeoutMs })),
	);
}

/**
 * Asserts each device's locator becomes hidden within `timeoutMs`.
 * NOTE: This checks **eventual** non-visibility per device, not simultaneous.
 */
export async function assertAllDevicesHide(
	devices: SyncDevice[],
	locatorForPage: (p: Page) => Locator,
	timeoutMs = 15000,
) {
	await Promise.all(
		devices.map((d) => expect(locatorForPage(d.page)).not.toBeVisible({ timeout: timeoutMs })),
	);
}

/**
 * Extract the most recent syncIndex the device has seen in any log line.
 *
 * The player emits two flavours of sync log:
 *  - `logDebug(...)` — substitutes inline, yielding literal "syncIndex=3".
 *  - `debug(...)` (npm) + Playwright's msg.text() — preserves the raw format,
 *    so "syncIndex=%d" survives with the numeric value appearing later in the
 *    arg tail. The master side uses this path for "Broadcasted sync message"
 *    and the [syncGroup] "received" lines.
 *
 * Master-side lines we can still mine:
 *  - "Broadcasted sync message: type=%s, region=%s, syncIndex=%d, priorityBounds=%s"
 *    → tail: "... <region> <syncIndex> [<min>-<max>]" — match "(\\d+) \\[[\\d-]+\\]".
 *  - "Master received all %s ACKs for %s" where the second arg has form
 *    "<region>-<syncIndex>-ack-<type>" — match "-(\\d+)-ack-".
 *  - ACK / coordination keys like "...-<syncIndex>-ack-finished" in slaves too.
 */
const SYNC_INDEX_PATTERNS: RegExp[] = [
	/\bsyncIndex=(\d+)\b/, // literal (timedDebug)
	/-(\d+)-ack-(?:prepared|playing|finished)\b/, // ACK key used by both roles
	/Broadcasted sync message:.*?\s(\d+)\s\[[\d-]+\]/, // master broadcast arg tail
];

export function getLatestSyncIndex(dev: SyncDevice): number | null {
	const msgs = dev.console.messages;
	for (let i = msgs.length - 1; i >= 0; i--) {
		for (const p of SYNC_INDEX_PATTERNS) {
			const m = msgs[i].text.match(p);
			if (m) return parseInt(m[1], 10);
		}
	}
	return null;
}

/**
 * Poll all devices until every one reports the same syncIndex, or timeout.
 * Returns the agreed index and the measured controller-side skew — how many
 * ms elapsed between the first and last device landing on that value.
 *
 * Implementation: snapshot each device's `getLatestSyncIndex` every `pollMs`;
 * once all match, walk backwards through each device's console to find the
 * first message where that index appeared and use its timestamp for skew.
 */
export async function waitForSyncIndexAgreement(
	devices: SyncDevice[],
	opts: { timeoutMs?: number; pollMs?: number } = {},
): Promise<{ syncIndex: number; skewMs: number; firstSeenTs: number[] }> {
	const { timeoutMs = 30_000, pollMs = 200 } = opts;
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const values = devices.map((d) => getLatestSyncIndex(d));
		if (values.every((v) => v !== null) && values.every((v) => v === values[0])) {
			const target = values[0] as number;
			const extract = (text: string): number | null => {
				for (const p of SYNC_INDEX_PATTERNS) {
					const m = text.match(p);
					if (m) return parseInt(m[1], 10);
				}
				return null;
			};
			const firstSeenTs = devices.map((d) => {
				const hit = d.console.messages.find((m) => extract(m.text) === target);
				return hit ? hit.time : Date.now();
			});
			const minTs = Math.min(...firstSeenTs);
			const maxTs = Math.max(...firstSeenTs);
			return { syncIndex: target, skewMs: maxTs - minTs, firstSeenTs };
		}
		await new Promise((r) => setTimeout(r, pollMs));
	}
	const snapshot = devices.map((d, i) => `dev${i}: syncIndex=${getLatestSyncIndex(d)}`).join(', ');
	throw new Error(`Devices did not agree on syncIndex within ${timeoutMs}ms. Last: ${snapshot}`);
}

/**
 * A named DOM-element candidate that can be checked for current visibility on a
 * given device. Used by `getVisibleElement` to build the rendered-state half of
 * the (syncIndex, visibleElement) snapshot.
 */
export interface ElementCandidate {
	name: string;
	locator: (p: Page) => Locator;
}

/**
 * Snapshot helper: returns the *names* of currently-visible candidates on the
 * page, joined with `+` if more than one is visible (briefly possible during a
 * transition where the new element mounts before the old hides). Returns null
 * if none are visible. Uses `isVisible()` (immediate; no polling) so it's safe
 * to call inside a tight snapshot loop.
 */
export async function getVisibleElement(
	page: Page,
	candidates: ElementCandidate[],
): Promise<string | null> {
	const results = await Promise.all(
		candidates.map(async (c) => ({
			name: c.name,
			visible: await c.locator(page).first().isVisible().catch(() => false),
		})),
	);
	const visible = results.filter((r) => r.visible).map((r) => r.name);
	if (visible.length === 0) return null;
	return visible.join('+');
}

export function countSyncEvents(dev: SyncDevice, pattern: RegExp): number {
	return dev.console.messages.filter((m) => pattern.test(m.text)).length;
}

/**
 * Returns true if ANY matching line appears in either `errors` or `messages`.
 * Despite the name, this searches logs at every level — use for "did this string
 * ever appear in the console" assertions regardless of log level.
 */
export function hasConsoleError(dev: SyncDevice, pattern: RegExp): boolean {
	return (
		dev.console.errors.some((e) => pattern.test(e)) ||
		dev.console.messages.some((m) => pattern.test(m.text))
	);
}

/**
 * Poll until every device's locator is visible simultaneously. Used to prove
 * master/slave converge to the same element. Loose check — does NOT measure
 * skew. Use `assertSynchronizedTransition` when you need to bound the gap.
 */
export async function waitForConvergence(
	devices: SyncDevice[],
	locatorForPage: (p: Page) => Locator,
	timeoutMs = 30000,
) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const all = await Promise.all(devices.map((d) => locatorForPage(d.page).isVisible().catch(() => false)));
		if (all.every(Boolean)) return;
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error(
		`Devices never converged within ${timeoutMs}ms.\nPer-device last messages:\n` +
			devices
				.map((d, i) => `dev${i}:\n${d.console.messages.slice(-10).map((m) => m.text).join('\n')}`)
				.join('\n\n'),
	);
}

export interface TransitionSkew {
	/** Controller-side wall-clock time each device reported the locator visible. */
	timestamps: number[];
	/** max(timestamps) - min(timestamps), the measured drift between devices. */
	skewMs: number;
	minTs: number;
	maxTs: number;
}

/**
 * Start `waitFor({ state: 'visible' })` concurrently on every device and
 * record `Date.now()` on each resolution. The spread across devices is the
 * observed sync drift. Call with a locator that is NOT yet visible — this
 * measures the transition into visibility, not the steady state.
 *
 * Measurement has some jitter from Playwright's internal ~100ms polling plus
 * websocket round-trip; that jitter is roughly symmetric across devices so
 * for tolerances ≥ ~500ms the measurement is meaningful.
 */
export async function measureTransitionSkew(
	devices: SyncDevice[],
	locatorForPage: (p: Page) => Locator,
	timeoutMs = 60000,
): Promise<TransitionSkew> {
	const timestamps = await Promise.all(
		devices.map(async (d) => {
			await locatorForPage(d.page).waitFor({ state: 'visible', timeout: timeoutMs });
			return Date.now();
		}),
	);
	const minTs = Math.min(...timestamps);
	const maxTs = Math.max(...timestamps);
	return { timestamps, skewMs: maxTs - minTs, minTs, maxTs };
}

/**
 * Measure a transition and fail if skew exceeds `maxSkewMs`. Returns the
 * measured TransitionSkew so the caller can log or aggregate it.
 */
export async function assertSynchronizedTransition(
	devices: SyncDevice[],
	locatorForPage: (p: Page) => Locator,
	opts: { maxSkewMs?: number; timeoutMs?: number; label?: string } = {},
): Promise<TransitionSkew> {
	const { maxSkewMs = 500, timeoutMs = 60000, label = 'transition' } = opts;
	const result = await measureTransitionSkew(devices, locatorForPage, timeoutMs);
	const offsets = result.timestamps.map((t) => t - result.minTs).join('ms, ');
	if (result.skewMs > maxSkewMs) {
		throw new Error(
			`Sync skew for "${label}" was ${result.skewMs}ms, exceeds tolerance ${maxSkewMs}ms. ` +
				`Per-device offsets from first: [${offsets}ms].`,
		);
	}
	return result;
}

// ============================================================================
// WebSocket cross-device assertions (calibrated 2026-04-13).
//
// Wire format on the sync server is Socket.IO over WebSocket. Application
// frames are `42[<event>, <args>]`. Outbound and inbound use different shapes:
//   sender → server:   42["request_set_value", { groupName, key, value }]
//   server → receiver: 42["set_value", "groupName", "key", { ... }]
// The inner `value` object is byte-identical end-to-end. Engine.IO control
// frames ("2probe", "5", …) and server-pushed `device_status` events are
// filtered out before any application processing.
//
// Correlation key for cross-device matching: (value.type, value.syncIndex,
// value.timestamp). value.timestamp is producer-side ms and unique per
// broadcast.
// ============================================================================

/** Inner sync-coordination payload — the `value` object from a Socket.IO frame.
 * Kept loose because the sync library is closed-source and the schema may grow. */
interface SyncValue {
	type: string;
	regionName?: string;
	syncIndex?: number;
	timestamp?: number;
	priorityLevel?: number;
	priorityMinSyncIndex?: number;
	priorityMaxSyncIndex?: number;
	[key: string]: unknown;
}

/** A parsed sync application frame. `null` for frames that aren't application
 * traffic (Engine.IO probes, device_status, malformed JSON). */
interface ParsedSyncFrame {
	frame: WsFrame;
	event: string;            // "request_set_value" | "set_value"
	value: SyncValue;
}

/** Stable correlation key for matching one logical broadcast across devices. */
function broadcastKey(v: SyncValue): string {
	return `${v.type}|${v.syncIndex ?? '?'}|${v.timestamp ?? '?'}`;
}

/** Parse a captured WS frame into a sync application frame, or null if it's
 * a non-application frame (Engine.IO probe, device_status, malformed). */
function parseSyncFrame(frame: WsFrame): ParsedSyncFrame | null {
	if (frame.isBinary) return null;
	const text = frame.payload;
	if (!text.startsWith('42[')) return null; // Engine.IO control frame
	let parsed: unknown;
	try {
		// Socket.IO event packet format: "42" prefix + JSON-array body.
		parsed = JSON.parse(text.slice(2));
	} catch {
		return null;
	}
	if (!Array.isArray(parsed) || typeof parsed[0] !== 'string') return null;
	const event = parsed[0];
	if (event === 'request_set_value') {
		// [event, { groupName, key, value }]
		const obj = parsed[1] as { value?: SyncValue } | undefined;
		if (!obj || typeof obj.value !== 'object' || obj.value === null) return null;
		if (typeof (obj.value as SyncValue).type !== 'string') return null;
		return { frame, event, value: obj.value as SyncValue };
	}
	if (event === 'set_value') {
		// [event, "groupName", "key", { ... }]
		const value = parsed[3] as SyncValue | undefined;
		if (!value || typeof value !== 'object' || typeof value.type !== 'string') return null;
		return { frame, event, value };
	}
	// device_status, connect/disconnect, etc — not application broadcasts.
	return null;
}

/** All parsed application frames on a device, in capture order. */
function parsedFrames(dev: SyncDevice): ParsedSyncFrame[] {
	const out: ParsedSyncFrame[] = [];
	for (const f of dev.wsFrames) {
		const p = parseSyncFrame(f);
		if (p !== null) out.push(p);
	}
	return out;
}

/** Per-device counts of sync-coordination message types, split by direction.
 * Drives `assertSyncMessageInventory`. */
export function categorizeWsFrames(dev: SyncDevice): Map<string, { sent: number; received: number }> {
	const out = new Map<string, { sent: number; received: number }>();
	for (const p of parsedFrames(dev)) {
		const slot = out.get(p.value.type) ?? { sent: 0, received: 0 };
		if (p.frame.direction === 'sent') slot.sent++;
		else slot.received++;
		out.set(p.value.type, slot);
	}
	return out;
}

interface FrameCountSymmetryOptions {
	/** Max allowed spread (max - min) between slave received counts.
	 * Default `Math.max(10, 0.10 * mean)` per calibration. */
	slaveReceivedMaxSpread?: (mean: number) => number;
	/** Max allowed spread between slave sent counts. Default
	 * `Math.max(10, 0.25 * mean)` (slave sent counts are smaller, so wider). */
	slaveSentMaxSpread?: (mean: number) => number;
	/** Index of the master device in `devices`. Defaults to 0 (first-launched
	 * device wins master election in `createSyncGroup`'s staggered launch). */
	masterIndex?: number;
}

/** Assert per-device WebSocket frame counts cluster as expected for one master
 * and N-1 slaves. Counts only application sync frames (excludes Engine.IO
 * probes and `device_status` events). */
export function assertFrameCountSymmetry(
	devices: SyncDevice[],
	opts: FrameCountSymmetryOptions = {},
): void {
	const masterIndex = opts.masterIndex ?? 0;
	const slaveRecvSpread = opts.slaveReceivedMaxSpread ?? ((mean) => Math.max(10, 0.10 * mean));
	const slaveSentSpread = opts.slaveSentMaxSpread ?? ((mean) => Math.max(10, 0.25 * mean));

	const counts = devices.map((d) => {
		const parsed = parsedFrames(d);
		return {
			deviceId: d.deviceId,
			sent: parsed.filter((p) => p.frame.direction === 'sent').length,
			received: parsed.filter((p) => p.frame.direction === 'received').length,
		};
	});
	const slaveCounts = counts.filter((_, i) => i !== masterIndex);

	const slaveRecvMean = slaveCounts.reduce((s, c) => s + c.received, 0) / slaveCounts.length;
	const slaveRecvMax = Math.max(...slaveCounts.map((c) => c.received));
	const slaveRecvMin = Math.min(...slaveCounts.map((c) => c.received));
	const slaveRecvAllowed = slaveRecvSpread(slaveRecvMean);
	expect(
		slaveRecvMax - slaveRecvMin,
		`slave received-count spread ${slaveRecvMax - slaveRecvMin} > allowed ${slaveRecvAllowed.toFixed(1)} ` +
			`(counts: ${JSON.stringify(counts)})`,
	).toBeLessThanOrEqual(slaveRecvAllowed);

	const slaveSentMean = slaveCounts.reduce((s, c) => s + c.sent, 0) / slaveCounts.length;
	const slaveSentMax = Math.max(...slaveCounts.map((c) => c.sent));
	const slaveSentMin = Math.min(...slaveCounts.map((c) => c.sent));
	const slaveSentAllowed = slaveSentSpread(slaveSentMean);
	expect(
		slaveSentMax - slaveSentMin,
		`slave sent-count spread ${slaveSentMax - slaveSentMin} > allowed ${slaveSentAllowed.toFixed(1)} ` +
			`(counts: ${JSON.stringify(counts)})`,
	).toBeLessThanOrEqual(slaveSentAllowed);
}

/** Assert the protocol shape using per-type counts: master sends `cmd-*`
 * messages; each slave sends matching ACKs; master's received-ACK count
 * approximates `(devices.length - 1) × master's sent cmd count`. */
export function assertSyncMessageInventory(
	devices: SyncDevice[],
	opts: { masterIndex?: number; ackCountTolerancePct?: number } = {},
): void {
	const masterIndex = opts.masterIndex ?? 0;
	const tolerancePct = opts.ackCountTolerancePct ?? 0.25;
	const slaves = devices.filter((_, i) => i !== masterIndex);

	const masterCats = categorizeWsFrames(devices[masterIndex]);
	const cmdTypes = ['cmd-prepare', 'cmd-play', 'cmd-finish'] as const;
	const ackTypes = ['ack-prepared', 'ack-playing', 'ack-finished'] as const;

	let masterCmdSent = 0;
	for (const t of cmdTypes) masterCmdSent += masterCats.get(t)?.sent ?? 0;
	expect(masterCmdSent, `master sent zero cmd-* frames (cats: ${[...masterCats]})`).toBeGreaterThan(0);

	for (const dev of slaves) {
		const cats = categorizeWsFrames(dev);
		let slaveAckSent = 0;
		for (const t of ackTypes) slaveAckSent += cats.get(t)?.sent ?? 0;
		expect(slaveAckSent, `slave ${dev.deviceId} sent zero ack-* frames (cats: ${[...cats]})`).toBeGreaterThan(0);
	}

	let masterAckRecv = 0;
	for (const t of ackTypes) masterAckRecv += masterCats.get(t)?.received ?? 0;
	const expectedAckRecv = masterCmdSent * slaves.length;
	const lower = expectedAckRecv * (1 - tolerancePct);
	const upper = expectedAckRecv * (1 + tolerancePct);
	expect(
		masterAckRecv >= lower && masterAckRecv <= upper,
		`master received ${masterAckRecv} ACKs but expected ~${expectedAckRecv} (${slaves.length} slaves × ` +
			`${masterCmdSent} cmd, ±${(tolerancePct * 100).toFixed(0)} %)`,
	).toBe(true);
}

/**
 * Per-device, per-key list of received frames (in arrival order). All frame
 * events on a given Socket.IO connection are FIFO-ordered, so the Nth-of-key-K
 * inbound on every receiver corresponds to the same logical broadcast even
 * when multiple senders happen to broadcast frames whose `(type, syncIndex,
 * timestamp)` collide on the same millisecond — a real case observed for
 * `ack-prepared` when two slaves ACK the same cmd in lockstep.
 */
function receivedFramesByKey<T>(
	devices: SyncDevice[],
	pick: (p: ParsedSyncFrame) => T,
): Array<{ deviceId: string; map: Map<string, T[]> }> {
	return devices.map((d) => {
		const map = new Map<string, T[]>();
		for (const p of parsedFrames(d)) {
			if (p.frame.direction !== 'received') continue;
			if (p.value.timestamp === undefined) continue;
			const k = broadcastKey(p.value);
			const list = map.get(k) ?? [];
			list.push(pick(p));
			map.set(k, list);
		}
		return { deviceId: d.deviceId, map };
	});
}

/** Assert per-broadcast receipt-time spread across receivers stays within
 * `maxSpreadMs`. For each broadcast key K, compares the Nth-of-K arrival
 * timestamp on every receiver that observed at least N frames for that key.
 * Skips ordinals where fewer than 2 receivers have an Nth occurrence. */
export function assertBroadcastReceiptSpread(
	devices: SyncDevice[],
	opts: { maxSpreadMs?: number } = {},
): void {
	const maxSpreadMs = opts.maxSpreadMs ?? 1000;
	const perDevice = receivedFramesByKey(devices, (p) => p.frame.timestamp);

	const allKeys = new Set<string>();
	for (const { map } of perDevice) for (const k of map.keys()) allKeys.add(k);

	const violations: string[] = [];
	for (const key of allKeys) {
		const lists = perDevice
			.map(({ deviceId, map }) => ({ deviceId, ts: map.get(key) ?? [] }))
			.filter((l) => l.ts.length > 0);
		if (lists.length < 2) continue;
		const minCount = Math.min(...lists.map((l) => l.ts.length));
		for (let i = 0; i < minCount; i++) {
			const tss = lists.map((l) => l.ts[i]);
			const spread = Math.max(...tss) - Math.min(...tss);
			if (spread > maxSpreadMs) {
				violations.push(
					`broadcast ${key} #${i} receipt spread ${spread}ms > ${maxSpreadMs}ms ` +
						`(devices: ${lists.map((l) => `${l.deviceId}=${l.ts[i]}`).join(', ')})`,
				);
			}
		}
	}

	expect(
		violations.length,
		`${violations.length} broadcast(s) violated receipt-time spread:\n  ` + violations.slice(0, 10).join('\n  '),
	).toBe(0);
}

/** Assert that for each broadcast received by ≥ 2 devices, their received
 * `value` payloads are byte-identical. Uses ordinal-within-key matching
 * (Nth-of-K on each receiver corresponds to the same logical broadcast,
 * because Socket.IO frame order is preserved per receiver and the server
 * broadcasts in a serialised order). The inner `value` object is byte-
 * identical end-to-end per calibration; no normalisation needed. */
export function assertFrameContentEquality(devices: SyncDevice[]): void {
	const perDevice = receivedFramesByKey(devices, (p) => p.value);

	const allKeys = new Set<string>();
	for (const { map } of perDevice) for (const k of map.keys()) allKeys.add(k);

	const violations: string[] = [];
	for (const key of allKeys) {
		const lists = perDevice
			.map(({ deviceId, map }) => ({ deviceId, vals: map.get(key) ?? [] }))
			.filter((l) => l.vals.length > 0);
		if (lists.length < 2) continue;
		const minCount = Math.min(...lists.map((l) => l.vals.length));
		for (let i = 0; i < minCount; i++) {
			const refJson = JSON.stringify(lists[0].vals[i]);
			for (let j = 1; j < lists.length; j++) {
				const otherJson = JSON.stringify(lists[j].vals[i]);
				if (otherJson !== refJson) {
					violations.push(
						`broadcast ${key} #${i}: ${lists[0].deviceId} and ${lists[j].deviceId} differ\n` +
							`    ${lists[0].deviceId}: ${refJson}\n` +
							`    ${lists[j].deviceId}: ${otherJson}`,
					);
				}
			}
		}
	}

	expect(
		violations.length,
		`${violations.length} broadcast(s) had non-identical content across receivers:\n  ` +
			violations.slice(0, 5).join('\n  '),
	).toBe(0);
}
