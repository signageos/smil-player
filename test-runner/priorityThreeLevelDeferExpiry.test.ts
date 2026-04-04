import { test, expect } from './fixtures';
import { DUID, Timeouts, SMILUrls } from './config';

// Tests three-level defer with middle priority expiry: P1 (highest) plays, P2 (middle)
// and P3 (lowest) both defer. P2's wallclock expires at +15s while deferred behind P1.
// When P1 ends at +30s, P2 should be abandoned (expired) and P3 should play.
// Exercises the cascaded re-evaluation in handleDeferBehaviour (getIndexOfPlayingMedia
// after defer release) combined with handlePriorityDeferStopWait endTime expiry.
test.describe('priorityThreeLevelDeferExpiry.smil test', () => {
	test('expired middle priority skipped, lowest priority plays after highest ends', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.priorityThreeLevelDeferExpiry);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Loader may be skipped if files are cached from a previous run
		try {
			await expect(page.locator('video[src*="videos/loader_871e2ff0.mp4"]')).toBeVisible({ timeout: 10000 });
		} catch {
			// Files cached — loader was hidden or skipped
		}

		// P1 (highest priority) plays immediately: video-test-1 + img_1 loop
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// P2 (middle, img_3) and P3 (lowest, img_2) should NOT be visible — both deferred
		await expect(frame.locator('img[src*="images/img_3_4ac1868a.jpg"]')).not.toBeVisible({ timeout: 3000 });
		await expect(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]')).not.toBeVisible({ timeout: 3000 });

		// P1 continues looping while P2's wallclock expires at +15s
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// P1 wallclock ends at +30s → P2 abandoned (expired at +15s), P3 finally plays
		// P3 content: img_2 + video-test-2
		await expect(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]')).toBeVisible({ timeout: Timeouts.priorityTransition });

		// Verify P2 content (img_3) did NOT appear — it was abandoned due to expiry
		await expect(frame.locator('img[src*="images/img_3_4ac1868a.jpg"]')).not.toBeVisible({ timeout: 3000 });

		// P3 continues: video-test-2 plays
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// P3 loops: img_2 again
		await expect(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });
	});
});
