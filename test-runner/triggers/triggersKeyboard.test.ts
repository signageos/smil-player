import { test, expect } from '../fixtures';
import { DUID, Timeouts } from '../config';
import { testCoordinates } from '../helpers';

test.describe('triggersKeyboard.smil test', () => {
	test('processes smil file correctly', async ({ page, context, smilUrls }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.triggersKeyboard);
		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Initial video visible in full "video" region (1280x720 at 10,10)
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(page.locator('video[src*="videos/video-test_465b7757.mp4"]'), 10, 10, 1280, 720);

		// Trigger keyboard sequence 4-5-6 (trigger2)
		await page.waitForTimeout(Timeouts.transition);
		await page.keyboard.press('4');
		await page.keyboard.press('5');
		await page.keyboard.press('6');

		// Triggered video visible in "video" region
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]'), 10, 10, 640, 720);

		// Triggered video hides, image img4 visible
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img4"]'), 10, 10, 640, 720);

		// img4 hides, triggered video visible again (repeatCount=2)
		await expect(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]'), 10, 10, 640, 720);

		// Triggered video hides, img4 visible again
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img4"]'), 10, 10, 640, 720);

		// img4 hides, img2 visible (back to main playlist after trigger2 repeatCount=2 exhausted)
		await expect(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img2"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img2"]'), 10, 10, 1280, 720);

		// Trigger keyboard sequence 4-5-6 again (trigger2)
		await page.waitForTimeout(Timeouts.transition);
		await page.keyboard.press('4');
		await page.keyboard.press('5');
		await page.keyboard.press('6');

		// trigger2 content plays in "video" region
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]'), 10, 10, 640, 720);

		// Trigger keyboard sequence 7-8-9 (trigger1) — fires while trigger2 is active
		await page.keyboard.press('7');
		await page.keyboard.press('8');
		await page.keyboard.press('9');

		// trigger1 content (video-test-1) takes over the "video" region
		// Both triggers target region="video", so trigger1 replaces trigger2
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// trigger1 video hides, img6 (img_4) visible
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_4_d0d4"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// After trigger1 exhausts (repeatCount=1), back to main playlist
		await expect(frame.locator('img[id*="img_4_d0d4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });

		// Main playlist content resumes
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_465b7757.mp4"]'), 10, 10, 1280, 720);
	});
});
