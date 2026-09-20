import { test, expect } from '../fixtures';
import { DUID, Timeouts } from '../config';

// Stress repro for the customer report "after swapping one campaign for another on the CMS the
// player keeps playing the old content until an applet reload" (~1% of swaps, stable network).
// The test server renders the customer's playlist shape (see /swap-stress in localServer.ts)
// and swaps ONE campaign slot between loader.mp4 and landscape1.mp4 every SWAP_PERIOD_MS.
// For every bucket the swapped-in video must become visible before the bucket ends; a bucket
// where it never appears is the repro. Opt-in stress tool: skipped unless SWAP_ITERATIONS
// is set (one iteration = one SWAP_PERIOD_MS bucket, 45 s by default), e.g.
//   SWAP_ITERATIONS=30 FROZEN_VIDEO_MODE=report npx playwright test test-runner/priority/campaignSwapStress.test.ts --workers=1 --retries=0
const ITERATIONS = Number(process.env.SWAP_ITERATIONS) || 0;
const SWAP_SLOT: Record<number, string> = {
	0: 'video[src*="videos/loader_"]',
	1: 'video[src*="videos/landscape1_"]',
};

test.describe('campaign swap stress', () => {
	test.skip(!ITERATIONS, 'opt-in stress run: set SWAP_ITERATIONS');
	test('swapped-in campaign takes over after every SMIL update', async ({ page, context, request, testServerBaseUrl }) => {
		const state = await (await request.get(`${testServerBaseUrl}/swap-stress-state`)).json();
		const periodMs: number = state.periodMs;
		test.setTimeout(Timeouts.firstElement + (ITERATIONS + 2) * periodMs);

		await context.addInitScript((url: string) => {
			(window as unknown as { __SMIL_URL__?: string }).__SMIL_URL__ = url;
		}, `${testServerBaseUrl}/swap-stress/campaign.smil`);
		await page.goto(`/?duid=${DUID}`);

		// boot: the constant campaign video proves the playlist is up
		await expect(page.locator('video[src*="videos/video-test_"]').first()).toBeVisible({ timeout: Timeouts.firstElement });

		const bucketOf = (t: number) => Math.floor((t - state.origin) / periodMs);
		const bucketStart = (b: number) => state.origin + b * periodMs;
		const first = bucketOf(Date.now()) + 1;
		const timings: number[] = [];

		for (let b = first; b < first + ITERATIONS; b++) {
			const waitMs = bucketStart(b) - Date.now();
			if (waitMs > 0) {
				await page.waitForTimeout(waitMs);
			}
			const expected = SWAP_SLOT[b % 2];
			const stale = SWAP_SLOT[(b + 1) % 2];
			const started = Date.now();
			try {
				await expect(page.locator(expected), `bucket ${b} (iteration ${b - first + 1}/${ITERATIONS})`).toBeVisible({
					timeout: periodMs - 2000,
				});
			} catch (err) {
				const videos = await page.locator('video').evaluateAll((els) =>
					els.map((v) => ({
						src: (v as HTMLVideoElement).src,
						visible: (v as HTMLElement).offsetParent !== null,
						paused: (v as HTMLVideoElement).paused,
						ended: (v as HTMLVideoElement).ended,
					})),
				);
				const staleVisible = await page.locator(stale).isVisible().catch(() => false);
				await page.screenshot({ path: `test-results/campaign-swap-stress-bucket-${b}.png` });
				// Emulator storage is reachable over HTTP: dump the persisted mediaInfo so a
				// "detected but not downloaded" slot can be told apart from a takeover stall.
				const storage = `http://localhost:8090/indexed_db/${DUID}/internal/smil`;
				const mediaInfo = await page
					.evaluate((url: string) => fetch(url).then((r) => r.text()), `${storage}/info/mediaInfo.smilMeta`)
					.catch((e) => String(e));
				throw new Error(
					`REPRO bucket ${b}: swapped-in video never appeared within ${periodMs}ms; stale still visible=${staleVisible}; `
						+ `videos=${JSON.stringify(videos)}; timings so far=${JSON.stringify(timings)}; `
						+ `mediaInfo=${mediaInfo}; ${(err as Error).message}`,
				);
			}
			timings.push(Date.now() - started);
			console.log(`[swap-stress] bucket ${b}: ${expected} visible after ${Date.now() - started}ms`);
		}
		console.log(`[swap-stress] ${ITERATIONS} swaps OK; time-to-appear ms: ${JSON.stringify(timings)}`);
	});
});
