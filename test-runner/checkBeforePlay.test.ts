import { test, expect, Frame } from '@playwright/test';

const EMULATOR_URL = 'http://localhost:8090';
const SMIL_URL = 'http://localhost:3000/checkBeforePlay.smil';
const SMIL_URL_AHEAD = 'http://localhost:3000/checkBeforePlayAhead.smil';
const SMIL_URL_SKIP = 'http://localhost:3000/checkBeforePlaySkipContent.smil';
const SMIL_URL_LOC = 'http://localhost:3000/checkBeforePlayLocation.smil';
const SMIL_URL_AHEAD_LOC = 'http://localhost:3000/checkBeforePlayAheadLocation.smil';
const TEST_SERVER = 'http://localhost:3000';

/**
 * Find the applet iframe and wait for it to have a loaded document.
 * Retries because the iframe may restart during player initialization.
 */
async function getStableAppletFrame(page: any, timeout = 30000): Promise<Frame> {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		try {
			const iframeLocator = page.locator('iframe').first();
			await iframeLocator.waitFor({ state: 'attached', timeout: 5000 });
			const iframeHandle = await iframeLocator.elementHandle();
			const frame = await iframeHandle!.contentFrame();
			if (frame) {
				await frame.waitForSelector('body', { timeout: 5000 });
				return frame;
			}
		} catch {
			// Frame detached or not ready, retry
		}
		await new Promise((r) => setTimeout(r, 1000));
	}
	throw new Error('Could not get stable applet iframe');
}

test('checkBeforePlay detects Last-Modified change and updates image src', async ({ context, page }) => {
	// Inject SMIL URL into the applet iframe via window.__SMIL_URL__
	await context.addInitScript(`window.__SMIL_URL__ = '${SMIL_URL}';`);

	// Phase 1: Reset server state and clear emulator storage
	await page.request.post(`${TEST_SERVER}/cbp/reset`);

	// Clear IndexedDB to remove stale mediaInfoObject from previous runs
	await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });
	await page.evaluate(async () => {
		const dbs = await indexedDB.databases();
		for (const db of dbs) {
			if (db.name) indexedDB.deleteDatabase(db.name);
		}
	});

	// Reload so the player starts fresh with clean storage
	await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });

	// Wait for the applet iframe to stabilize
	await getStableAppletFrame(page);

	// Wait for image to appear in any iframe (after prefetch + loader video)
	let imgFrame: Frame | null = null;
	await expect(async () => {
		const frames = page.frames();
		for (const frame of frames) {
			if (frame === page.mainFrame()) continue;
			try {
				const img = frame.locator('img[src*="image"]').first();
				if (await img.isVisible({ timeout: 1000 })) {
					imgFrame = frame;
					return;
				}
			} catch {
				// frame may be detached
			}
		}
		throw new Error('Image not visible in any frame');
	}).toPass({ intervals: [2000], timeout: 60000 });

	expect(imgFrame).toBeTruthy();

	// Phase 2: Capture baseline __smil_version from img src
	const imgLocator = imgFrame!.locator('img[src*="image"]').first();
	const initialSrc = await imgLocator.getAttribute('src');
	expect(initialSrc).toBeTruthy();
	const initialVersionMatch = initialSrc!.match(/__smil_version=([^&]+)/);
	const initialVersion = initialVersionMatch ? initialVersionMatch[1] : initialSrc;
	console.log(`Initial image src: ${initialSrc}`);
	console.log(`Initial version: ${initialVersion}`);

	// Phase 3: Switch content on server (advances Last-Modified)
	const switchResponse = await page.request.post(`${TEST_SERVER}/cbp/switch`);
	const switchData = await switchResponse.json();
	console.log(`Server switched to version ${switchData.version}, Last-Modified: ${switchData.lastModified}`);

	// Wait for __smil_version to change (poll every 1s, timeout 60s)
	// The image cycles every 5s → HEAD check detects new Last-Modified
	// → background download completes → next cycle uses new __smil_version
	let newVersion: string | null = null;
	await expect(async () => {
		const frames = page.frames();
		for (const frame of frames) {
			if (frame === page.mainFrame()) continue;
			try {
				const img = frame.locator('img[src*="image"]').first();
				const currentSrc = await img.getAttribute('src', { timeout: 2000 });
				if (!currentSrc) continue;
				const versionMatch = currentSrc.match(/__smil_version=([^&]+)/);
				const currentVersion = versionMatch ? versionMatch[1] : currentSrc;
				if (currentVersion !== initialVersion) {
					newVersion = currentVersion;
					return;
				}
			} catch {
				// frame detached
			}
		}
		throw new Error(`Version unchanged, still: ${initialVersion}`);
	}).toPass({ intervals: [1000], timeout: 60000 });

	console.log(`Version changed: ${initialVersion} -> ${newVersion}`);

	// Phase 4: Verify the updated image is actually visible on screen with the new version
	const visibleImg = await getVisibleImage(page);
	expect(visibleImg).toBeTruthy();
	console.log(`Visible image src: ${visibleImg!.src}`);
	console.log(`Visible image version: ${visibleImg!.version}`);
	expect(visibleImg!.version).not.toBe(initialVersion);
});

/**
 * Extract the image filename from a src attribute.
 * The player stores images with checksum-based names, e.g.:
 * ".../images/image3_61dc2a3c.png?__smil_version=..." → "image3.png"
 */
function extractImageName(src: string): string | null {
	const match = src.match(/\/(image(\d+))_[a-f0-9]+\.png/);
	return match ? `image${match[2]}.png` : null;
}

/**
 * Extract the __smil_version from a src attribute.
 */
function extractVersion(src: string): string | null {
	const match = src.match(/__smil_version=([^&]+)/);
	return match ? match[1] : null;
}

/**
 * Find the currently visible image in the iframe and return its name, version, and src.
 * Returns null if no visible image is found (e.g. during transition or frame detached).
 */
async function getVisibleImage(page: any): Promise<{ name: string | null; version: string | null; src: string } | null> {
	const frames = page.frames();
	for (const frame of frames) {
		if (frame === page.mainFrame()) continue;
		try {
			const imgs = await frame.locator('img').all();
			for (const img of imgs) {
				if (await img.isVisible({ timeout: 500 })) {
					const src = await img.getAttribute('src');
					if (!src) continue;
					return {
						name: extractImageName(src),
						version: extractVersion(src),
						src,
					};
				}
			}
		} catch {
			// frame detached
		}
	}
	return null;
}

test('checkBeforePlay detects content changes across multiple elements with checkAheadCount', async ({
	context,
	page,
}) => {
	// Inject SMIL URL for the multi-element SMIL
	await context.addInitScript(`window.__SMIL_URL__ = '${SMIL_URL_AHEAD}';`);

	// Phase 1: Reset server state and clear emulator storage
	await page.request.post(`${TEST_SERVER}/cbp/reset`);

	await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });
	await page.evaluate(async () => {
		const dbs = await indexedDB.databases();
		for (const db of dbs) {
			if (db.name) indexedDB.deleteDatabase(db.name);
		}
	});

	await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });
	await getStableAppletFrame(page);

	// Wait for first image to appear in iframe
	await expect(async () => {
		const frames = page.frames();
		for (const frame of frames) {
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

	console.log('Images are playing, collecting baseline versions from all img elements...');

	// Phase 2: Collect baseline versions for all images.
	// All 10 images exist as DOM elements simultaneously (different visibility states).
	// Scan all img elements to collect baselines — no need to wait a full cycle.
	const baselineVersions: Record<string, string> = {};
	const baselineDeadline = Date.now() + 40000;

	while (Date.now() < baselineDeadline && Object.keys(baselineVersions).length < 10) {
		const frames = page.frames();
		for (const frame of frames) {
			if (frame === page.mainFrame()) continue;
			try {
				const imgs = await frame.locator('img').all();
				for (const img of imgs) {
					const src = await img.getAttribute('src');
					if (!src) continue;
					const name = extractImageName(src);
					const version = extractVersion(src);
					if (name && version && !baselineVersions[name]) {
						baselineVersions[name] = version;
					}
				}
			} catch {
				// frame detached
			}
		}
		await new Promise((r) => setTimeout(r, 1000));
	}

	console.log(`Baseline versions collected for ${Object.keys(baselineVersions).length} images`);

	// Phase 3: Switch content on 3 images
	const switchTargets = ['image3.png', 'image6.png', 'image9.png'];
	for (const target of switchTargets) {
		const resp = await page.request.post(`${TEST_SERVER}/cbp/switch/${target}`);
		const data = await resp.json();
		console.log(`Switched ${target} to version ${data.version}, Last-Modified: ${data.lastModified}`);
	}

	// Phase 4: Wait for switched images to show updated __smil_version
	// Scan all img elements — version changes happen when the element is about to play
	const updatedImages = new Set<string>();
	const updateDeadline = Date.now() + 90000; // 90s timeout

	while (Date.now() < updateDeadline && updatedImages.size < switchTargets.length) {
		const frames = page.frames();
		for (const frame of frames) {
			if (frame === page.mainFrame()) continue;
			try {
				const imgs = await frame.locator('img').all();
				for (const img of imgs) {
					const src = await img.getAttribute('src');
					if (!src) continue;
					const name = extractImageName(src);
					const version = extractVersion(src);
					if (name && version && switchTargets.includes(name)) {
						const baseline = baselineVersions[name];
						if (baseline && version !== baseline && !updatedImages.has(name)) {
							console.log(`${name}: version changed ${baseline} -> ${version}`);
							updatedImages.add(name);
						}
					}
				}
			} catch {
				// frame detached
			}
		}
		await new Promise((r) => setTimeout(r, 1000));
	}

	console.log(`Updated images: ${updatedImages.size}/${switchTargets.length} (${[...updatedImages].join(', ')})`);

	// At least 2 of 3 switched images must show a version change
	expect(updatedImages.size).toBeGreaterThanOrEqual(2);

	// Phase 5: Verify switched images are actually VISIBLE with the new version when playing
	// Watch the visible image over a full playlist cycle (~30s). Each time a switched image
	// becomes the active/visible one, verify it has the new version, not the old baseline.
	const visiblyVerified = new Set<string>();
	const visibilityDeadline = Date.now() + 35000; // slightly more than one full cycle

	while (Date.now() < visibilityDeadline && visiblyVerified.size < updatedImages.size) {
		const visible = await getVisibleImage(page);
		if (visible && visible.name && visible.version && updatedImages.has(visible.name)) {
			const baseline = baselineVersions[visible.name];
			if (baseline && visible.version !== baseline && !visiblyVerified.has(visible.name)) {
				console.log(`VISIBLE: ${visible.name} displaying with new version ${visible.version} (was ${baseline})`);
				visiblyVerified.add(visible.name);
			}
		}
		await new Promise((r) => setTimeout(r, 500));
	}

	console.log(`Visibly verified: ${visiblyVerified.size}/${updatedImages.size} (${[...visiblyVerified].join(', ')})`);
	expect(visiblyVerified.size).toBeGreaterThanOrEqual(2);

	// Phase 6: Verify checkAheadCount via HEAD log pattern
	// Use accumulated HEAD log from the entire test — the sequential cascade concentrates
	// HEAD requests at the start of each cycle, so a short time window may miss them.
	const logResp = await page.request.get(`${TEST_SERVER}/cbp/head-log`);
	const headLogData: { file: string; time: number }[] = await logResp.json();
	console.log(`HEAD log entries: ${headLogData.length}`);

	// With checkAheadCount=3, the player checks multiple elements ahead via sequential cascade.
	// Verify we see more than 1 unique image in the accumulated HEAD requests.
	const uniqueImages = new Set(headLogData.map((e) => e.file));
	console.log(`Unique images in HEAD log: ${uniqueImages.size} (${[...uniqueImages].join(', ')})`);
	expect(uniqueImages.size).toBeGreaterThan(1);
});

test('checkAheadCount fires one HEAD per playback transition (no cascade racing-ahead)', async ({
	context,
	page,
}) => {
	// Regression guard for the cascade-racing-ahead bug. When prefetchAheadElements was
	// async + fire-and-forget with a shared prefetchedUrls set, stacked cascades would
	// scan progressively further ahead and emit clusters of HEADs within ~150 ms gaps
	// (the prePlayCheck round-trip). The fix issues ONE HEAD per playback transition
	// for the element exactly checkAheadCount positions ahead, so the steady-state gap
	// between consecutive HEADs matches the element duration (3s here).
	await context.addInitScript(`window.__SMIL_URL__ = '${SMIL_URL_AHEAD}';`);

	await page.request.post(`${TEST_SERVER}/cbp/reset`);

	await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });
	await page.evaluate(async () => {
		const dbs = await indexedDB.databases();
		for (const db of dbs) {
			if (db.name) indexedDB.deleteDatabase(db.name);
		}
	});

	await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });
	await getStableAppletFrame(page);

	// Wait for first image to appear, then allow ~5 s of cycle stabilization so the
	// initial bulk download HEADs are flushed from the assertion window.
	await expect(async () => {
		const frames = page.frames();
		for (const frame of frames) {
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

	await new Promise((r) => setTimeout(r, 5000));

	// Clear the HEAD log so the assertion window only contains steady-state prefetches.
	await page.request.post(`${TEST_SERVER}/cbp/clear-head-log`);

	// Observe for 30 s — at 3 s per image that's ~10 playback transitions, and with
	// a single-target lookahead we expect ~10 HEADs total.
	const windowMs = 30000;
	await new Promise((r) => setTimeout(r, windowMs));

	const logResp = await page.request.get(`${TEST_SERVER}/cbp/head-log`);
	const headLog: { file: string; time: number }[] = await logResp.json();
	console.log(`Steady-state HEAD log entries over ${windowMs}ms: ${headLog.length}`);

	// Inter-arrival gaps between consecutive HEADs.
	const gaps: number[] = [];
	for (let i = 1; i < headLog.length; i++) {
		gaps.push(headLog[i].time - headLog[i - 1].time);
	}
	const minGap = gaps.length ? Math.min(...gaps) : Infinity;
	const maxGap = gaps.length ? Math.max(...gaps) : 0;
	console.log(`Inter-arrival gaps: min=${minGap}ms max=${maxGap}ms count=${gaps.length}`);

	// With racing-ahead, clusters fire within ~150 ms (one prePlayCheck round-trip).
	// In steady state the gap should be close to the element duration (3 s = 3000 ms);
	// require at least 1500 ms as a comfortable margin that still rejects clusters.
	if (gaps.length > 0) {
		expect(minGap).toBeGreaterThanOrEqual(1500);
	}

	// HEAD count should track playback transitions: ~windowMs / 3000ms ≈ 10. Allow a
	// wide tolerance for jitter at the boundaries. Racing-ahead would yield 2–5× more.
	expect(headLog.length).toBeGreaterThan(3);
	expect(headLog.length).toBeLessThanOrEqual(20);
});

test('checkAheadCount cascades past skipContent (empty URL) without stalling or racing', async ({
	context,
	page,
}) => {
	// With one slot in the playlist returning 404 (skipContentOnHttpStatus="404"),
	// the lookahead must:
	//   1. mark that slot's media.expr = skipContent;
	//   2. cascade forward to the next non-skipped element (no extra HEAD on the 404'd URL
	//      from the same cascade — only the natural prePlayCheck-at-play HEAD lands);
	//   3. keep firing exactly one HEAD per playback transition for the visible elements;
	//   4. still detect a content change on a non-skipped sibling slot.
	await context.addInitScript(`window.__SMIL_URL__ = '${SMIL_URL_SKIP}';`);

	await page.request.post(`${TEST_SERVER}/cbp/reset`);
	// Force image10 to return 404 for HEAD/GET before the player starts.
	await page.request.post(`${TEST_SERVER}/cbp/skip-mode/image10.png`);

	await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });
	await page.evaluate(async () => {
		const dbs = await indexedDB.databases();
		for (const db of dbs) {
			if (db.name) indexedDB.deleteDatabase(db.name);
		}
	});

	await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });
	await getStableAppletFrame(page);

	// Wait until image playback starts (initial bulk + first transition).
	await expect(async () => {
		const frames = page.frames();
		for (const frame of frames) {
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

	// Allow another ~5 s for the initial bulk-download HEAD burst to flush, then sample.
	await new Promise((r) => setTimeout(r, 5000));
	await page.request.post(`${TEST_SERVER}/cbp/clear-head-log`);

	const windowMs = 35000; // ~3 full cycles at 9 visible slots × 3 s = 27 s + jitter
	await new Promise((r) => setTimeout(r, windowMs));

	const logResp = await page.request.get(`${TEST_SERVER}/cbp/head-log`);
	const headLog: { file: string; time: number }[] = await logResp.json();
	console.log(`Steady-state HEAD log entries (skipContent): ${headLog.length}`);

	const byFile: Record<string, number> = {};
	for (const e of headLog) byFile[e.file] = (byFile[e.file] || 0) + 1;
	console.log('HEADs per file:', byFile);

	// No HEAD should hit image10 in steady state — the cascade marks it skipContent
	// and skips past it on every subsequent transition. (One HEAD may have landed
	// before the player observed the 404; that's pre-window.)
	expect(byFile['image10.png'] || 0).toBe(0);

	// All other slots get hit roughly once per cycle (~3 cycles in this window).
	// Allow 1..6 per slot to cover boundary jitter.
	for (let i = 1; i <= 9; i++) {
		const n = byFile[`image${i}.png`] || 0;
		expect(n).toBeGreaterThanOrEqual(1);
		expect(n).toBeLessThanOrEqual(6);
	}

	// Inter-arrival times mostly match the playback rhythm. With one skipContent
	// element the playlist loop processes it instantly between the previous and
	// next real playback transition — that fires its lookahead HEAD ~100 ms after
	// the previous one. We tolerate up to a couple such boundary clusters per
	// window but still reject racing-ahead, which would produce a sub-300 ms gap
	// behind every playback transition.
	const gaps: number[] = [];
	for (let i = 1; i < headLog.length; i++) {
		gaps.push(headLog[i].time - headLog[i - 1].time);
	}
	const smallGaps = gaps.filter((g) => g < 1000).length;
	console.log(`Gaps: ${gaps.length} total, ${smallGaps} below 1000 ms`);
	expect(smallGaps).toBeLessThanOrEqual(3);

	// Switch image5 content. The cascade still has to detect this on a non-skipped
	// slot and present the new version when image5 plays. Wait up to 30 s.
	await page.request.post(`${TEST_SERVER}/cbp/switch/image5.png`);

	let image5UpdateSeen = false;
	const deadline = Date.now() + 30000;
	while (Date.now() < deadline && !image5UpdateSeen) {
		const newLogResp = await page.request.get(`${TEST_SERVER}/cbp/head-log`);
		const newLog: { file: string; time: number }[] = await newLogResp.json();
		const image5Heads = newLog.filter((e) => e.file === 'image5.png');
		// At least one HEAD on image5 after the switch (we cleared earlier, so any
		// new image5 HEAD means the lookahead reached it again).
		if (image5Heads.length >= 1) {
			image5UpdateSeen = true;
			break;
		}
		await new Promise((r) => setTimeout(r, 1000));
	}
	expect(image5UpdateSeen).toBe(true);

	await page.request.post(`${TEST_SERVER}/cbp/reset`);
});

// --- Location header strategy tests ---

test('checkBeforePlay (location strategy) detects Location header change and updates image src', async ({
	context,
	page,
}) => {
	await context.addInitScript(`window.__SMIL_URL__ = '${SMIL_URL_LOC}';`);

	// Phase 1: Reset server state and clear emulator storage
	await page.request.post(`${TEST_SERVER}/cbp-loc/reset`);

	await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });
	await page.evaluate(async () => {
		const dbs = await indexedDB.databases();
		for (const db of dbs) {
			if (db.name) indexedDB.deleteDatabase(db.name);
		}
	});

	await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });
	await getStableAppletFrame(page);

	// Wait for image to appear in any iframe
	let imgFrame: Frame | null = null;
	await expect(async () => {
		const frames = page.frames();
		for (const frame of frames) {
			if (frame === page.mainFrame()) continue;
			try {
				const img = frame.locator('img[src*="image"]').first();
				if (await img.isVisible({ timeout: 1000 })) {
					imgFrame = frame;
					return;
				}
			} catch {
				// frame may be detached
			}
		}
		throw new Error('Image not visible in any frame');
	}).toPass({ intervals: [2000], timeout: 60000 });

	expect(imgFrame).toBeTruthy();

	// Phase 2: Capture baseline __smil_version
	const imgLocator = imgFrame!.locator('img[src*="image"]').first();
	const initialSrc = await imgLocator.getAttribute('src');
	expect(initialSrc).toBeTruthy();
	const initialVersion = extractVersion(initialSrc!) ?? initialSrc;
	console.log(`[location] Initial image src: ${initialSrc}`);
	console.log(`[location] Initial version: ${initialVersion}`);

	// Phase 3: Switch content on server (changes Location header URL)
	const switchResponse = await page.request.post(`${TEST_SERVER}/cbp-loc/switch`);
	const switchData = await switchResponse.json();
	console.log(`[location] Server switched to version ${switchData.version}`);

	// Wait for __smil_version to change
	let newVersion: string | null = null;
	await expect(async () => {
		const frames = page.frames();
		for (const frame of frames) {
			if (frame === page.mainFrame()) continue;
			try {
				const img = frame.locator('img[src*="image"]').first();
				const currentSrc = await img.getAttribute('src', { timeout: 2000 });
				if (!currentSrc) continue;
				const currentVersion = extractVersion(currentSrc) ?? currentSrc;
				if (currentVersion !== initialVersion) {
					newVersion = currentVersion;
					return;
				}
			} catch {
				// frame detached
			}
		}
		throw new Error(`[location] Version unchanged, still: ${initialVersion}`);
	}).toPass({ intervals: [1000], timeout: 60000 });

	console.log(`[location] Version changed: ${initialVersion} -> ${newVersion}`);

	// Phase 4: Verify the updated image is actually visible on screen with the new version
	const visibleImg = await getVisibleImage(page);
	expect(visibleImg).toBeTruthy();
	console.log(`[location] Visible image src: ${visibleImg!.src}`);
	console.log(`[location] Visible image version: ${visibleImg!.version}`);
	expect(visibleImg!.version).not.toBe(initialVersion);
});

test('checkBeforePlay (location strategy) detects changes across multiple elements with checkAheadCount', async ({
	context,
	page,
}) => {
	await context.addInitScript(`window.__SMIL_URL__ = '${SMIL_URL_AHEAD_LOC}';`);

	// Phase 1: Reset server state and clear emulator storage
	await page.request.post(`${TEST_SERVER}/cbp-loc/reset`);

	await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });
	await page.evaluate(async () => {
		const dbs = await indexedDB.databases();
		for (const db of dbs) {
			if (db.name) indexedDB.deleteDatabase(db.name);
		}
	});

	await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });
	await getStableAppletFrame(page);

	// Wait for first image to appear
	await expect(async () => {
		const frames = page.frames();
		for (const frame of frames) {
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

	console.log('[location] Images are playing, collecting baseline versions...');

	// Phase 2: Collect baseline versions
	const baselineVersions: Record<string, string> = {};
	const baselineDeadline = Date.now() + 40000;

	while (Date.now() < baselineDeadline && Object.keys(baselineVersions).length < 10) {
		const frames = page.frames();
		for (const frame of frames) {
			if (frame === page.mainFrame()) continue;
			try {
				const imgs = await frame.locator('img').all();
				for (const img of imgs) {
					const src = await img.getAttribute('src');
					if (!src) continue;
					const name = extractImageName(src);
					const version = extractVersion(src);
					if (name && version && !baselineVersions[name]) {
						baselineVersions[name] = version;
					}
				}
			} catch {
				// frame detached
			}
		}
		await new Promise((r) => setTimeout(r, 1000));
	}

	console.log(`[location] Baseline versions collected for ${Object.keys(baselineVersions).length} images`);

	// Phase 3: Switch content on 3 images
	const switchTargets = ['image3.png', 'image6.png', 'image9.png'];
	for (const target of switchTargets) {
		const resp = await page.request.post(`${TEST_SERVER}/cbp-loc/switch/${target}`);
		const data = await resp.json();
		console.log(`[location] Switched ${target} to version ${data.version}`);
	}

	// Phase 4: Wait for switched images to show updated __smil_version
	const updatedImages = new Set<string>();
	const updateDeadline = Date.now() + 90000;

	while (Date.now() < updateDeadline && updatedImages.size < switchTargets.length) {
		const frames = page.frames();
		for (const frame of frames) {
			if (frame === page.mainFrame()) continue;
			try {
				const imgs = await frame.locator('img').all();
				for (const img of imgs) {
					const src = await img.getAttribute('src');
					if (!src) continue;
					const name = extractImageName(src);
					const version = extractVersion(src);
					if (name && version && switchTargets.includes(name)) {
						const baseline = baselineVersions[name];
						if (baseline && version !== baseline && !updatedImages.has(name)) {
							console.log(`[location] ${name}: version changed ${baseline} -> ${version}`);
							updatedImages.add(name);
						}
					}
				}
			} catch {
				// frame detached
			}
		}
		await new Promise((r) => setTimeout(r, 1000));
	}

	console.log(
		`[location] Updated images: ${updatedImages.size}/${switchTargets.length} (${[...updatedImages].join(', ')})`,
	);

	// At least 2 of 3 switched images must show a version change
	expect(updatedImages.size).toBeGreaterThanOrEqual(2);

	// Phase 5: Verify switched images are actually VISIBLE with the new version when playing
	const visiblyVerified = new Set<string>();
	const visibilityDeadline = Date.now() + 35000;

	while (Date.now() < visibilityDeadline && visiblyVerified.size < updatedImages.size) {
		const visible = await getVisibleImage(page);
		if (visible && visible.name && visible.version && updatedImages.has(visible.name)) {
			const baseline = baselineVersions[visible.name];
			if (baseline && visible.version !== baseline && !visiblyVerified.has(visible.name)) {
				console.log(
					`[location] VISIBLE: ${visible.name} displaying with new version ${visible.version} (was ${baseline})`,
				);
				visiblyVerified.add(visible.name);
			}
		}
		await new Promise((r) => setTimeout(r, 500));
	}

	console.log(
		`[location] Visibly verified: ${visiblyVerified.size}/${updatedImages.size} (${[...visiblyVerified].join(', ')})`,
	);
	expect(visiblyVerified.size).toBeGreaterThanOrEqual(2);

	// Phase 6: Verify checkAheadCount via HEAD log pattern
	// Use accumulated HEAD log — sequential cascade concentrates requests at cycle start.
	const logResp = await page.request.get(`${TEST_SERVER}/cbp-loc/head-log`);
	const headLogData: { file: string; time: number }[] = await logResp.json();
	console.log(`[location] HEAD log entries: ${headLogData.length}`);

	const uniqueImages = new Set(headLogData.map((e) => e.file));
	console.log(`[location] Unique images in HEAD log: ${uniqueImages.size} (${[...uniqueImages].join(', ')})`);
	expect(uniqueImages.size).toBeGreaterThan(1);
});
