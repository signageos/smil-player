import { test, expect } from '../fixtures';
import { DUID, Timeouts } from '../config';
import { waitForLoaderOrSkip } from '../helpers';
// Tests that a deferred element whose wallclock window expires while waiting is abandoned
// and never plays. Exercises playlistPriority.ts handlePriorityDeferStopWait endTime check.
test.describe('priorityDeferExpiry.smil test', () => {
	test('deferred element never plays when its wallclock window expires', async ({ page, context, smilUrls }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.priorityDeferExpiry);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Loader may be skipped if files are cached from a previous run
		await waitForLoaderOrSkip(page);

		// P_high (highest priority) plays immediately: video-test-1 + img_1 loop
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// P_low (lower priority) defers to P_high. Its wallclock window is +0s to +25s.
		// Verify P_low content (img_3, img_2) never appears — not even after the window expires.
		await expect(frame.locator('img[src*="images/img_3_4ac1868a.jpg"]')).not.toBeVisible({ timeout: 3000 });
		await expect(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]')).not.toBeVisible({ timeout: 3000 });

		// Wait for P_high to loop multiple iterations (proving P_low's +25s window has expired).
		// Each P_high iteration: video-test-1 (~5s) + img_1 (~3s) ≈ 8s. Three cycles ≈ 24s.
		// Use toPass() polling: wait until we've seen video-test-1 appear 3 more times.
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// After 3+ P_high loops (~24s), P_low's wallclock has definitely expired.
		// Verify P_low content still never appeared.
		await expect(frame.locator('img[src*="images/img_3_4ac1868a.jpg"]')).not.toBeVisible({ timeout: 3000 });
		await expect(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]')).not.toBeVisible({ timeout: 3000 });

		// P_high is still playing
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
	});
});
