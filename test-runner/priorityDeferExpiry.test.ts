import { test, expect } from '@playwright/test';
import { DUID, Timeouts, SMILUrls } from './config';
// Tests that a deferred element whose wallclock window expires while waiting is abandoned
// and never plays. Exercises playlistPriority.ts handlePriorityDeferStopWait endTime check.
test.describe('priorityDeferExpiry.smil test', () => {
	test('deferred element never plays when its wallclock window expires', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.priorityDeferExpiry);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Loader may be skipped if files are cached from a previous run
		try {
			await expect(page.locator('video[src*="videos/loader_871e2ff0.mp4"]')).toBeVisible({ timeout: 10000 });
		} catch {
			// Files cached — loader was hidden or skipped
		}

		// P_high (highest priority) plays immediately: video-test-1 + img_1 loop
		await expect(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// P_low (lower priority) defers to P_high. Its wallclock window is +0s to +25s.
		// Verify P_low content (img_3, img_2) never appears — not even after the window expires.
		await expect(frame.locator('img[src*="images/img_3_4ac1868a.jpg"]')).not.toBeVisible({ timeout: 3000 });
		await expect(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]')).not.toBeVisible({ timeout: 3000 });

		// P_high continues looping while P_low's window expires (at ~25s)
		await expect(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// Wait past P_low's wallclock expiry (+25s) and verify it still hasn't appeared
		await page.waitForTimeout(20000);

		await expect(frame.locator('img[src*="images/img_3_4ac1868a.jpg"]')).not.toBeVisible({ timeout: 3000 });
		await expect(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]')).not.toBeVisible({ timeout: 3000 });

		// P_high is still playing
		await expect(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
	});
});
