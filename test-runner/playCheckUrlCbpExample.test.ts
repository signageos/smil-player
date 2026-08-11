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
 * Combined-features example: checkBeforePlay + checkAheadCount=2 (content channel,
 * skipContentOnHttpStatus="404") AND the playCheckUrl gate on image2 (playability
 * channel, skipPlaybackOnHttpStatus="403,404,410") in ONE playlist —
 * test-server/testFiles/playCheckUrlCbpExample.smil, the localhost twin of
 * docs/superpowers/examples/playcheckurl-with-checkbeforeplay.smil.
 *
 * Contract under test: an element plays a pass only if BOTH channels say yes; the
 * channels classify against their own status lists; the update machinery keeps
 * running for gate-skipped passes, so the newest content plays the moment the gate
 * reopens.
 *
 * Fixture rotates 3 images (3s each, full cycle 9s; ~6s while image2 is skipped).
 * NOT_SEEN_WINDOW_MS covers >1.5 full cycles so "image2 never visible" is a real
 * drop-out, not a sampling gap; SEEN_WINDOW_MS covers >2 cycles for recovery.
 */
const CYCLE_MS = 9000;
const NOT_SEEN_WINDOW_MS = 15000;
const SEEN_WINDOW_MS = 20000;
const RECOVERY_TIMEOUT_MS = 40000;
// Content-channel skips are marked by the checkAheadCount lookahead, which re-checks a
// given element only once per cycle — worst case the 404 lands ~1 cycle after the server
// toggle and the element legitimately paints once more until ~cycle+dur later. Drain two
// full cycles before asserting absence. (Gate skips are per-pass inline: 1 cycle suffices.)
const CONTENT_MARK_DRAIN_MS = 2 * CYCLE_MS;

// The playCheckUrlCbpSkipOnError fixture appends a strict-gated video-test-2.mp4
// (~3.4s) to the 3-image rotation, stretching the full cycle to ~13s — its own,
// wider windows.
const STRICT_CYCLE_MS = 14000;
const STRICT_NOT_SEEN_WINDOW_MS = 22000;
const STRICT_SEEN_WINDOW_MS = 30000;
const STRICT_RECOVERY_TIMEOUT_MS = 45000;
const STRICT_VIDEO = 'video-test-2.mp4';

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
 *  STRICT_VIDEO whenever the strict-gated video was caught playing during the window. */
async function collectVisibleMedia(page: Page, windowMs: number, videoFileName: string): Promise<Set<string>> {
	const seen = new Set<string>();
	const deadline = Date.now() + windowMs;
	while (Date.now() < deadline) {
		for (const name of await getVisibleImageNames(page)) {
			seen.add(name);
		}
		if (await isVideoPlaying(page, videoFileName)) {
			seen.add(STRICT_VIDEO);
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	return seen;
}

/** __smil_version of a named image's DOM element (visible or not), or null. */
async function getImageVersion(page: Page, name: string): Promise<string | null> {
	for (const frame of page.frames()) {
		if (frame === page.mainFrame()) continue;
		try {
			const imgs = await frame.locator('img').all();
			for (const img of imgs) {
				const src = await img.getAttribute('src');
				if (!src) continue;
				const nameMatch = src.match(/\/(image(\d+))_[a-f0-9]+\.png/);
				if (!nameMatch || `image${nameMatch[2]}.png` !== name) continue;
				const versionMatch = src.match(/__smil_version=([^&]+)/);
				if (versionMatch) return versionMatch[1];
			}
		} catch {
			// frame detached
		}
	}
	return null;
}

/** Sample every 300ms for windowMs; collect the __smil_version of each VISIBLE
 *  sighting of `name`. Distinguishes "first paint after gate reopen is already the
 *  new version" from "old version paints once, then updates". */
async function collectVisibleVersions(page: Page, name: string, windowMs: number): Promise<Set<string>> {
	const versions = new Set<string>();
	const deadline = Date.now() + windowMs;
	while (Date.now() < deadline) {
		for (const frame of page.frames()) {
			if (frame === page.mainFrame()) continue;
			try {
				const imgs = await frame.locator('img').all();
				for (const img of imgs) {
					if (!(await img.isVisible({ timeout: 300 }))) continue;
					const src = await img.getAttribute('src');
					if (!src) continue;
					const nameMatch = src.match(/\/(image(\d+))_[a-f0-9]+\.png/);
					if (!nameMatch || `image${nameMatch[2]}.png` !== name) continue;
					const versionMatch = src.match(/__smil_version=([^&]+)/);
					if (versionMatch) versions.add(versionMatch[1]);
				}
			} catch {
				// frame detached
			}
		}
		await new Promise((r) => setTimeout(r, 300));
	}
	return versions;
}

async function requestLog(page: Page, baseUrl: string, channel: 'gate' | 'cbp'): Promise<{ file: string; time: number }[]> {
	const resp = await page.request.get(`${baseUrl}/${channel}/head-log`);
	return resp.json();
}

async function waitForImageVisible(page: Page, name: string, timeoutMs: number) {
	await expect(async () => {
		const names = await getVisibleImageNames(page);
		if (!names.has(name)) {
			throw new Error(`${name} not visible yet (saw ${[...names].join(', ') || 'none'})`);
		}
	}).toPass({ intervals: [500], timeout: timeoutMs });
}

test.describe('playCheckUrl gate + checkBeforePlay combined example', () => {
	test('happy path: both channels active, all images rotate, unlisted gate status fails open', async ({
		context,
		page,
		testServerBaseUrl,
	}) => {
		test.setTimeout(240000);
		await context.addInitScript(`window.__SMIL_URL__ = '${testServerBaseUrl}/playCheckUrlCbpExample.smil';`);
		await resetAndBoot(page, testServerBaseUrl);
		await waitForFirstImage(page);

		// Flush the initial bulk-download burst, then sample a steady-state window.
		await new Promise((r) => setTimeout(r, 5000));
		await page.request.post(`${testServerBaseUrl}/cbp/clear-head-log`);
		await page.request.post(`${testServerBaseUrl}/gate/clear-head-log`);

		const seen = await collectVisibleImages(page, SEEN_WINDOW_MS);
		console.log(`[happy path] visible images: ${[...seen].join(', ')}`);
		expect(seen.has('image1.png')).toBe(true);
		expect(seen.has('image2.png')).toBe(true);
		expect(seen.has('image3.png')).toBe(true);

		// Content channel: the checkAheadCount=2 lookahead update-checks the /cbp URLs.
		const cbpLog = await requestLog(page, testServerBaseUrl, 'cbp');
		const cbpFiles = new Set(cbpLog.map((e) => e.file));
		console.log(`[happy path] cbp update checks: ${cbpLog.length} (${[...cbpFiles].join(', ')})`);
		expect(cbpFiles.size).toBeGreaterThanOrEqual(2);

		// Playability channel: image2's gate URL is consulted per pass.
		const gateLog = await requestLog(page, testServerBaseUrl, 'gate');
		const image2GateChecks = gateLog.filter((e) => e.file === 'image2').length;
		console.log(`[happy path] image2 gate checks: ${image2GateChecks}`);
		expect(image2GateChecks).toBeGreaterThanOrEqual(1);

		// Fail-open: 500 is not listed in skipPlaybackOnHttpStatus — image2 keeps playing
		// even though the content channel is also active.
		await page.request.post(`${testServerBaseUrl}/gate/status-override/image2?status=500`);
		await new Promise((r) => setTimeout(r, CYCLE_MS)); // drain the in-flight pass
		const failOpenSeen = await collectVisibleImages(page, SEEN_WINDOW_MS);
		console.log(`[gate 500] visible images: ${[...failOpenSeen].join(', ')}`);
		expect(failOpenSeen.has('image2.png')).toBe(true);

		await page.request.post(`${testServerBaseUrl}/gate/reset`);
		await page.request.post(`${testServerBaseUrl}/cbp/reset`);
	});

	test('channel independence and AND-semantics: content-404 skips, gate-403 skips, both must reopen to play', async ({
		context,
		page,
		testServerBaseUrl,
	}) => {
		test.setTimeout(360000);
		await context.addInitScript(`window.__SMIL_URL__ = '${testServerBaseUrl}/playCheckUrlCbpExample.smil';`);
		await resetAndBoot(page, testServerBaseUrl);
		await waitForFirstImage(page);
		await new Promise((r) => setTimeout(r, 5000));

		// (a) CONTENT channel closed (404, listed in skipContentOnHttpStatus), gate open:
		// image2 drops out via skipContent; siblings keep cycling.
		const tToggle = Date.now();
		await page.request.post(`${testServerBaseUrl}/cbp/skip-mode/image2.png`);
		await new Promise((r) => setTimeout(r, CONTENT_MARK_DRAIN_MS)); // lookahead marks within ~1 cycle + final paint drains
		const sightings: { t: number; names: string[] }[] = [];
		const sampleDeadline = Date.now() + NOT_SEEN_WINDOW_MS;
		const contentClosedSeen = new Set<string>();
		while (Date.now() < sampleDeadline) {
			const names = await getVisibleImageNames(page);
			sightings.push({ t: Date.now() - tToggle, names: [...names] });
			for (const n of names) contentClosedSeen.add(n);
			await new Promise((r) => setTimeout(r, 500));
		}
		const cbpLogPhaseA = await requestLog(page, testServerBaseUrl, 'cbp');
		console.log(
			`[content 404] image2 HEADs rel to toggle (ms): ${cbpLogPhaseA
				.filter((e) => e.file === 'image2.png')
				.map((e) => e.time - tToggle)
				.join(', ')}`,
		);
		console.log(
			`[content 404] image2 sightings rel to toggle (ms): ${sightings
				.filter((s) => s.names.includes('image2.png'))
				.map((s) => s.t)
				.join(', ') || 'none'}`,
		);
		console.log(`[content 404] visible images: ${[...contentClosedSeen].join(', ')}`);
		expect(contentClosedSeen.has('image2.png')).toBe(false);
		expect(contentClosedSeen.has('image1.png')).toBe(true);
		expect(contentClosedSeen.has('image3.png')).toBe(true);

		// (b) Content recovers: the lookahead re-checks the skipContent slot each cycle,
		// so image2 returns without any player restart.
		await page.request.post(`${testServerBaseUrl}/cbp/skip-mode/image2.png?on=0`);
		await waitForImageVisible(page, 'image2.png', RECOVERY_TIMEOUT_MS);
		console.log('[content recovered] image2 playing again');

		// (c) PLAYABILITY channel closed (403, listed in skipPlaybackOnHttpStatus),
		// content serving 200: image2 drops out via the gate.
		await page.request.post(`${testServerBaseUrl}/gate/status-override/image2?status=403`);
		await new Promise((r) => setTimeout(r, CYCLE_MS)); // drain the in-flight pass
		await page.request.post(`${testServerBaseUrl}/cbp/clear-head-log`);
		const gateClosedSeen = await collectVisibleImages(page, NOT_SEEN_WINDOW_MS);
		console.log(`[gate 403] visible images: ${[...gateClosedSeen].join(', ')}`);
		expect(gateClosedSeen.has('image2.png')).toBe(false);
		expect(gateClosedSeen.has('image1.png')).toBe(true);
		expect(gateClosedSeen.has('image3.png')).toBe(true);

		// The "both checks" contract: while the gate keeps image2 off screen, the content
		// channel MUST keep update-checking it — the head-log cleared after closing the
		// gate accumulated fresh image2 checks during the gated window.
		const cbpLogWhileGated = await requestLog(page, testServerBaseUrl, 'cbp');
		const image2ChecksWhileGated = cbpLogWhileGated.filter((e) => e.file === 'image2.png').length;
		console.log(`[gate 403] image2 content update-checks while gated: ${image2ChecksWhileGated}`);
		expect(image2ChecksWhileGated).toBeGreaterThanOrEqual(1);

		// (d) BOTH channels closed, then reopen only the gate: image2 must STAY off screen
		// (content still 404) — playing requires both channels to say yes.
		await page.request.post(`${testServerBaseUrl}/cbp/skip-mode/image2.png`);
		// The content mark must land BEFORE the gate reopens, or a not-yet-marked image2
		// could paint once through the just-opened gate.
		await new Promise((r) => setTimeout(r, CONTENT_MARK_DRAIN_MS));
		await page.request.post(`${testServerBaseUrl}/gate/status-override/image2?status=0`);
		const gateOnlyReopenedSeen = await collectVisibleImages(page, NOT_SEEN_WINDOW_MS);
		console.log(`[gate reopened, content still 404] visible images: ${[...gateOnlyReopenedSeen].join(', ')}`);
		expect(gateOnlyReopenedSeen.has('image2.png')).toBe(false);
		expect(gateOnlyReopenedSeen.has('image1.png')).toBe(true);

		// Reopen the content channel too: now both say yes and image2 recovers.
		await page.request.post(`${testServerBaseUrl}/cbp/skip-mode/image2.png?on=0`);
		await waitForImageVisible(page, 'image2.png', RECOVERY_TIMEOUT_MS);
		console.log('[both reopened] image2 recovered');

		await page.request.post(`${testServerBaseUrl}/gate/reset`);
		await page.request.post(`${testServerBaseUrl}/cbp/reset`);
	});

	test('content updated while gate closed: reopened gate plays the NEW version immediately', async ({
		context,
		page,
		testServerBaseUrl,
	}) => {
		test.setTimeout(300000);
		await context.addInitScript(`window.__SMIL_URL__ = '${testServerBaseUrl}/playCheckUrlCbpExample.smil';`);
		await resetAndBoot(page, testServerBaseUrl);
		await waitForFirstImage(page);

		// Baseline: image2's DOM element carries its downloaded __smil_version.
		let baselineVersion: string | null = null;
		await expect(async () => {
			baselineVersion = await getImageVersion(page, 'image2.png');
			if (!baselineVersion) throw new Error('image2 __smil_version not present yet');
		}).toPass({ intervals: [1000], timeout: 60000 });
		console.log(`[update while gated] baseline image2 version: ${baselineVersion}`);

		// Close the gate (404, listed) and confirm image2 dropped out.
		await page.request.post(`${testServerBaseUrl}/gate/skip-mode/image2`);
		await new Promise((r) => setTimeout(r, CYCLE_MS)); // drain the in-flight pass
		const gatedSeen = await collectVisibleImages(page, NOT_SEEN_WINDOW_MS);
		console.log(`[update while gated] gated, visible images: ${[...gatedSeen].join(', ')}`);
		expect(gatedSeen.has('image2.png')).toBe(false);

		// Switch image2's content on the server WHILE the gate keeps it off screen.
		const switchResp = await page.request.post(`${testServerBaseUrl}/cbp/switch/image2.png`);
		console.log(`[update while gated] server switched image2: ${JSON.stringify(await switchResp.json())}`);

		// Give the lookahead ≥2 gated cycles to detect the change and download the new
		// version in the background — the "both checks" contract in action.
		await new Promise((r) => setTimeout(r, 20000));

		// Reopen the gate and watch every visible image2 paint: the FIRST paint must
		// already be the new version. If the update machinery had been dormant while
		// gated, the stale baseline version would paint at least once here.
		await page.request.post(`${testServerBaseUrl}/gate/skip-mode/image2?on=0`);
		const paintedVersions = await collectVisibleVersions(page, 'image2.png', SEEN_WINDOW_MS + CYCLE_MS);
		console.log(
			`[update while gated] image2 versions painted after reopen: ${[...paintedVersions].join(', ') || 'none'}`,
		);
		expect(paintedVersions.size).toBeGreaterThanOrEqual(1);
		expect(paintedVersions.has(baselineVersion!)).toBe(false);

		await page.request.post(`${testServerBaseUrl}/gate/reset`);
		await page.request.post(`${testServerBaseUrl}/cbp/reset`);
	});

	test('playCheckSkipOnError under checkBeforePlay: strict img+video skip on gate 500, content channel keeps checking, default sibling fails open', async ({
		context,
		page,
		testServerBaseUrl,
	}) => {
		test.setTimeout(420000);
		await context.addInitScript(`window.__SMIL_URL__ = '${testServerBaseUrl}/playCheckUrlCbpSkipOnError.smil';`);
		const videoFile = getFileName(`${testServerBaseUrl}/assets/${STRICT_VIDEO}`);
		await resetAndBoot(page, testServerBaseUrl);
		await waitForFirstImage(page);

		// Flush the initial bulk-download burst, then sample steady state.
		await new Promise((r) => setTimeout(r, 5000));
		await page.request.post(`${testServerBaseUrl}/cbp/clear-head-log`);
		await page.request.post(`${testServerBaseUrl}/gate/clear-head-log`);

		// (a) Both channels healthy: all four media rotate — strict img + strict video
		// included — and both request channels are demonstrably active.
		const openSeen = await collectVisibleMedia(page, STRICT_SEEN_WINDOW_MS, videoFile);
		console.log(`[strict+cbp, open] visible media: ${[...openSeen].join(', ')}`);
		expect(openSeen.has('image1.png')).toBe(true);
		expect(openSeen.has('image2.png')).toBe(true);
		expect(openSeen.has('image3.png')).toBe(true);
		expect(openSeen.has(STRICT_VIDEO)).toBe(true);
		const cbpOpenLog = await requestLog(page, testServerBaseUrl, 'cbp');
		const gateOpenLog = await requestLog(page, testServerBaseUrl, 'gate');
		console.log(
			`[strict+cbp, open] cbp checks: ${cbpOpenLog.length}, gate checks: ${gateOpenLog
				.map((e) => e.file)
				.join(', ')}`,
		);
		expect(cbpOpenLog.length).toBeGreaterThanOrEqual(1);
		expect(gateOpenLog.filter((e) => e.file === 'image2').length).toBeGreaterThanOrEqual(1);
		expect(gateOpenLog.filter((e) => e.file === 'video').length).toBeGreaterThanOrEqual(1);

		// (b) All three gates answer 500 (unlisted): the strict img AND the strict video
		// drop out; the default-mode image3 fails open; ungated image1 keeps the rotation
		// alive. checkBeforePlay being active must not change any of these decisions.
		await page.request.post(`${testServerBaseUrl}/gate/status-override/image2?status=500`);
		await page.request.post(`${testServerBaseUrl}/gate/status-override/image3?status=500`);
		await page.request.post(`${testServerBaseUrl}/gate/status-override/video?status=500`);
		await new Promise((r) => setTimeout(r, STRICT_CYCLE_MS)); // drain the in-flight pass
		await page.request.post(`${testServerBaseUrl}/cbp/clear-head-log`);
		const erroredSeen = await collectVisibleMedia(page, STRICT_NOT_SEEN_WINDOW_MS, videoFile);
		console.log(`[strict+cbp, gate 500] visible media: ${[...erroredSeen].join(', ')}`);
		expect(erroredSeen.has('image2.png')).toBe(false);
		expect(erroredSeen.has(STRICT_VIDEO)).toBe(false);
		expect(erroredSeen.has('image1.png')).toBe(true);
		expect(erroredSeen.has('image3.png')).toBe(true);

		// The combined contract survives strict mode: while the strict gate keeps image2
		// off screen, the content lookahead MUST keep update-checking it (head-log was
		// cleared after the gates closed, so these are checks from the gated window).
		const cbpGatedLog = await requestLog(page, testServerBaseUrl, 'cbp');
		const image2ChecksWhileGated = cbpGatedLog.filter((e) => e.file === 'image2.png').length;
		console.log(`[strict+cbp, gate 500] image2 content update-checks while strict-gated: ${image2ChecksWhileGated}`);
		expect(image2ChecksWhileGated).toBeGreaterThanOrEqual(1);

		// (c) Gates healthy again: strict img and strict video both recover on the next pass.
		await page.request.post(`${testServerBaseUrl}/gate/status-override/image2?status=0`);
		await page.request.post(`${testServerBaseUrl}/gate/status-override/image3?status=0`);
		await page.request.post(`${testServerBaseUrl}/gate/status-override/video?status=0`);
		await waitForImageVisible(page, 'image2.png', STRICT_RECOVERY_TIMEOUT_MS);
		await expect(async () => {
			if (!(await isVideoPlaying(page, videoFile))) {
				throw new Error('strict video not playing yet');
			}
		}).toPass({ intervals: [500], timeout: STRICT_RECOVERY_TIMEOUT_MS });
		console.log('[strict+cbp, recovered] strict image and video playing again');

		// (d) Content channel closed for the strict img (404, listed in
		// skipContentOnHttpStatus) while every gate answers 200: image2 drops out via
		// skipContent exactly as without the flag — playCheckSkipOnError only changes
		// gate-error classification, never the content channel — and the strict video
		// keeps playing alongside.
		await page.request.post(`${testServerBaseUrl}/cbp/skip-mode/image2.png`);
		await new Promise((r) => setTimeout(r, 2 * STRICT_CYCLE_MS)); // lookahead mark + final paint drain
		const contentClosedSeen = await collectVisibleMedia(page, STRICT_NOT_SEEN_WINDOW_MS, videoFile);
		console.log(`[strict+cbp, content 404] visible media: ${[...contentClosedSeen].join(', ')}`);
		expect(contentClosedSeen.has('image2.png')).toBe(false);
		expect(contentClosedSeen.has(STRICT_VIDEO)).toBe(true);
		expect(contentClosedSeen.has('image1.png')).toBe(true);

		// Content recovers: both channels say yes again.
		await page.request.post(`${testServerBaseUrl}/cbp/skip-mode/image2.png?on=0`);
		await waitForImageVisible(page, 'image2.png', STRICT_RECOVERY_TIMEOUT_MS);
		console.log('[strict+cbp, content recovered] image2 playing again');

		await page.request.post(`${testServerBaseUrl}/gate/reset`);
		await page.request.post(`${testServerBaseUrl}/cbp/reset`);
	});
});
