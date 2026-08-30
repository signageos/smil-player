import { test, expect } from '../fixtures';
import { DUID, Timeouts } from '../config';
import { createConsoleCollector, waitForConsolePattern } from '../helpers';

// Tests that media is skipped when its updateCheckUrl HEAD response returns a
// status code matching skipContentOnHttpStatus in the SMIL meta.
//
// Flow:
// 1. Both images play normally (status-check returns 200)
// 2. Configure server to return 404 for landscape1.jpg HEAD checks
// 3. ResourceChecker fires (contentRefresh=5s), sets the media.skipContentMark flag
// 4. Playlist skips landscape1 — only landscape2 plays
test.describe('skipContentOnHttpStatus.smil test', () => {
	test('skips media when HEAD returns status matching skipContentOnHttpStatus', async ({ page, context, request, smilUrls, testServerBaseUrl }) => {
		// Enable debug output so the [files] sentinel fires when content is skipped.
		const collector = createConsoleCollector(page);

		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
			(window as any).__SYNC_CONFIG__ = { debugEnabled: 'true' };
		}, smilUrls.skipContentOnHttpStatus);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Phase 1: Both images cycle normally
		await expect(frame.locator('img[src*="landscape1"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await expect(frame.locator('img[src*="landscape2"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		// Confirm second cycle
		await expect(frame.locator('img[src*="landscape1"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// Phase 2: Configure 404 for landscape1's updateCheckUrl
		await request.post(`${testServerBaseUrl}/status-config`, {
			data: { fileName: 'landscape1.jpg', statusCode: 404 },
		});

		// Wait for ResourceChecker (contentRefresh=5s) to fire + playlist cycle.
		// Sentinel: the files module must log that landscape1 was skipped due to
		// its HEAD-check status code matching skipContentOnHttpStatus.
		await waitForConsolePattern(collector, 'skipping content (status=', 1, 12000);

		// Give the playlist one full cycle to propagate the skip.
		await page.waitForTimeout(15000);

		// Phase 3: Verify landscape1 no longer appears over multiple playlist cycles
		let landscape1Count = 0;
		for (let i = 0; i < 8; i++) {
			const visible = await frame.locator('img[src*="landscape1"]').isVisible().catch(() => false);
			if (visible) landscape1Count++;
			await page.waitForTimeout(1500);
		}
		expect(landscape1Count).toBe(0);

		// landscape2 must still be cycling — confirms this is a targeted skip,
		// not a general stall of the playlist.
		await expect(frame.locator('img[src*="landscape2"]')).toBeVisible({ timeout: Timeouts.elementAwait });
	});
});
