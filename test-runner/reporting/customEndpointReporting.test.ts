import { test, expect } from '../fixtures';
import { DUID, Timeouts } from '../config';
import { waitForLoaderOrSkip } from '../helpers';

// Tests that the player sends PoP (Proof of Play) reports to a custom endpoint
// when <meta log="true" type="manual" endpoint="http://..."/> is configured.
//
// The player uses native fetch() POST to the endpoint URL after each media is
// downloaded ('media-download') and after it finishes playing ('media-playback').
// The test server captures these payloads at /report and exposes them via
// GET /report/history for assertion. The fixture sets DISTINCT popTags per asset
// (video tag1,tag2 / image tag3,tag4) so each record's payload is checkable
// precisely, not just for existence.
test.describe('customEndpointReporting.smil test', () => {
	test('emits exact media-download + media-playback payloads per asset', async ({ page, context, request, smilUrls, testServerBaseUrl }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.customEndpointReporting);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Wait for loader during prefetch
		await waitForLoaderOrSkip(page);

		// Wait for video to play (on main page)
		await expect(page.locator('video[src*="landscape1"]')).toBeVisible({ timeout: Timeouts.firstElement });

		// Wait for image to appear (in iframe) — indicates video finished, reports sent.
		// Budget spans the full landscape1.mp4 playback (15s): no intro, so
		// waitForLoaderOrSkip returns as soon as the video mounts.
		await expect(frame.locator('img[src*="landscape1"]')).toBeVisible({ timeout: 15_000 + Timeouts.elementAwait });

		// Wait for the second cycle so a media-playback record for each asset exists.
		await expect(page.locator('video[src*="landscape1"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		const response = await request.get(`${testServerBaseUrl}/report/history`);
		const reports = await response.json();
		expect(Array.isArray(reports[0].body)).toBe(true);
		const records: any[] = reports.flatMap((r: any) => r.body);

		const pick = (name: string, type: string) =>
			records.filter((r) => r.name === name && r.type === type);

		// --- media-download: each asset downloaded exactly once, with its own tags + url ---
		const videoDownloads = pick('media-download', 'video');
		const imageDownloads = pick('media-download', 'image');
		expect(videoDownloads.length, 'video downloaded exactly once').toBe(1);
		expect(imageDownloads.length, 'image downloaded exactly once').toBe(1);
		expect(videoDownloads[0].url).toContain('landscape1.mp4');
		expect(videoDownloads[0].tags.slice(0, 2)).toEqual(['tag1', 'tag2']);
		expect(imageDownloads[0].url).toContain('landscape1.jpg');
		expect(imageDownloads[0].tags.slice(0, 2)).toEqual(['tag3', 'tag4']);

		// --- media-playback: video record carries video popTags + the video url ---
		const videoPlays = pick('media-playback', 'video');
		expect(videoPlays.length, 'expected a video media-playback report').toBeGreaterThanOrEqual(1);
		const vp = videoPlays[0];
		expect(vp.playbackSuccess).toBe(true);
		expect(vp.status).toBe(200);
		expect(vp).toHaveProperty('time');
		expect(vp).toHaveProperty('recordedAt');
		expect(vp.url).toContain('landscape1.mp4');
		expect(vp.tags.slice(0, 2)).toEqual(['tag1', 'tag2']);

		// --- media-playback: image record carries image popTags + the image url ---
		const imagePlays = pick('media-playback', 'image');
		expect(imagePlays.length, 'expected an image media-playback report').toBeGreaterThanOrEqual(1);
		const ip = imagePlays[0];
		expect(ip.playbackSuccess).toBe(true);
		expect(ip.url).toContain('landscape1');
		expect(ip.url).toContain('.jpg');
		expect(ip.tags.slice(0, 2)).toEqual(['tag3', 'tag4']);
	});
});
