import { expect, Locator, Page } from '@playwright/test';
import { SyncDevice } from '../syncHelpers';

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
