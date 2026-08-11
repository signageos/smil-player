import { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { getStableAppletFrame } from './helpers';
import { getFileName } from '../src/components/files/tools/fileName';

// `IDBFactory.databases()` exists at runtime in Chromium but is absent from the project's
// DOM lib typings (lib: es2017+dom). Augment the global interface so the call sites
// type-check without an `any` cast.
declare global {
	interface IDBFactory {
		databases(): Promise<{ name?: string; version?: number }[]>;
	}
}

const EMULATOR_URL = 'http://localhost:8090';

/**
 * playCheckUrl playability gate. The gate GETs a per-element URL right before each
 * play and skips the pass when the status is listed in <meta skipPlaybackOnHttpStatus>.
 * Fixtures rotate 3 images (3s each, full cycle 9s) with image2 gated via
 * /gate/check/image2 — a URL that never serves content, proving zero download coupling.
 * The skipOnError fixtures additionally rotate a gated main-page video (~3.4s, cycle ~13s).
 *
 * Windows: NOT_SEEN_WINDOW_MS covers >1.5 full cycles so "image2 never visible" is a
 * real drop-out, not a sampling gap; SEEN_WINDOW_MS covers >2 cycles for recovery.
 */
const CYCLE_MS = 9000;
const NOT_SEEN_WINDOW_MS = 15000;
const SEEN_WINDOW_MS = 20000;

// The skipOnError fixtures append a gated video-test-2.mp4 (~3.4s) to the 3-image
// rotation, stretching the full cycle to ~13s — hence their own, wider windows.
const SKIP_CYCLE_MS = 14000;
const SKIP_NOT_SEEN_WINDOW_MS = 22000;
const SKIP_SEEN_WINDOW_MS = 30000;
const SKIP_VIDEO = 'video-test-2.mp4';

/** Reset gate + cbp state, clear emulator IndexedDB, and boot the player fresh. */
async function resetAndBoot(page: Page, baseUrl: string) {
	await page.request.post(`${baseUrl}/gate/reset`);
	await page.request.post(`${baseUrl}/cbp/reset`);

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

/** Poll all iframes until an `image` <img> is visible (after prefetch + loader). */
async function waitForFirstImage(page: Page) {
	await expect(async () => {
		for (const frame of page.frames()) {
			if (frame === page.mainFrame()) continue;
			try {
				const img = frame.locator('img[src*="image"]').first();
				if (await img.isVisible({ timeout: 1000 })) return;
			} catch {
				// frame may be detached
			}
		}
		throw new Error('Image not visible in any frame');
	}).toPass({ intervals: [2000], timeout: 60000 });
}

/** Names (image1.png/…) of ALL currently visible images — a stale element can stay
 *  visible alongside newly painted content, so first-match sampling would mask it. */
async function getVisibleImageNames(page: Page): Promise<Set<string>> {
	const names = new Set<string>();
	for (const frame of page.frames()) {
		if (frame === page.mainFrame()) continue;
		try {
			const imgs = await frame.locator('img').all();
			for (const img of imgs) {
				if (await img.isVisible({ timeout: 500 })) {
					const src = await img.getAttribute('src');
					const match = src?.match(/\/(image(\d+))_[a-f0-9]+\.png/);
					if (match) names.add(`image${match[2]}.png`);
				}
			}
		} catch {
			// frame detached
		}
	}
	return names;
}

/** Name of the first currently visible image, or null. */
async function getVisibleImageName(page: Page): Promise<string | null> {
	const names = await getVisibleImageNames(page);
	return names.values().next().value ?? null;
}

/** Sample visible images every 500ms for windowMs; returns the union of names seen. */
async function collectVisibleImages(page: Page, windowMs: number): Promise<Set<string>> {
	const seen = new Set<string>();
	const deadline = Date.now() + windowMs;
	while (Date.now() < deadline) {
		for (const name of await getVisibleImageNames(page)) {
			seen.add(name);
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	return seen;
}

/** True when a main-page <video> with the given (checksummed) file name is actually
 *  playing. A prepared-but-not-started video can already carry src, hence `!paused`. */
async function isVideoPlaying(page: Page, fileName: string): Promise<boolean> {
	return page.evaluate((fn) => {
		const videos = Array.from(document.querySelectorAll('video'));
		return videos.some((v) => (v.getAttribute('src') ?? '').includes(fn) && !v.paused);
	}, fileName);
}

/** collectVisibleImages plus a main-page video probe: the returned set also contains
 *  SKIP_VIDEO whenever the gated video was caught playing during the window. */
async function collectVisibleMedia(page: Page, windowMs: number, videoFileName: string): Promise<Set<string>> {
	const seen = new Set<string>();
	const deadline = Date.now() + windowMs;
	while (Date.now() < deadline) {
		for (const name of await getVisibleImageNames(page)) {
			seen.add(name);
		}
		if (await isVideoPlaying(page, videoFileName)) {
			seen.add(SKIP_VIDEO);
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	return seen;
}

async function gateHeadCount(page: Page, baseUrl: string, name: string): Promise<number> {
	const resp = await page.request.get(`${baseUrl}/gate/head-log`);
	const log: { file: string; time: number }[] = await resp.json();
	return log.filter((e) => e.file === name).length;
}

test.describe('playCheckUrl playability gate', () => {
	test('standalone gate: skips while closed, re-checks per pass, recovers, fails open on 500, no PoP while gated', async ({
		context,
		page,
		testServerBaseUrl,
	}) => {
		test.setTimeout(240000);
		await context.addInitScript(`window.__SMIL_URL__ = '${testServerBaseUrl}/playCheckUrl.smil';`);
		await resetAndBoot(page, testServerBaseUrl);
		await waitForFirstImage(page);

		// (a) Gate open (200): all three images rotate.
		const openSeen = await collectVisibleImages(page, SEEN_WINDOW_MS);
		console.log(`[gate open] visible images: ${[...openSeen].join(', ')}`);
		expect(openSeen.has('image1.png')).toBe(true);
		expect(openSeen.has('image2.png')).toBe(true);
		expect(openSeen.has('image3.png')).toBe(true);
		// The gate is consulted before each image2 play.
		expect(await gateHeadCount(page, testServerBaseUrl, 'image2')).toBeGreaterThanOrEqual(1);

		// (b) Close the gate (404, listed): image2 drops out, siblings keep cycling,
		// and the gate keeps re-checking image2 every pass (no persistent skip state).
		await page.request.post(`${testServerBaseUrl}/gate/skip-mode/image2`);
		// Let the in-flight pass drain — image2 may legitimately show once more.
		await new Promise((r) => setTimeout(r, CYCLE_MS));
		const reportsBeforeGated = (await (await page.request.get(`${testServerBaseUrl}/report/history`)).json()).length;
		await page.request.post(`${testServerBaseUrl}/gate/clear-head-log`);

		const gatedSeen = await collectVisibleImages(page, NOT_SEEN_WINDOW_MS);
		console.log(`[gate closed] visible images: ${[...gatedSeen].join(', ')}`);
		expect(gatedSeen.has('image1.png')).toBe(true);
		expect(gatedSeen.has('image3.png')).toBe(true);
		expect(gatedSeen.has('image2.png')).toBe(false);

		// Per-pass recovery requests: with 2 remaining 3s slots + a ~100ms gate-skip pass,
		// each ~6s cycle re-checks image2 at least once.
		const gatedHeads = await gateHeadCount(page, testServerBaseUrl, 'image2');
		console.log(`[gate closed] image2 gate checks over ${NOT_SEEN_WINDOW_MS}ms: ${gatedHeads}`);
		expect(gatedHeads).toBeGreaterThanOrEqual(2);

		// (e) No media-playback report for image2 while gated (skip happens before any
		// playback/report path). Sibling reports may accumulate; image2's may not.
		const reportsAfterGated = await (await page.request.get(`${testServerBaseUrl}/report/history`)).json();
		const gatedWindowRecords: any[] = reportsAfterGated
			.slice(reportsBeforeGated)
			.flatMap((r: any) => (Array.isArray(r.body) ? r.body : [r.body]));
		const image2Playbacks = gatedWindowRecords.filter(
			(rec: any) => rec?.name === 'media-playback' && JSON.stringify(rec).includes('image2'),
		);
		console.log(`[gate closed] image2 media-playback reports: ${image2Playbacks.length}`);
		expect(image2Playbacks.length).toBe(0);

		// (c) Reopen the gate: image2 recovers on the next pass (no persistent state).
		await page.request.post(`${testServerBaseUrl}/gate/skip-mode/image2?on=0`);
		await expect(async () => {
			const name = await getVisibleImageName(page);
			if (name !== 'image2.png') throw new Error(`image2 not visible yet (saw ${name})`);
		}).toPass({ intervals: [500], timeout: SEEN_WINDOW_MS });
		console.log('[gate reopened] image2 recovered');

		// (d) Fail-open: unlisted 500 must NOT skip — image2 keeps playing.
		await page.request.post(`${testServerBaseUrl}/gate/status-override/image2?status=500`);
		await new Promise((r) => setTimeout(r, CYCLE_MS)); // drain the in-flight pass
		const failOpenSeen = await collectVisibleImages(page, SEEN_WINDOW_MS);
		console.log(`[gate 500] visible images: ${[...failOpenSeen].join(', ')}`);
		expect(failOpenSeen.has('image2.png')).toBe(true);

		await page.request.post(`${testServerBaseUrl}/gate/reset`);
	});

	test('both checks: update lookahead and gate run as independent request channels', async ({
		context,
		page,
		testServerBaseUrl,
	}) => {
		test.setTimeout(180000);
		await context.addInitScript(`window.__SMIL_URL__ = '${testServerBaseUrl}/playCheckUrlBothChecks.smil';`);
		await resetAndBoot(page, testServerBaseUrl);
		await waitForFirstImage(page);

		// Flush the initial bulk-download HEAD burst, then sample a steady-state window.
		await new Promise((r) => setTimeout(r, 5000));
		await page.request.post(`${testServerBaseUrl}/cbp/clear-head-log`);
		await page.request.post(`${testServerBaseUrl}/gate/clear-head-log`);
		await new Promise((r) => setTimeout(r, SEEN_WINDOW_MS));

		// Update channel: checkAheadCount=2 lookahead HEADs the /cbp content URLs.
		const cbpLog: { file: string }[] = await (
			await page.request.get(`${testServerBaseUrl}/cbp/head-log`)
		).json();
		console.log(`[both checks] cbp update HEADs: ${cbpLog.length}`);
		expect(cbpLog.length).toBeGreaterThanOrEqual(3);

		// Gate channel: image2's gate URL is checked inline-GET once per pass despite the
		// lookahead handling updates (the gate never rides checkAheadCount).
		const gateHeads = await gateHeadCount(page, testServerBaseUrl, 'image2');
		console.log(`[both checks] image2 gate checks: ${gateHeads}`);
		expect(gateHeads).toBeGreaterThanOrEqual(1);

		// Closing the gate drops image2 while the update machinery keeps running.
		await page.request.post(`${testServerBaseUrl}/gate/skip-mode/image2`);
		await new Promise((r) => setTimeout(r, CYCLE_MS));
		const gatedSeen = await collectVisibleImages(page, NOT_SEEN_WINDOW_MS);
		console.log(`[both checks, gated] visible images: ${[...gatedSeen].join(', ')}`);
		expect(gatedSeen.has('image2.png')).toBe(false);
		expect(gatedSeen.has('image1.png')).toBe(true);
		expect(gatedSeen.has('image3.png')).toBe(true);

		await page.request.post(`${testServerBaseUrl}/gate/reset`);
		await page.request.post(`${testServerBaseUrl}/cbp/reset`);
	});

	test('missing skipPlaybackOnHttpStatus meta: gate inert, zero gate requests', async ({
		context,
		page,
		testServerBaseUrl,
	}) => {
		test.setTimeout(180000);
		await context.addInitScript(`window.__SMIL_URL__ = '${testServerBaseUrl}/playCheckUrlMissingMeta.smil';`);

		await resetAndBoot(page, testServerBaseUrl);
		await waitForFirstImage(page);

		// Even in skip-mode the gate must not act — it is inert without the meta.
		await page.request.post(`${testServerBaseUrl}/gate/skip-mode/image2`);

		const seen = await collectVisibleImages(page, SEEN_WINDOW_MS);
		console.log(`[missing meta] visible images: ${[...seen].join(', ')}`);
		expect(seen.has('image2.png')).toBe(true);

		// Zero gate requests — the short-circuit fires before any request.
		const resp = await page.request.get(`${testServerBaseUrl}/gate/head-log`);
		const gateLog: unknown[] = await resp.json();
		console.log(`[missing meta] gate requests: ${gateLog.length}`);
		expect(gateLog.length).toBe(0);

		// The warn-once debug message is NOT asserted here: the smil-player applet runs in
		// the cross-origin iframe (:8091) and its debug-module console output never reaches
		// page.on('console') — only front-display (main page) messages do (verified
		// empirically 2026-07-02: 0 '@signageos/smil-player' messages with debug='*').
		// The warn/no-request path is covered by test/unit/filesManager/playCheckGate.spec.ts.

		await page.request.post(`${testServerBaseUrl}/gate/reset`);
	});

	// KNOWN PLAYER GAP documented by this test (see also the unit-level phantom-slot guard
	// in test/unit/playlistProcessor/playlistProcessor.spec.ts, which owns the releaseSlot
	// invariant deterministically): the gate runs inside playElement, AFTER priorityBehaviour
	// resolved the conflict — so a gate-skipped pass of a higher-priority element still
	// performs a real takeover (handleStopBehaviour sets player.stop on the lower element)
	// before releasing the slot. The lower loop then SKIPs its stopped elements
	// pre-registration ("playlist stopped by higher priority"), so the resetStop recovery
	// inside priorityBehaviour never runs while the gated higher keeps contending. Observed
	// consequences (verified interactively, including a 60s no-recovery window):
	//   - the lower playlist paints at most its first element, then the region freezes on
	//     the last painted content until the gate reopens;
	//   - which content that is depends on the boot interleaving (whichever class registers
	//     first) — one branch of the race paints NOTHING before the takeover, leaving the
	//     region black from boot.
	// Unlike media-level expr (pre-checked in the traverser BEFORE priority registration),
	// moving the gate pre-registration would break the "both checks" contract (update
	// machinery must run even for gate-skipped passes). Until the player closes this gap,
	// this e2e asserts only interleaving-independent behavior: gate-open plays the higher
	// element, gate-closed keeps re-checking per pass, and the region never blanks once
	// content has painted. If the player ever resumes stopped lower playlists, strengthen
	// this to assert the lower rotation (image2 + image3) while the gate is closed.
	test('priority interplay: gated higher element plays when open, re-checks per pass when closed, region never blanks', async ({
		context,
		page,
		testServerBaseUrl,
	}) => {
		test.setTimeout(240000);
		await context.addInitScript(`window.__SMIL_URL__ = '${testServerBaseUrl}/playCheckUrlPriority.smil';`);

		// Boot with the gate OPEN: the higher-priority image1 wins the region
		// deterministically regardless of which priorityClass registers first.
		await resetAndBoot(page, testServerBaseUrl);
		await expect(async () => {
			const names = await getVisibleImageNames(page);
			if (!names.has('image1.png')) {
				throw new Error(`image1 not visible yet (saw ${[...names].join(', ') || 'none'})`);
			}
		}).toPass({ intervals: [1000], timeout: 60000 });
		console.log('[priority, gate open] higher-priority image1 playing');
		expect(await gateHeadCount(page, testServerBaseUrl, 'image1')).toBeGreaterThanOrEqual(1);

		// Close the gate: image1 must keep being re-checked every pass (no persistent skip
		// state) and the region must keep showing content (never blank).
		await page.request.post(`${testServerBaseUrl}/gate/skip-mode/image1`);
		await new Promise((r) => setTimeout(r, CYCLE_MS)); // drain the in-flight pass
		await page.request.post(`${testServerBaseUrl}/gate/clear-head-log`);

		const closedSeen = await collectVisibleImages(page, NOT_SEEN_WINDOW_MS);
		console.log(`[priority, gate closed] visible images: ${[...closedSeen].join(', ')}`);
		expect(closedSeen.size).toBeGreaterThanOrEqual(1);

		const closedHeads = await gateHeadCount(page, testServerBaseUrl, 'image1');
		console.log(`[priority, gate closed] image1 gate checks over ${NOT_SEEN_WINDOW_MS}ms: ${closedHeads}`);
		expect(closedHeads).toBeGreaterThanOrEqual(2);

		await page.request.post(`${testServerBaseUrl}/gate/reset`);
	});

	test('list independence: a status listed only in skipContentOnHttpStatus never gates playback', async ({
		context,
		page,
		testServerBaseUrl,
	}) => {
		test.setTimeout(180000);
		await context.addInitScript(`window.__SMIL_URL__ = '${testServerBaseUrl}/playCheckUrlListIndependence.smil';`);
		await resetAndBoot(page, testServerBaseUrl);

		// Gate answers 404 from the very first pass. 404 is listed ONLY in
		// skipContentOnHttpStatus — the gate reads skipPlaybackOnHttpStatus="410",
		// so image2 must keep playing and must NOT get marked skipContent.
		await page.request.post(`${testServerBaseUrl}/gate/skip-mode/image2`);
		await waitForFirstImage(page);

		const seen = await collectVisibleImages(page, SEEN_WINDOW_MS);
		console.log(`[list independence] visible images: ${[...seen].join(', ')}`);
		expect(seen.has('image2.png')).toBe(true);

		// The gate DID run (proves the 404 was classified against the right list,
		// not that the gate never fired).
		expect(await gateHeadCount(page, testServerBaseUrl, 'image2')).toBeGreaterThanOrEqual(1);

		// A listed status (410) still gates — same fixture, flip the override.
		await page.request.post(`${testServerBaseUrl}/gate/skip-mode/image2?on=0`);
		await page.request.post(`${testServerBaseUrl}/gate/status-override/image2?status=410`);
		await new Promise((r) => setTimeout(r, CYCLE_MS)); // drain the in-flight pass
		const gatedSeen = await collectVisibleImages(page, NOT_SEEN_WINDOW_MS);
		console.log(`[list independence, 410] visible images: ${[...gatedSeen].join(', ')}`);
		expect(gatedSeen.has('image2.png')).toBe(false);
		expect(gatedSeen.has('image1.png')).toBe(true);

		await page.request.post(`${testServerBaseUrl}/gate/reset`);
	});

	test('playCheckSkipOnError: unlisted 5xx skips the opted-in element, default sibling fails open, recovery works', async ({
		context,
		page,
		testServerBaseUrl,
	}) => {
		test.setTimeout(300000);
		await context.addInitScript(`window.__SMIL_URL__ = '${testServerBaseUrl}/playCheckUrlSkipOnError.smil';`);
		const videoFile = getFileName(`${testServerBaseUrl}/assets/${SKIP_VIDEO}`);
		await resetAndBoot(page, testServerBaseUrl);
		await waitForFirstImage(page);

		// (a) Gates answer 200: everything rotates — images in the iframe, video on the main page.
		const openSeen = await collectVisibleMedia(page, SKIP_SEEN_WINDOW_MS, videoFile);
		console.log(`[skipOnError, open] visible media: ${[...openSeen].join(', ')}`);
		expect(openSeen.has('image1.png')).toBe(true);
		expect(openSeen.has('image2.png')).toBe(true);
		expect(openSeen.has('image3.png')).toBe(true);
		expect(openSeen.has(SKIP_VIDEO)).toBe(true);

		// (b) All gates answer 500 — NOT in skipPlaybackOnHttpStatus="404".
		// image2 and the video (playCheckSkipOnError="true") must drop out;
		// image3 (default) fails open.
		await page.request.post(`${testServerBaseUrl}/gate/status-override/image2?status=500`);
		await page.request.post(`${testServerBaseUrl}/gate/status-override/image3?status=500`);
		await page.request.post(`${testServerBaseUrl}/gate/status-override/video?status=500`);
		await new Promise((r) => setTimeout(r, SKIP_CYCLE_MS)); // drain the in-flight pass
		const erroredSeen = await collectVisibleMedia(page, SKIP_NOT_SEEN_WINDOW_MS, videoFile);
		console.log(`[skipOnError, 500] visible media: ${[...erroredSeen].join(', ')}`);
		expect(erroredSeen.has('image2.png')).toBe(false);
		expect(erroredSeen.has(SKIP_VIDEO)).toBe(false);
		expect(erroredSeen.has('image1.png')).toBe(true);
		expect(erroredSeen.has('image3.png')).toBe(true);
		// The skip is per-pass: the gates keep re-checking image2 and the video while erroring.
		await page.request.post(`${testServerBaseUrl}/gate/clear-head-log`);
		await new Promise((r) => setTimeout(r, SKIP_CYCLE_MS));
		expect(await gateHeadCount(page, testServerBaseUrl, 'image2')).toBeGreaterThanOrEqual(1);
		expect(await gateHeadCount(page, testServerBaseUrl, 'video')).toBeGreaterThanOrEqual(1);

		// (c) Server healthy again: image2 and the video recover on the next pass.
		await page.request.post(`${testServerBaseUrl}/gate/status-override/image2?status=0`);
		await page.request.post(`${testServerBaseUrl}/gate/status-override/image3?status=0`);
		await page.request.post(`${testServerBaseUrl}/gate/status-override/video?status=0`);
		const recoveredSeen = await collectVisibleMedia(page, SKIP_SEEN_WINDOW_MS, videoFile);
		console.log(`[skipOnError, recovered] visible media: ${[...recoveredSeen].join(', ')}`);
		expect(recoveredSeen.has('image2.png')).toBe(true);
		expect(recoveredSeen.has(SKIP_VIDEO)).toBe(true);
	});

	test('playCheckSkipOnError: dead gate server (transport error) skips the opted-in element, default sibling fails open', async ({
		context,
		page,
		testServerBaseUrl,
	}) => {
		test.setTimeout(180000);
		// Gate URLs point at localhost:1 (nothing listens -> instant connection refused).
		await context.addInitScript(
			`window.__SMIL_URL__ = '${testServerBaseUrl}/playCheckUrlSkipOnErrorTransport.smil';`,
		);
		const videoFile = getFileName(`${testServerBaseUrl}/assets/${SKIP_VIDEO}`);
		await resetAndBoot(page, testServerBaseUrl);
		await waitForFirstImage(page);

		const seen = await collectVisibleMedia(page, SKIP_SEEN_WINDOW_MS, videoFile);
		console.log(`[skipOnError, dead server] visible media: ${[...seen].join(', ')}`);
		expect(seen.has('image2.png')).toBe(false);
		expect(seen.has(SKIP_VIDEO)).toBe(false);
		expect(seen.has('image1.png')).toBe(true);
		expect(seen.has('image3.png')).toBe(true);
	});
});
