import { test, expect, Frame } from '@playwright/test';

const EMULATOR_URL = 'http://localhost:8090';
const SMIL_URL = 'http://localhost:3000/checkBeforePlay.smil';
const SMIL_URL_AHEAD = 'http://localhost:3000/checkBeforePlayAhead.smil';
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
	// Clear log and wait for a few image transitions
	await page.request.post(`${TEST_SERVER}/cbp/clear-head-log`);
	await new Promise((r) => setTimeout(r, 8000)); // ~2-3 image cycles at 3s each

	const logResp = await page.request.get(`${TEST_SERVER}/cbp/head-log`);
	const headLogData: { file: string; time: number }[] = await logResp.json();
	console.log(`HEAD log entries: ${headLogData.length}`);

	// With checkAheadCount=3, the player should HEAD-check multiple distinct images
	// (not just the currently playing one). Verify we see more than 1 unique image.
	const uniqueImages = new Set(headLogData.map((e) => e.file));
	console.log(`Unique images in HEAD log: ${uniqueImages.size} (${[...uniqueImages].join(', ')})`);
	expect(uniqueImages.size).toBeGreaterThan(1);
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
	await page.request.post(`${TEST_SERVER}/cbp-loc/clear-head-log`);
	await new Promise((r) => setTimeout(r, 8000));

	const logResp = await page.request.get(`${TEST_SERVER}/cbp-loc/head-log`);
	const headLogData: { file: string; time: number }[] = await logResp.json();
	console.log(`[location] HEAD log entries: ${headLogData.length}`);

	const uniqueImages = new Set(headLogData.map((e) => e.file));
	console.log(`[location] Unique images in HEAD log: ${uniqueImages.size} (${[...uniqueImages].join(', ')})`);
	expect(uniqueImages.size).toBeGreaterThan(1);
});
