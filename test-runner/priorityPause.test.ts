import { test, expect } from '@playwright/test';
import { DUID, Timeouts, SMILUrls } from './config';

// Tests higher="pause" priority behavior: when a higher-priority element activates,
// the lower-priority element is paused (contentPause=9999999) rather than stopped.
// When the higher-priority window ends, the paused element resumes from where it left off.
// The pause mechanism freezes the seq at its current transition point — the element
// finishes its current media, then waits. On resume, it continues with the next element.
// Resume position depends on exact pause timing, so assertions use flexible selectors.
test.describe('priorityPause.smil test', () => {
	test('lower-priority content pauses and resumes when higher-priority ends', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.priorityPause);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Loader may be skipped if files are cached from a previous run
		try {
			await expect(page.locator('video[src*="videos/loader_871e2ff0.mp4"]')).toBeVisible({ timeout: 10000 });
		} catch {
			// Files cached — loader was hidden or skipped
		}

		// P3 (lowest, always active): img_1 + img_2 + video-test-1 loop
		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await expect(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// P2 interrupts P3 (pauses it) at +20s: img_3 + video-test-2 loop
		await expect(frame.locator('img[src*="images/img_3_4ac1868a.jpg"]')).toBeVisible({ timeout: Timeouts.priorityTransition });

		await expect(page.locator('video:visible[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await page.waitForTimeout(Timeouts.videoTransition);

		// P1 interrupts P2 (pauses it) at +50s: video-test-1 + img_1 loop
		await expect(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.priorityTransition });

		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// P1 plays another iteration
		await expect(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// P1 wallclock ends at +70s → P2 resumes from pause point (not restart).
		// P2 content: img_3 (iframe) or video-test-2 (main page) depending on exact pause timing.
		// Check for video-test-2 which will appear within the transition window regardless of
		// whether P2 resumed at img_3 (plays briefly, then video) or directly at video-test-2.
		await expect(page.locator('video:visible[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.priorityTransition });

		// Followed by next P2 content to confirm it's looping
		await expect(frame.locator('img[src*="images/img_3_4ac1868a.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// P2 wallclock ends at +100s → P3 resumes from pause point (was paused at +20s).
		// P3 content: img_1, img_2 (iframe) or video-test-1 (main page) — resume position varies.
		await expect(
			frame.locator('img[src*="images/img_1_aba14e1e.jpg"]:visible, img[src*="images/img_2_18b5d21f.jpg"]:visible')
		).toBeVisible({ timeout: Timeouts.priorityTransition });
	});
});
