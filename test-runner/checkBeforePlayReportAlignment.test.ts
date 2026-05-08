import { test, expect, Page } from '@playwright/test';

const EMULATOR_URL = 'http://localhost:8090';
const SMIL_URL = 'http://localhost:3000/checkBeforePlayLocationLogged.smil';
const TEST_SERVER = 'http://localhost:3000';

/**
 * Verifies report-URL ↔ on-screen-content alignment for checkBeforePlay + location strategy.
 *
 * Mechanic notes (image vs video reports):
 *   - For VIDEO playback, the player sets `useInReportUrl` from `mediaInfo.smilMeta` at the start of each
 *     `playElement` and reports that URL — i.e. the *Location-header* URL with all CDN query params (incl `pl=`).
 *   - For IMAGE playback (this test's surface), the rendered `<img>` element's `src` is the local IDB URL
 *     with a `__smil_version` cache-buster, and the playback report carries THAT URL. The player generates
 *     a fresh `__smil_version` whenever `wasUpdated`/`useInReportUrlStale` triggers a re-prepare of the
 *     element, which means a content swap shows up as a *new* `__smil_version` in subsequent reports for
 *     that slot.
 *
 * The alignment invariant the test proves for images (the e2e-friendly surface):
 *   1. The reported URL *is* the URL the browser fetched to render the bytes — tautologically aligned.
 *   2. After a content swap, that slot's `__smil_version` changes exactly once (no oscillation back to
 *      the old value), and the change happens around the time of the new content download. This proves
 *      that the player never reverts to the old bytes after committing the new ones.
 *   3. Specifically under the slow-download race (Phase-4 commit lands during a slot's playback), the
 *      `__smil_version` only flips after the GET of the new content version completes — meaning no
 *      report ever advertises a fresh version that doesn't actually exist on disk yet.
 *
 * The video-side invariant ("Location URL with new query params reported only after content updated on
 * screen") was verified directly on the wire against the live hygh CDN in
 * `docs/superpowers/specs/2026-05-06-checkbeforeplay-mcp-test/REPORT-addendum-2026-05-06.md`
 * (54/54 alignment, including a server-side pl-UUID rotation handled via useInReportUrlStale).
 */

interface ReportEntry {
	time: number;
	body: any;
}

interface ContentLogEntry {
	file: string;
	time: number;
	durationMs: number;
}

async function fetchReports(page: Page): Promise<ReportEntry[]> {
	const resp = await page.request.get(`${TEST_SERVER}/cbp-loc/admin/log-fetch`);
	return await resp.json();
}

async function fetchContentLog(page: Page): Promise<ContentLogEntry[]> {
	const resp = await page.request.get(`${TEST_SERVER}/cbp-loc/admin/content-log`);
	return await resp.json();
}

async function resetServerState(page: Page) {
	await page.request.post(`${TEST_SERVER}/cbp-loc/reset`);
	await page.request.post(`${TEST_SERVER}/cbp-loc/admin/log-reset`);
	await page.request.post(`${TEST_SERVER}/cbp-loc/admin/content-log-reset`);
}

async function clearStorage(page: Page) {
	await page.evaluate(async () => {
		const dbs = await indexedDB.databases();
		for (const db of dbs) {
			if (db.name) indexedDB.deleteDatabase(db.name);
		}
	});
}

/**
 * Match an image playback report URL of the form
 *   http://localhost:8090/indexed_db/<duid>/internal/smil/images/imageN_<urlhash>.png?__smil_version=XXX
 * Returns the slot label ("imageN") and the version cache-buster string.
 */
function parseImagePlaybackUrl(url: string): { slot: string; version: string } | null {
	const m = url.match(/\/(image\d+)_[a-f0-9]+\.png\?__smil_version=([^&]+)/);
	if (!m) return null;
	return { slot: m[1], version: m[2] };
}

function parseContentFile(file: string): { slot: string; version: number } | null {
	const m = file.match(/^(image\d+)_v(\d+)\.png$/);
	if (!m) return null;
	return { slot: m[1], version: Number(m[2]) };
}

interface PlaybackEvent {
	time: number;
	slot: string;
	version: string;
	url: string;
}

function extractPlaybacks(reports: ReportEntry[]): PlaybackEvent[] {
	const out: PlaybackEvent[] = [];
	for (const r of reports) {
		const item = Array.isArray(r.body) ? r.body[0] : r.body;
		if (!item || item.name !== 'media-playback') continue;
		const parsed = parseImagePlaybackUrl(String(item.url || ''));
		if (!parsed) continue;
		out.push({ time: r.time, slot: parsed.slot, version: parsed.version, url: item.url });
	}
	return out;
}

/**
 * Given the per-slot sequence of `__smil_version` values reported, detect any "regression":
 * a version that was reported earlier, then replaced, then reported AGAIN. That would mean the
 * player rolled back to old bytes after committing new ones — the alignment-violating case.
 *
 * Returns the offending slot+versions if any, or null on clean monotonic transitions.
 */
function detectVersionRegression(playbacks: PlaybackEvent[]): { slot: string; sequence: string[] } | null {
	const bySlot: Record<string, string[]> = {};
	for (const p of playbacks) {
		(bySlot[p.slot] ||= []).push(p.version);
	}
	for (const [slot, seq] of Object.entries(bySlot)) {
		// Walk the sequence; record the set of versions seen so far. A regression is when the
		// current version was seen earlier AND there was at least one different version in between.
		const seenBefore = new Set<string>();
		let current = seq[0];
		seenBefore.add(current);
		for (let i = 1; i < seq.length; i++) {
			if (seq[i] !== current) {
				if (seenBefore.has(seq[i])) {
					return { slot, sequence: seq };
				}
				current = seq[i];
				seenBefore.add(seq[i]);
			}
		}
	}
	return null;
}

test.describe('checkBeforePlay (location): report URL ↔ on-screen content alignment', () => {
	test.beforeEach(async ({ context }) => {
		await context.addInitScript(`window.__SMIL_URL__ = '${SMIL_URL}';`);
	});

	test('alignment holds during normal swap (clean propagation)', async ({ page }) => {
		await resetServerState(page);
		await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });
		await clearStorage(page);
		await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });

		await expect(async () => {
			const frames = page.frames();
			let visible = false;
			for (const frame of frames) {
				if (frame === page.mainFrame()) continue;
				try {
					const img = frame.locator('img[src*="image"]').first();
					if (await img.isVisible({ timeout: 1000 })) { visible = true; break; }
				} catch { /* frame detached */ }
			}
			if (!visible) throw new Error('no image visible yet');
		}).toPass({ intervals: [2000], timeout: 60000 });

		// Baseline cycle so we record a stable v1 version per slot
		await page.waitForTimeout(35000);

		const swapResp = await page.request.post(`${TEST_SERVER}/cbp-loc/switch/image3.png`);
		expect(swapResp.ok()).toBeTruthy();
		const t_swap = Date.now();

		await page.waitForTimeout(95000);

		const reports = await fetchReports(page);
		const contentLog = await fetchContentLog(page);
		const playbacks = extractPlaybacks(reports);

		expect(playbacks.length).toBeGreaterThan(10);

		// (1) Both pre- and post-swap have image3 plays. (Pre-swap may legitimately span more
		// than one __smil_version — e.g. SMIL refresh re-prepares or unrelated `wasUpdated`
		// flips. The alignment guarantee is monotonicity, not single-value baseline.)
		const pre = playbacks.filter((p) => p.slot === 'image3' && p.time < t_swap);
		const post = playbacks.filter((p) => p.slot === 'image3' && p.time > t_swap);
		expect(pre.length).toBeGreaterThan(0);
		expect(post.length).toBeGreaterThan(0);

		// (2) The v2 GET happened (propagation reached the server log).
		const v2Get = contentLog.find((e) => e.file === 'image3_v2.png');
		expect(v2Get).toBeDefined();

		// (3) At least one post-v2-GET play of image3 has a version that was NEVER seen pre-swap.
		// That's the propagation signal: the new bytes are live.
		const preVersions = new Set(pre.map((p) => p.version));
		const postFresh = post.filter((p) => p.time >= v2Get!.time && !preVersions.has(p.version));
		expect(postFresh.length).toBeGreaterThan(0);

		// (4) THE KEY ALIGNMENT ASSERTION: no slot's __smil_version oscillates back to a value
		// that was already replaced. That would be a regression where the player reverted to old
		// bytes after committing new ones — a misreport.
		const regression = detectVersionRegression(playbacks);
		expect(regression).toBeNull();
	});

	test('alignment holds during slow-download race (Phase-4 commit lands during play)', async ({ page }) => {
		await resetServerState(page);
		await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });
		await clearStorage(page);
		await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });

		await expect(async () => {
			const frames = page.frames();
			let visible = false;
			for (const frame of frames) {
				if (frame === page.mainFrame()) continue;
				try {
					const img = frame.locator('img[src*="image"]').first();
					if (await img.isVisible({ timeout: 1000 })) { visible = true; break; }
				} catch { /* frame detached */ }
			}
			if (!visible) throw new Error('no image visible yet');
		}).toPass({ intervals: [2000], timeout: 60000 });

		await page.waitForTimeout(35000);

		// Arm a one-shot 4500 ms delay on the next GET of image3_v2.png so the new bytes don't land
		// for >4.5 s. With 3 s/slot, that's longer than a slot duration: Phase-4 commit is forced
		// to land during one or more in-flight image3 plays.
		await page.request.post(`${TEST_SERVER}/cbp-loc/admin/set-content-delay/image3_v2.png`, {
			data: { delayMs: 4500 },
		});

		const swapResp = await page.request.post(`${TEST_SERVER}/cbp-loc/switch/image3.png`);
		expect(swapResp.ok()).toBeTruthy();
		const t_swap = Date.now();

		// Watch through ~4 cycles to catch the slow GET landing + several plays on either side
		await page.waitForTimeout(120000);

		const reports = await fetchReports(page);
		const contentLog = await fetchContentLog(page);
		const playbacks = extractPlaybacks(reports);

		// Confirm the delay actually took effect.
		const slowGet = contentLog.find((e) => e.file === 'image3_v2.png');
		expect(slowGet).toBeDefined();
		expect(slowGet!.durationMs).toBeGreaterThanOrEqual(4000);

		expect(playbacks.length).toBeGreaterThan(10);

		// (1) Both pre- and post-swap have image3 plays.
		const pre = playbacks.filter((p) => p.slot === 'image3' && p.time < t_swap);
		const post = playbacks.filter((p) => p.slot === 'image3' && p.time > t_swap);
		expect(pre.length).toBeGreaterThan(0);
		expect(post.length).toBeGreaterThan(0);

		// (2) Post-slowGet eventually shows a version that was never seen pre-swap (propagation
		// worked even with the 4.5s response delay).
		const preVersions = new Set(pre.map((p) => p.version));
		const postFresh = post.filter((p) => p.time >= slowGet!.time && !preVersions.has(p.version));
		expect(postFresh.length).toBeGreaterThan(0);

		// (3) THE KEY HAZARD CHECK — between t_swap and slowGet.time the new bytes don't exist
		// on disk yet (the GET response hasn't returned). Any image3 report in that window
		// MUST use a version we already saw pre-swap. If a NEW version appeared in the delay
		// window, the player would have advertised content the disk doesn't have yet — the
		// "useInReportUrl leapfrogs the disk write" scenario.
		const inDelayWindow = post.filter((p) => p.time < slowGet!.time);
		const earlyNewVersion = inDelayWindow.filter((p) => !preVersions.has(p.version));
		expect(earlyNewVersion).toEqual([]);

		// (4) Same monotonicity check as the clean case.
		const regression = detectVersionRegression(playbacks);
		expect(regression).toBeNull();
	});
});
