import { Frame, Page, BrowserContext } from '@playwright/test';
import { test, expect } from './fixtures';
import { getStableAppletFrame } from './helpers';

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
 * The Last-Modified and Location-header content-update strategies are exercised
 * by identical playback flows — only the served SMIL and the server route base
 * differ (`/cbp` advances Last-Modified, `/cbp-loc` changes the Location header).
 * Each Playwright worker runs its own test server on a unique port (see
 * test-runner/fixtures.ts), so the two bases keep independent state per worker
 * and parallel spec files never collide. Parameterize by strategy; the
 * assertions (a single element / multiple elements pick up the new
 * `__smil_version`) are the same for both.
 */
type CbpStrategy = {
	label: string;
	/** Prefixes console logs so interleaved strategy runs stay distinguishable. */
	logPrefix: string;
	/** SMIL served for the single-element variant. */
	singleSmilUrl: string;
	/** SMIL served for the multi-element (checkAheadCount) variant. */
	multiSmilUrl: string;
	/** Server route base for reset/switch/head-log. */
	endpoint: string;
};

/** Strategy parameters expressed relative to the per-worker test server base URL. */
type CbpStrategyPaths = {
	label: string;
	logPrefix: string;
	singleSmil: string;
	multiSmil: string;
	endpointPath: string;
};

const STRATEGY_PATHS: CbpStrategyPaths[] = [
	{
		label: 'Last-Modified',
		logPrefix: '',
		singleSmil: 'checkBeforePlay.smil',
		multiSmil: 'checkBeforePlayAhead.smil',
		endpointPath: '/cbp',
	},
	{
		label: 'Location header',
		logPrefix: '[location] ',
		singleSmil: 'checkBeforePlayLocation.smil',
		multiSmil: 'checkBeforePlayAheadLocation.smil',
		endpointPath: '/cbp-loc',
	},
];

/** Resolve a strategy's SMIL URLs and endpoint against this worker's server base. */
function resolveStrategy(baseUrl: string, paths: CbpStrategyPaths): CbpStrategy {
	return {
		label: paths.label,
		logPrefix: paths.logPrefix,
		singleSmilUrl: `${baseUrl}/${paths.singleSmil}`,
		multiSmilUrl: `${baseUrl}/${paths.multiSmil}`,
		endpoint: `${baseUrl}${paths.endpointPath}`,
	};
}

/** Reset server state for this strategy, clear emulator IndexedDB, and reload so
 *  the player starts fresh against clean storage. */
async function resetAndBoot(page: Page, endpoint: string) {
	await page.request.post(`${endpoint}/reset`);

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
	await getStableAppletFrame(page);
}

/** Poll all iframes until an `image` <img> is visible (after prefetch + loader). */
async function waitForFirstImage(page: Page) {
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
}

async function runSingleElementContentChange(page: Page, context: BrowserContext, strategy: CbpStrategy) {
	const { logPrefix, endpoint } = strategy;

	// Inject SMIL URL into the applet iframe via window.__SMIL_URL__
	await context.addInitScript(`window.__SMIL_URL__ = '${strategy.singleSmilUrl}';`);

	// Phase 1: Reset server state and clear emulator storage
	await resetAndBoot(page, endpoint);

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
	const initialVersion = extractVersion(initialSrc!) ?? initialSrc;
	console.log(`${logPrefix}Initial image src: ${initialSrc}`);
	console.log(`${logPrefix}Initial version: ${initialVersion}`);

	// Phase 3: Switch content on server (advances Last-Modified / changes Location header)
	const switchResponse = await page.request.post(`${endpoint}/switch`);
	const switchData = await switchResponse.json();
	console.log(`${logPrefix}Server switched to version ${switchData.version}`);

	// Wait for __smil_version to change (poll every 1s, timeout 60s)
	// The image cycles every 5s → HEAD check detects the change
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
				const currentVersion = extractVersion(currentSrc) ?? currentSrc;
				if (currentVersion !== initialVersion) {
					newVersion = currentVersion;
					return;
				}
			} catch {
				// frame detached
			}
		}
		throw new Error(`${logPrefix}Version unchanged, still: ${initialVersion}`);
	}).toPass({ intervals: [1000], timeout: 60000 });

	console.log(`${logPrefix}Version changed: ${initialVersion} -> ${newVersion}`);

	// Phase 4: Verify the updated image is actually visible on screen with the new version
	const visibleImg = await getVisibleImage(page);
	expect(visibleImg).toBeTruthy();
	console.log(`${logPrefix}Visible image src: ${visibleImg!.src}`);
	console.log(`${logPrefix}Visible image version: ${visibleImg!.version}`);
	expect(visibleImg!.version).not.toBe(initialVersion);
}

async function runMultiElementContentChange(page: Page, context: BrowserContext, strategy: CbpStrategy) {
	const { logPrefix, endpoint } = strategy;

	// Inject SMIL URL for the multi-element SMIL
	await context.addInitScript(`window.__SMIL_URL__ = '${strategy.multiSmilUrl}';`);

	// Phase 1: Reset server state and clear emulator storage
	await resetAndBoot(page, endpoint);

	// Wait for first image to appear in iframe
	await waitForFirstImage(page);

	console.log(`${logPrefix}Images are playing, collecting baseline versions from all img elements...`);

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

	console.log(`${logPrefix}Baseline versions collected for ${Object.keys(baselineVersions).length} images`);

	// Phase 3: Switch content on 3 images
	const switchTargets = ['image3.png', 'image6.png', 'image9.png'];
	for (const target of switchTargets) {
		const resp = await page.request.post(`${endpoint}/switch/${target}`);
		const data = await resp.json();
		console.log(`${logPrefix}Switched ${target} to version ${data.version}`);
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
							console.log(`${logPrefix}${name}: version changed ${baseline} -> ${version}`);
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

	console.log(`${logPrefix}Updated images: ${updatedImages.size}/${switchTargets.length} (${[...updatedImages].join(', ')})`);

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
				console.log(`${logPrefix}VISIBLE: ${visible.name} displaying with new version ${visible.version} (was ${baseline})`);
				visiblyVerified.add(visible.name);
			}
		}
		await new Promise((r) => setTimeout(r, 500));
	}

	console.log(`${logPrefix}Visibly verified: ${visiblyVerified.size}/${updatedImages.size} (${[...visiblyVerified].join(', ')})`);
	expect(visiblyVerified.size).toBeGreaterThanOrEqual(2);

	// Phase 6: Verify checkAheadCount via HEAD log pattern
	// Use accumulated HEAD log from the entire test — the sequential cascade concentrates
	// HEAD requests at the start of each cycle, so a short time window may miss them.
	const logResp = await page.request.get(`${endpoint}/head-log`);
	const headLogData: { file: string; time: number }[] = await logResp.json();
	console.log(`${logPrefix}HEAD log entries: ${headLogData.length}`);

	// With checkAheadCount=3, the player checks multiple elements ahead via sequential cascade.
	// Verify we see more than 1 unique image in the accumulated HEAD requests.
	const uniqueImages = new Set(headLogData.map((e) => e.file));
	console.log(`${logPrefix}Unique images in HEAD log: ${uniqueImages.size} (${[...uniqueImages].join(', ')})`);
	expect(uniqueImages.size).toBeGreaterThan(1);
}

for (const paths of STRATEGY_PATHS) {
	test(`checkBeforePlay (${paths.label}) detects a single-element content change and updates image src`, async ({
		context,
		page,
		testServerBaseUrl,
	}) => {
		await runSingleElementContentChange(page, context, resolveStrategy(testServerBaseUrl, paths));
	});
}

for (const paths of STRATEGY_PATHS) {
	test(`checkBeforePlay (${paths.label}) detects content changes across multiple elements with checkAheadCount`, async ({
		context,
		page,
		testServerBaseUrl,
	}) => {
		await runMultiElementContentChange(page, context, resolveStrategy(testServerBaseUrl, paths));
	});
}

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
async function getVisibleImage(page: Page): Promise<{ name: string | null; version: string | null; src: string } | null> {
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

test('checkAheadCount fires one HEAD per playback transition (no cascade racing-ahead)', async ({
	context,
	page,
	testServerBaseUrl,
}) => {
	const TEST_SERVER = testServerBaseUrl;
	const SMIL_URL_AHEAD = `${testServerBaseUrl}/checkBeforePlayAhead.smil`;
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

test('checkAheadCount HEADs exactly the slot +checkAheadCount ahead (not next-N, no pipeline lag)', async ({
	context,
	page,
	testServerBaseUrl,
}) => {
	const TEST_SERVER = testServerBaseUrl;
	const SMIL_URL_AHEAD_LOC = `${testServerBaseUrl}/checkBeforePlayAheadLocation.smil`;
	// Regression guard for the play-queue lag bug. processPlaylist iterates ahead of the
	// visible playback (the play IIFE pushed by playElement runs concurrently while the
	// loop moves on), so firing prefetchAheadElements *before* awaiting playElement made
	// the HEAD land while a slot from 1–2 positions earlier was on screen, inflating the
	// perceived offset by the play-queue depth. Fix fires the HEAD *after* playElement
	// returns — at that point the previous slot's IIFE has resolved and the current slot
	// has just been pushed to screen.
	//
	// Uses the location-strategy SMIL (count=3, 10 images, 3s each). For each HEAD we
	// align it against z-index-based visibility to confirm offset === 3 in steady state.
	await context.addInitScript(`window.__SMIL_URL__ = '${SMIL_URL_AHEAD_LOC}';`);

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

	// Wait for first image to appear + cycle stabilization
	await expect(async () => {
		for (const frame of page.frames()) {
			if (frame === page.mainFrame()) continue;
			try {
				const img = frame.locator('img[src*="image"]').first();
				if (await img.isVisible({ timeout: 1000 })) return;
			} catch {}
		}
		throw new Error('Image not visible in any frame');
	}).toPass({ intervals: [2000], timeout: 60000 });
	await new Promise((r) => setTimeout(r, 5000));

	// Start z-index based visibility polling in the iframe — z-index is what decides
	// which image is on top, so this matches user-perceived "currently playing".
	await page.evaluate(() => {
		const frame = (window as any).frames[0];
		const doc = frame.document;
		(window as any).__visLog = [];
		const getTop = () => {
			const imgs = ([...doc.querySelectorAll('img')] as HTMLImageElement[]).filter((i) => i.src);
			const cands = imgs
				.filter((i) => {
					const cs = frame.getComputedStyle(i);
					return cs.visibility !== 'hidden' && cs.display !== 'none';
				})
				.map((i) => ({ i, z: parseInt(frame.getComputedStyle(i).zIndex) || 0 }));
			cands.sort((a, b) => b.z - a.z);
			return cands[0]?.i;
		};
		const poll = () => {
			const t = getTop();
			if (!t) return;
			const m = t.src.match(/image(\d+)/);
			if (!m) return;
			const slot = parseInt(m[1]);
			const now = Date.now();
			const last = (window as any).__visLog[(window as any).__visLog.length - 1];
			if (!last || last.v !== slot) (window as any).__visLog.push({ t: now, v: slot });
		};
		(window as any).__pollI = setInterval(poll, 50);
		poll();
	});

	await page.request.post(`${TEST_SERVER}/cbp-loc/clear-head-log`);
	await new Promise((r) => setTimeout(r, 30000));

	const visLog: { t: number; v: number }[] = await page.evaluate(() => {
		clearInterval((window as any).__pollI);
		return (window as any).__visLog;
	});
	const headLog: { file: string; time: number }[] = await (
		await page.request.get(`${TEST_SERVER}/cbp-loc/head-log`)
	).json();

	const checkAheadCount = 3;
	const N = 10;

	// The lookahead fires exactly ONE HEAD per playback transition, for the slot
	// `checkAheadCount` positions ahead: playlistProcessor.prefetchAheadElements
	// starts its scan at offset=count and breaks on the first healthy target, so the
	// intervening slots playing+1..playing+count-1 are never HEADed. The HEAD fires
	// right AFTER the current slot is pushed to screen, so it lands at the very start
	// of slot K's on-screen interval.
	//
	// We therefore pair each visible-slot transition (slot K becomes top at t_K) with
	// its nearest HEAD in time — the server's Date.now() and the in-page Date.now()
	// share one system clock — and assert that HEAD targets exactly K+count. Pairing
	// on the transition timestamp, NOT on "the slot visible at the HEAD instant",
	// removes the bimodal count/count+1 artifact the old median guard had to tolerate
	// (the HEAD lands on the K-becomes-visible boundary, which the 50ms poll reads as
	// K or K-1). The old median≤count+1 check also silently passed for a +1-only — or
	// any ≤count+1 — lookahead; this pins the offset to exactly count.

	// Collapse z-index flicker: real slot changes are ~3s apart, so any "transition"
	// <1500ms after the previously kept one is a render flicker, not a slot change.
	const cleaned: { t: number; v: number }[] = [];
	for (const e of visLog) {
		if (!cleaned.length || e.t - cleaned[cleaned.length - 1].t >= 1500) cleaned.push(e);
	}
	// Drop the first kept transition — it may predate clear-head-log / still be warming up.
	const transitions = cleaned.slice(1);

	const slotOf = (file: string) => parseInt(file.replace('image', '').replace('.png', ''), 10);
	const PAIR_WINDOW_MS = 800; // « the 3s slot, so only THIS transition's HEAD qualifies

	const pairs: { playing: number; target: number; offset: number; dt: number }[] = [];
	for (const tr of transitions) {
		let best: { file: string; time: number } | undefined;
		let bestDt = Infinity;
		for (const h of headLog) {
			const dt = Math.abs(h.time - tr.t);
			if (dt < bestDt) {
				bestDt = dt;
				best = h;
			}
		}
		if (!best || bestDt > PAIR_WINDOW_MS) continue;
		const target = slotOf(best.file);
		pairs.push({ playing: tr.v, target, offset: (target - tr.v + N) % N, dt: bestDt });
	}
	console.log(
		`Transition→HEAD pairs:\n` +
			pairs.map((p) => `  playing ${p.playing} → HEAD ${p.target} (offset ${p.offset}, dt ${p.dt}ms)`).join('\n'),
	);

	// One HEAD per transition: a single-target lookahead emits ~one HEAD per ~3s slot.
	// A "next-N" cascade would emit `count` HEADs per transition (a burst), inflating
	// the total ~count× and collapsing inter-arrival gaps below the slot duration.
	expect(
		headLog.length,
		`expected ~one HEAD per transition (~${transitions.length}), not a per-transition burst`,
	).toBeLessThanOrEqual(transitions.length + 3);
	const gaps: number[] = [];
	for (let i = 1; i < headLog.length; i++) gaps.push(headLog[i].time - headLog[i - 1].time);
	const minGap = gaps.length ? Math.min(...gaps) : Infinity;
	expect(minGap, 'consecutive HEADs <1500ms apart indicate a racing/cascade burst').toBeGreaterThanOrEqual(1500);

	// Enough clean pairs to be meaningful.
	expect(pairs.length, 'need ≥6 clean transition→HEAD pairs to assert the offset').toBeGreaterThanOrEqual(6);

	// Intervening slots (offset 1..count-1) must NEVER be HEADed — this is the
	// signature that separates a +count lookahead from a "next-N"/next-element one.
	// (If this ever flakes, suspect cross-file /cbp-loc/ contention first — a
	// concurrent worker running checkBeforePlayReportAlignment also mutates that
	// shared server state — not the offset math, which is deterministic per the fixture.)
	const intervening = pairs.filter((p) => p.offset >= 1 && p.offset < checkAheadCount);
	expect(
		intervening,
		`intervening slots (offset 1..${checkAheadCount - 1}) must never be HEADed: ${JSON.stringify(intervening)}`,
	).toHaveLength(0);

	// Every paired transition HEADs exactly the slot +checkAheadCount ahead.
	const wrong = pairs.filter((p) => p.offset !== checkAheadCount);
	expect(wrong, `every transition must HEAD exactly +${checkAheadCount}; offenders: ${JSON.stringify(wrong)}`).toHaveLength(0);
});

test('checkAheadCount re-checks a skipContent slot (so it can recover) without stalling or racing', async ({
	context,
	page,
	testServerBaseUrl,
}) => {
	const TEST_SERVER = testServerBaseUrl;
	const SMIL_URL_SKIP = `${testServerBaseUrl}/checkBeforePlaySkipContent.smil`;
	// With one slot in the playlist returning 404 (skipContentOnHttpStatus="404"),
	// the lookahead must:
	//   1. mark that slot with the skipContentMark flag;
	//   2. keep re-checking the 404'd slot on later cycles (one HEAD per cycle) so it can
	//      recover when the URL serves content again — it must NOT be permanently excluded;
	//   3. keep firing at most one HEAD per playback transition (no racing-ahead bursts);
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

	// image10 (404'd) must keep being re-checked in steady state — the lookahead HEADs it
	// ~once per cycle so it can recover if the URL starts serving content again. (Permanent
	// exclusion here was the 1.1.27 regression that this asserts against.)
	expect(byFile['image10.png'] || 0).toBeGreaterThanOrEqual(1);
	expect(byFile['image10.png'] || 0).toBeLessThanOrEqual(6);

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

test('checkAheadCount prefetches the next playable element when the lookahead target is skipContent', async ({
	context,
	page,
	testServerBaseUrl,
}) => {
	const TEST_SERVER = testServerBaseUrl;
	const SMIL_URL_SKIP = `${testServerBaseUrl}/checkBeforePlaySkipContent.smil`;
	// "Find next playable element": when the K+count lookahead target is a 404'd skipContent
	// slot, the lookahead must cascade forward to also prefetch the next PLAYABLE element in
	// the SAME transition — otherwise (consecutive 404'd slots are skipped in ~100 ms) the
	// upcoming playable content gets no lead time. image5 is forced to 404; the next playable
	// slot image6 must be HEAD-checked together with image5's recovery HEAD (clustered in time),
	// not seconds later just before it plays.
	test.setTimeout(240000);

	await context.addInitScript(`window.__SMIL_URL__ = '${SMIL_URL_SKIP}';`); // 10 images, checkAheadCount=3

	await page.request.post(`${TEST_SERVER}/cbp/reset`);
	await page.request.post(`${TEST_SERVER}/cbp/skip-mode/image5.png`); // force the K+count target to 404

	await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });
	await page.evaluate(async () => {
		const dbs = await indexedDB.databases();
		for (const db of dbs) {
			if (db.name) indexedDB.deleteDatabase(db.name);
		}
	});
	await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });
	await getStableAppletFrame(page);

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

	await new Promise((r) => setTimeout(r, 5000)); // flush initial bulk-download burst
	await page.request.post(`${TEST_SERVER}/cbp/clear-head-log`);
	await new Promise((r) => setTimeout(r, 35000)); // ~3 full cycles

	const logResp = await page.request.get(`${TEST_SERVER}/cbp/head-log`);
	const headLog: { file: string; time: number }[] = await logResp.json();
	const t5 = headLog.filter((e) => e.file === 'image5.png').map((e) => e.time);
	const t6 = headLog.filter((e) => e.file === 'image6.png').map((e) => e.time);
	console.log(`image5 HEADs: ${t5.length}, image6 HEADs: ${t6.length}`);

	// image5 (404'd) is re-checked, and image6 (next playable) is prefetched.
	expect(t5.length).toBeGreaterThanOrEqual(1);
	expect(t6.length).toBeGreaterThanOrEqual(1);

	// Lead time: at least one image6 HEAD is clustered with an image5 HEAD (same cascade,
	// ~ms apart). Without the cascade image6 is only HEADed ~one slot (≈3 s) later, just
	// before it plays. < 1500 ms cleanly distinguishes the cascade from that starved case.
	let minGap = Infinity;
	for (const a of t5) {
		for (const b of t6) {
			minGap = Math.min(minGap, Math.abs(b - a));
		}
	}
	console.log(`min |image6 - image5| HEAD gap: ${minGap} ms`);
	expect(minGap).toBeLessThan(1500);

	await page.request.post(`${TEST_SERVER}/cbp/reset`);
});

test('checkAheadCount: skipContent element RECOVERS once the URL serves content again', async ({
	context,
	page,
	testServerBaseUrl,
}) => {
	const TEST_SERVER = testServerBaseUrl;
	const SMIL_URL_SKIP = `${testServerBaseUrl}/checkBeforePlaySkipContent.smil`;
	// Regression repro for the 1.1.27 break (commit 63ee3ff added the
	// `if (media.skipContentMark) continue;` cascade in prefetchAheadElements).
	// Scenario matching the production report:
	//   1. image10 serves 200 and is requested normally (baseline).
	//   2. image10 starts returning 404 -> player sets its skipContentMark flag.
	//   3. image10 starts serving 200 again (recovery).
	// EXPECTED: the player issues a HEAD on image10 again and it can play.
	// BUGGY (current): the lookahead cascades past skipContent forever, so image10
	//   is never HEAD-checked again -> stays permanently skipped.
	test.setTimeout(300000);

	const headCount = async (file: string): Promise<number> => {
		const resp = await page.request.get(`${TEST_SERVER}/cbp/head-log`);
		const log: { file: string; time: number }[] = await resp.json();
		return log.filter((e) => e.file === file).length;
	};

	await context.addInitScript(`window.__SMIL_URL__ = '${SMIL_URL_SKIP}';`);
	await page.request.post(`${TEST_SERVER}/cbp/reset`); // image10 starts at 200, no skip-mode

	await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });
	await page.evaluate(async () => {
		const dbs = await indexedDB.databases();
		for (const db of dbs) {
			if (db.name) indexedDB.deleteDatabase(db.name);
		}
	});
	await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });
	await getStableAppletFrame(page);

	// Wait until image playback starts.
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

	// Phase 1 — BASELINE: image10 (200) is requested at least once per cycle.
	await new Promise((r) => setTimeout(r, 5000)); // let bulk-download burst flush
	await page.request.post(`${TEST_SERVER}/cbp/clear-head-log`);
	await new Promise((r) => setTimeout(r, 35000)); // ~1 full cycle (10 x 3 s)
	const baselineHeads = await headCount('image10.png');
	console.log(`[baseline] image10 HEADs while serving 200: ${baselineHeads}`);
	expect(baselineHeads).toBeGreaterThanOrEqual(1);

	// Phase 2 — make image10 return 404; the lookahead will mark it skipContent.
	await page.request.post(`${TEST_SERVER}/cbp/skip-mode/image10.png`); // on (404)
	await new Promise((r) => setTimeout(r, 40000)); // ~1.3 cycles -> HEAD lands, marks skipContent

	// Phase 3 — RECOVER: image10 serves 200 again. Clear the log and watch for re-checks.
	await page.request.post(`${TEST_SERVER}/cbp/clear-head-log`);
	await page.request.post(`${TEST_SERVER}/cbp/skip-mode/image10.png?on=0`); // back to 200
	await new Promise((r) => setTimeout(r, 50000)); // ~1.7 cycles

	const recoveryHeads = await headCount('image10.png');
	console.log(`[recovery] image10 HEADs after URL recovered to 200: ${recoveryHeads}`);

	// The core assertion: after the URL recovers, the player must request it again.
	expect(recoveryHeads).toBeGreaterThanOrEqual(1);

	await page.request.post(`${TEST_SERVER}/cbp/reset`);
});

test('checkBeforePlay (no checkAheadCount): skipContent element RECOVERS once the URL serves content again', async ({
	context,
	page,
	testServerBaseUrl,
}) => {
	const TEST_SERVER = testServerBaseUrl;
	const SMIL_URL_NOAHEAD_SKIP = `${testServerBaseUrl}/checkBeforePlayNoAheadSkip.smil`;
	// Same recovery scenario but for the inline (no-lookahead) path. With checkBeforePlay
	// and no checkAheadCount, the HEAD happens right before the element plays via
	// runPrePlayCheck. resolveContentAvailability:2537 fast-skips skipContent BEFORE
	// reaching runPrePlayCheck, so a 404'd element is never re-HEADed inline -> no recovery.
	test.setTimeout(300000);

	const headCount = async (file: string): Promise<number> => {
		const resp = await page.request.get(`${TEST_SERVER}/cbp/head-log`);
		const log: { file: string; time: number }[] = await resp.json();
		return log.filter((e) => e.file === file).length;
	};

	await context.addInitScript(`window.__SMIL_URL__ = '${SMIL_URL_NOAHEAD_SKIP}';`);
	await page.request.post(`${TEST_SERVER}/cbp/reset`); // image3 starts at 200, no skip-mode

	await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });
	await page.evaluate(async () => {
		const dbs = await indexedDB.databases();
		for (const db of dbs) {
			if (db.name) indexedDB.deleteDatabase(db.name);
		}
	});
	await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });
	await getStableAppletFrame(page);

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

	// Phase 1 — BASELINE: image3 (200) is requested at least once per cycle (4 x 3 s = 12 s).
	await new Promise((r) => setTimeout(r, 5000));
	await page.request.post(`${TEST_SERVER}/cbp/clear-head-log`);
	await new Promise((r) => setTimeout(r, 16000));
	const baselineHeads = await headCount('image3.png');
	console.log(`[noahead baseline] image3 HEADs while serving 200: ${baselineHeads}`);
	expect(baselineHeads).toBeGreaterThanOrEqual(1);

	// Phase 2 — make image3 return 404; the inline check marks it skipContent.
	await page.request.post(`${TEST_SERVER}/cbp/skip-mode/image3.png`);
	await new Promise((r) => setTimeout(r, 18000));

	// Phase 3 — RECOVER to 200 and watch for re-checks.
	await page.request.post(`${TEST_SERVER}/cbp/clear-head-log`);
	await page.request.post(`${TEST_SERVER}/cbp/skip-mode/image3.png?on=0`);
	await new Promise((r) => setTimeout(r, 24000));

	const recoveryHeads = await headCount('image3.png');
	console.log(`[noahead recovery] image3 HEADs after URL recovered to 200: ${recoveryHeads}`);
	expect(recoveryHeads).toBeGreaterThanOrEqual(1);

	await page.request.post(`${TEST_SERVER}/cbp/reset`);
});
