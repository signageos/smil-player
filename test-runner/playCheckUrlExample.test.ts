import { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { getStableAppletFrame } from './helpers';
import { getFileName } from '../src/components/files/tools/fileName';

const EMULATOR_URL = 'http://localhost:8090';

/**
 * Verifies the published playCheckUrl example (docs/superpowers/examples/playcheckurl-gate.smil)
 * end-to-end via its localhost twin (test-server/testFiles/playCheckUrlExample.smil):
 * a plain two-zone playlist (no prefetch/loader scaffolding) where a campaign video (main,
 * default fail mode), an exclusive image (main, playCheckSkipOnError="true") and a campaign
 * banner (bottom) each carry their own gate URL and rotate alongside ungated
 * evergreen/fallback content.
 *
 * Covered: happy path (all content plays, gates consulted per pass), every listed
 * status (403/404/410) gating with automatic recovery — including listed-status
 * precedence over playCheckSkipOnError — gate closed from boot, unlisted 5xx + 204
 * fail-open/play vs strict skip, gate timeout (delay > <meta timeOut> = 2000 ms:
 * default fails open, strict skips), and zone independence (a closed banner gate
 * never darkens the bottom zone nor disturbs the main zone).
 *
 * Videos live on the MAIN page (sos.video), images inside the applet iframe — hence the
 * two probes. A prepared-but-not-started video can already carry src, so the video probe
 * requires `!paused`.
 */

/**
 * The player stores media under checksummed local filenames whose stem is truncated to
 * 10 chars (`video-test-1.mp4` → `video-test_4021568b.mp4`) — see getFileName. Matching
 * by original basename therefore silently misses; compute the exact on-disk names from
 * the SAME URLs the (port-rewritten) fixture serves, keyed by friendly name.
 */
function mediaFileNames(baseUrl: string): Record<string, string> {
	return {
		'video-test-1': getFileName(`${baseUrl}/assets/video-test-1.mp4`),
		'video-test-2': getFileName(`${baseUrl}/assets/video-test-2.mp4`),
		exclusive: getFileName(`${baseUrl}/assets/img_2.jpg`),
		landscape1: getFileName(`${baseUrl}/assets/landscape1.jpg`),
		landscape2: getFileName(`${baseUrl}/assets/landscape2.jpg`),
		img_1: getFileName(`${baseUrl}/assets/img_1.jpg`),
	};
}

/** Friendly names of videos currently PLAYING on the main page. */
async function getPlayingVideoNames(page: Page, names: Record<string, string>): Promise<Set<string>> {
	const playingSrcs = await page.evaluate(() => {
		const out: string[] = [];
		document.querySelectorAll('video').forEach((v) => {
			const src = v.getAttribute('src') ?? '';
			if (src && !v.paused) {
				out.push(src);
			}
		});
		return out;
	});
	const seen = new Set<string>();
	for (const [name, fileName] of Object.entries(names)) {
		if (playingSrcs.some((src) => src.includes(fileName))) seen.add(name);
	}
	return seen;
}

/** Friendly names of all images currently visible in any applet frame. */
async function getVisibleImageNames(page: Page, names: Record<string, string>): Promise<Set<string>> {
	const seen = new Set<string>();
	for (const frame of page.frames()) {
		if (frame === page.mainFrame()) continue;
		try {
			const imgs = await frame.locator('img').all();
			for (const img of imgs) {
				if (await img.isVisible({ timeout: 500 })) {
					const src = (await img.getAttribute('src')) ?? '';
					for (const [name, fileName] of Object.entries(names)) {
						if (src.includes(fileName)) seen.add(name);
					}
				}
			}
		} catch {
			// frame detached
		}
	}
	return seen;
}

/** Sample both probes every 500ms for windowMs; returns the union of names seen. */
async function collectMedia(page: Page, names: Record<string, string>, windowMs: number): Promise<Set<string>> {
	const seen = new Set<string>();
	const deadline = Date.now() + windowMs;
	while (Date.now() < deadline) {
		for (const name of await getPlayingVideoNames(page, names)) seen.add(name);
		for (const name of await getVisibleImageNames(page, names)) seen.add(name);
		await new Promise((r) => setTimeout(r, 500));
	}
	return seen;
}

/** Poll until every expected name has been observed at least once. */
async function waitForAll(
	page: Page,
	names: Record<string, string>,
	expected: string[],
	timeoutMs: number,
): Promise<Set<string>> {
	const seen = new Set<string>();
	await expect(async () => {
		for (const name of await getPlayingVideoNames(page, names)) seen.add(name);
		for (const name of await getVisibleImageNames(page, names)) seen.add(name);
		const missing = expected.filter((name) => !seen.has(name));
		if (missing.length > 0) {
			throw new Error(`still waiting for: ${missing.join(', ')} (seen: ${[...seen].join(', ') || 'none'})`);
		}
	}).toPass({ intervals: [500], timeout: timeoutMs });
	return seen;
}

async function gateRequestCount(page: Page, baseUrl: string, name: string): Promise<number> {
	const resp = await page.request.get(`${baseUrl}/gate/head-log`);
	const log: { file: string; time: number }[] = await resp.json();
	return log.filter((entry) => entry.file === name).length;
}

/** Reset gate state, clear emulator IndexedDB, and boot the player on the example twin. */
async function resetAndBoot(page: Page, baseUrl: string) {
	await page.request.post(`${baseUrl}/gate/reset`);

	await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });
	await page.evaluate(async () => {
		const dbs = await indexedDB.databases();
		for (const db of dbs) {
			if (db.name) indexedDB.deleteDatabase(db.name);
		}
	});
	await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });
	await getStableAppletFrame(page);
}

// One full main cycle = video-test-1 + video-test-2 + 5s exclusive image + 5s evergreen
// image; windows below assume the videos are short test clips (empirically ≲ 30s per
// cycle). NOT_SEEN windows cover >1.5 cycles so a drop-out is a real gate decision, not
// a sampling gap.
const NOT_SEEN_WINDOW_MS = 50000;
const SEEN_TIMEOUT_MS = 90000;
const DRAIN_MS = 35000; // let the in-flight pass (possibly mid-video) finish after flipping a gate

test.describe('playCheckUrl example playlist', () => {
	test('happy path: plain two-zone example plays everything with gates open, gates consulted per pass', async ({
		context,
		page,
		testServerBaseUrl,
	}) => {
		test.setTimeout(300000);
		await context.addInitScript(`window.__SMIL_URL__ = '${testServerBaseUrl}/playCheckUrlExample.smil';`);
		const names = mediaFileNames(testServerBaseUrl);
		await resetAndBoot(page, testServerBaseUrl);

		// Every element of the example must appear: both videos (campaign gated, gate open),
		// the strict-gated exclusive image, the evergreen image, the gated banner, and the
		// fallback banner.
		const seen = await waitForAll(
			page,
			names,
			['video-test-1', 'video-test-2', 'exclusive', 'landscape1', 'landscape2', 'img_1'],
			240000,
		);
		console.log(`[example happy path] media seen: ${[...seen].join(', ')}`);

		// All three gates were consulted at least once per played pass.
		expect(await gateRequestCount(page, testServerBaseUrl, 'campaign')).toBeGreaterThanOrEqual(1);
		expect(await gateRequestCount(page, testServerBaseUrl, 'exclusive')).toBeGreaterThanOrEqual(1);
		expect(await gateRequestCount(page, testServerBaseUrl, 'campaign-banner')).toBeGreaterThanOrEqual(1);

		await page.request.post(`${testServerBaseUrl}/gate/reset`);
	});

	test('gate closed from boot (404): campaign video never plays, rotation runs, reopening recovers it', async ({
		context,
		page,
		testServerBaseUrl,
	}) => {
		test.setTimeout(300000);
		await context.addInitScript(`window.__SMIL_URL__ = '${testServerBaseUrl}/playCheckUrlExample.smil';`);
		const names = mediaFileNames(testServerBaseUrl);
		await page.request.post(`${testServerBaseUrl}/gate/reset`);
		// Close the campaign gate BEFORE the player ever boots.
		await page.request.post(`${testServerBaseUrl}/gate/skip-mode/campaign`);

		await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });
		await page.evaluate(async () => {
			const dbs = await indexedDB.databases();
			for (const db of dbs) {
				if (db.name) indexedDB.deleteDatabase(db.name);
			}
		});
		await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });
		await getStableAppletFrame(page);

		// The rest of the playlist must come up normally around the closed gate.
		await waitForAll(page, names, ['video-test-1', 'landscape1', 'landscape2', 'img_1'], 240000);

		const closedSeen = await collectMedia(page, names, NOT_SEEN_WINDOW_MS);
		console.log(`[closed at boot] media seen: ${[...closedSeen].join(', ')}`);
		expect(closedSeen.has('video-test-2')).toBe(false);
		expect(closedSeen.has('video-test-1')).toBe(true);
		expect(closedSeen.has('landscape1')).toBe(true);

		// Per-pass recovery requests kept flowing while closed.
		expect(await gateRequestCount(page, testServerBaseUrl, 'campaign')).toBeGreaterThanOrEqual(2);

		// Reopen: the campaign video joins the rotation with no restart.
		await page.request.post(`${testServerBaseUrl}/gate/skip-mode/campaign?on=0`);
		await waitForAll(page, names, ['video-test-2'], SEEN_TIMEOUT_MS + DRAIN_MS);
		console.log('[closed at boot] campaign video recovered after reopen');

		await page.request.post(`${testServerBaseUrl}/gate/reset`);
	});

	test('listed statuses 403 and 410 gate the campaign video; recovery in between', async ({
		context,
		page,
		testServerBaseUrl,
	}) => {
		test.setTimeout(420000);
		await context.addInitScript(`window.__SMIL_URL__ = '${testServerBaseUrl}/playCheckUrlExample.smil';`);
		const names = mediaFileNames(testServerBaseUrl);
		await resetAndBoot(page, testServerBaseUrl);
		await waitForAll(page, names, ['video-test-2'], 240000);

		// 403 (listed) gates — for the default-mode campaign AND the strict exclusive
		// image alike: a listed status always skips, playCheckSkipOnError changes nothing.
		await page.request.post(`${testServerBaseUrl}/gate/status-override/campaign?status=403`);
		await page.request.post(`${testServerBaseUrl}/gate/status-override/exclusive?status=403`);
		await new Promise((r) => setTimeout(r, DRAIN_MS));
		const seen403 = await collectMedia(page, names, NOT_SEEN_WINDOW_MS);
		console.log(`[403] media seen: ${[...seen403].join(', ')}`);
		expect(seen403.has('video-test-2')).toBe(false);
		expect(seen403.has('exclusive')).toBe(false);
		expect(seen403.has('video-test-1')).toBe(true);

		// Clear the overrides: recovery.
		await page.request.post(`${testServerBaseUrl}/gate/status-override/campaign?status=0`);
		await page.request.post(`${testServerBaseUrl}/gate/status-override/exclusive?status=0`);
		await waitForAll(page, names, ['video-test-2', 'exclusive'], SEEN_TIMEOUT_MS + DRAIN_MS);
		console.log('[403 cleared] campaign video and exclusive image recovered');

		// 410 (listed) gates.
		await page.request.post(`${testServerBaseUrl}/gate/status-override/campaign?status=410`);
		await new Promise((r) => setTimeout(r, DRAIN_MS));
		const seen410 = await collectMedia(page, names, NOT_SEEN_WINDOW_MS);
		console.log(`[410] media seen: ${[...seen410].join(', ')}`);
		expect(seen410.has('video-test-2')).toBe(false);
		expect(seen410.has('video-test-1')).toBe(true);

		await page.request.post(`${testServerBaseUrl}/gate/reset`);
	});

	test('unlisted 500/204 and gate timeout: default fails open, strict skips; closed banner gate never darkens its zone', async ({
		context,
		page,
		testServerBaseUrl,
	}) => {
		test.setTimeout(600000);
		await context.addInitScript(`window.__SMIL_URL__ = '${testServerBaseUrl}/playCheckUrlExample.smil';`);
		const names = mediaFileNames(testServerBaseUrl);
		await resetAndBoot(page, testServerBaseUrl);
		await waitForAll(page, names, ['video-test-2', 'exclusive', 'landscape2', 'img_1'], 240000);

		// 500 is NOT listed: the default-mode campaign video fails open and keeps playing,
		// the strict exclusive image (playCheckSkipOnError="true") skips.
		await page.request.post(`${testServerBaseUrl}/gate/status-override/campaign?status=500`);
		await page.request.post(`${testServerBaseUrl}/gate/status-override/exclusive?status=500`);
		await new Promise((r) => setTimeout(r, DRAIN_MS));
		const seen500 = await collectMedia(page, names, NOT_SEEN_WINDOW_MS);
		console.log(`[500] media seen: ${[...seen500].join(', ')}`);
		expect(seen500.has('video-test-2')).toBe(true);
		expect(seen500.has('exclusive')).toBe(false);

		// 204 (the recommended "play" answer) plays in BOTH modes — strict only flips
		// transport errors and unlisted 5xx, never unlisted non-5xx.
		await page.request.post(`${testServerBaseUrl}/gate/status-override/campaign?status=204`);
		await page.request.post(`${testServerBaseUrl}/gate/status-override/exclusive?status=204`);
		await new Promise((r) => setTimeout(r, DRAIN_MS));
		const seen204 = await collectMedia(page, names, NOT_SEEN_WINDOW_MS);
		console.log(`[204] media seen: ${[...seen204].join(', ')}`);
		expect(seen204.has('video-test-2')).toBe(true);
		expect(seen204.has('exclusive')).toBe(true);
		await page.request.post(`${testServerBaseUrl}/gate/status-override/campaign?status=0`);
		await page.request.post(`${testServerBaseUrl}/gate/status-override/exclusive?status=0`);

		// Gate timeout: both gates hang for 5 s while <meta timeOut> is 2000 ms, so every
		// gate GET times out — a transport error. Default mode fails open (campaign plays),
		// strict mode skips (exclusive drops out). The head-log proves the gates were
		// consulted and timed out rather than never asked.
		await page.request.post(`${testServerBaseUrl}/gate/delay/campaign?ms=5000`);
		await page.request.post(`${testServerBaseUrl}/gate/delay/exclusive?ms=5000`);
		await page.request.post(`${testServerBaseUrl}/gate/clear-head-log`);
		await new Promise((r) => setTimeout(r, DRAIN_MS));
		const seenTimeout = await collectMedia(page, names, NOT_SEEN_WINDOW_MS);
		console.log(`[timeout] media seen: ${[...seenTimeout].join(', ')}`);
		expect(seenTimeout.has('video-test-2')).toBe(true);
		expect(seenTimeout.has('exclusive')).toBe(false);
		expect(await gateRequestCount(page, testServerBaseUrl, 'campaign')).toBeGreaterThanOrEqual(1);
		expect(await gateRequestCount(page, testServerBaseUrl, 'exclusive')).toBeGreaterThanOrEqual(1);
		// Gates answer instantly again: the exclusive image recovers.
		await page.request.post(`${testServerBaseUrl}/gate/delay/campaign?ms=0`);
		await page.request.post(`${testServerBaseUrl}/gate/delay/exclusive?ms=0`);
		await waitForAll(page, names, ['exclusive'], SEEN_TIMEOUT_MS + DRAIN_MS);
		console.log('[timeout cleared] exclusive image recovered');

		// Zone independence: close ONLY the banner gate. The fallback banner keeps the
		// bottom zone alive in both window halves, and the main zone is untouched.
		await page.request.post(`${testServerBaseUrl}/gate/skip-mode/campaign-banner`);
		await new Promise((r) => setTimeout(r, DRAIN_MS));
		await page.request.post(`${testServerBaseUrl}/gate/clear-head-log`);

		const firstHalf = await collectMedia(page, names, NOT_SEEN_WINDOW_MS / 2);
		const secondHalf = await collectMedia(page, names, NOT_SEEN_WINDOW_MS / 2);
		const union = new Set([...firstHalf, ...secondHalf]);
		console.log(`[banner gated] first half: ${[...firstHalf].join(', ')} | second half: ${[...secondHalf].join(', ')}`);
		expect(union.has('landscape2')).toBe(false);
		expect(firstHalf.has('img_1')).toBe(true);
		expect(secondHalf.has('img_1')).toBe(true);
		// Main zone unaffected by the bottom-zone gate.
		expect(union.has('video-test-1') || union.has('video-test-2')).toBe(true);
		// Banner gate is re-checked per pass while closed.
		expect(await gateRequestCount(page, testServerBaseUrl, 'campaign-banner')).toBeGreaterThanOrEqual(2);

		await page.request.post(`${testServerBaseUrl}/gate/reset`);
	});
});
