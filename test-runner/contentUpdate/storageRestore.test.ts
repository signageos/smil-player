import { test, expect } from '../fixtures';
import { DUID, Timeouts } from '../config';

// Covers the smil/storage preservation cache end to end (location strategy):
// preserveFileToStorage on content replacement, checkStorageForContent +
// restoreFromStorage on the way back, wired through parallelDownloadAllFiles.
//
// One <img> slot 204+redirects to /storage-cache/content/image_v{1|2}.png.
//   1. boot on v1            -> v1 downloaded once
//   2. flip to v2            -> v2 downloaded, v1 preserved to smil/storage/images
//   3. flip back to v1       -> v1 restored from storage: media-restored reported,
//                               v1 NEVER fetched from the network a second time
test.describe('storage cache restore', () => {
	test('content replaced and brought back is restored from storage, not re-downloaded', async ({
		page,
		context,
		request,
		smilUrls,
		testServerBaseUrl,
	}) => {
		const gets: Record<string, number> = { v1: 0, v2: 0 };
		page.on('request', (req) => {
			const m = req.method() === 'GET' && req.url().match(/\/storage-cache\/content\/image_(v\d)\.png/);
			if (m) {
				gets[m[1]]++;
			}
		});

		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.storageRestore);
		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		await expect(frame.locator('img[id*="slot_"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await expect.poll(() => gets.v1, { message: 'v1 downloaded on boot' }).toBe(1);

		// Replace the slot's content: v2 downloaded, v1 must be preserved to storage.
		await request.post(`${testServerBaseUrl}/storage-cache/set/2`);
		await expect.poll(() => gets.v2, { message: 'v2 downloaded after the flip', timeout: 40_000 }).toBe(1);

		// Emulator storage is reachable over HTTP; storageInfo.json is keyed by the
		// preserved content URL (no query params).
		const storageInfoUrl = `http://localhost:8090/indexed_db/${DUID}/internal/smil/storage/images/storageInfo.json`;
		await expect
			.poll(() => page.evaluate((u: string) => fetch(u).then((r) => (r.ok ? r.text() : '')), storageInfoUrl), {
				message: 'v1 preserved to smil/storage/images',
				timeout: 20_000,
			})
			.toContain('/storage-cache/content/image_v1.png');

		// Bring v1 back: it must come from storage, reported as media-restored.
		await request.post(`${testServerBaseUrl}/storage-cache/set/1`);
		const restoredReports = async () => {
			const reports = await (await request.get(`${testServerBaseUrl}/report/history`)).json();
			return reports.flatMap((r: any) => r.body).filter((r: any) => r.name === 'media-restored');
		};
		await expect
			.poll(async () => (await restoredReports()).length, {
				message: 'media-restored reported after flipping back to v1',
				timeout: 40_000,
			})
			.toBeGreaterThanOrEqual(1);
		expect((await restoredReports())[0].url, 'media-restored carries the restored content URL').toContain(
			'/storage-cache/content/image_v1.png',
		);

		// The slot keeps rendering and v1 was never fetched again.
		await expect(frame.locator('img[id*="slot_"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		expect(gets.v1, 'v1 must be restored from storage, not downloaded a second time').toBe(1);
	});
});
