import { test, expect } from './fixtures';
import { DUID, Timeouts } from './config';

// Tests that the player continues showing the previous playlist when the server
// returns invalid SMIL on refresh, with fallbackToPreviousPlaylist="true".
//
// Flow:
// 1. First GET returns valid SMIL — content plays normally
// 2. ResourceChecker detects Last-Modified change (smilFileRefresh=5s)
// 3. Restart triggers new GET — server returns broken XML (count > 1)
// 4. Player enters fallbackToPreviousPlaylist mode — content stays visible
test.describe('fallbackToPreviousPlaylist.smil test', () => {
	test.beforeEach(async ({ request, testServerBaseUrl }) => {
		// First request returns valid SMIL, subsequent requests return broken XML
		await request.post(`${testServerBaseUrl}/fallback-config`, {
			data: { fileName: 'fallbackToPrevious.smil', invalidAfterCount: 1 },
		});
	});

	test('continues playing previous playlist when new SMIL is invalid', async ({ page, context, smilUrls }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.fallbackToPreviousPlaylist);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Phase 1: Valid SMIL loads, content plays
		await expect(frame.locator('img[src*="landscape1"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await expect(frame.locator('img[src*="landscape2"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// Phase 2: Wait for ResourceChecker to trigger reload (smilFileRefresh=5s)
		// GET returns broken XML → fallbackToPreviousPlaylist kicks in
		// Content should freeze or continue cycling from the cached playlist
		await page.waitForTimeout(20000);

		// Phase 3: Content still visible (not replaced by backup image)
		const img1 = await frame.locator('img[src*="landscape1"]').isVisible().catch(() => false);
		const img2 = await frame.locator('img[src*="landscape2"]').isVisible().catch(() => false);
		expect(img1 || img2).toBe(true);
	});
});
