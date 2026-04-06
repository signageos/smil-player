import { test, expect } from './fixtures';
import { DUID, Timeouts, SMILUrls } from './config';
import { testCoordinates } from './helpers';

test.describe('triggersKeyboard.smil test', () => {
	test('processes smil file correctly', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.triggersKeyboard);
		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Initial video visible
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(page.locator('video[src*="videos/video-test_465b7757.mp4"]'), 10, 10, 1280, 720);

		// Trigger keyboard sequence 4-5-6
		await page.waitForTimeout(Timeouts.transition);
		await page.keyboard.press('4');
		await page.keyboard.press('5');
		await page.keyboard.press('6');

		// Triggered video visible
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]'), 10, 10, 640, 720);

		// Triggered video hides, image img4 visible
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img4"]'), 10, 10, 640, 720);

		// img4 hides, triggered video visible again
		await expect(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]'), 10, 10, 640, 720);

		// Triggered video hides, img4 visible again
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img4"]'), 10, 10, 640, 720);

		// img4 hides, img1 visible (back to main playlist)
		await expect(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img2"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img2"]'), 10, 10, 1280, 720);

		// Trigger keyboard sequence 4-5-6 again (player is in stable state after assertion above)
		await page.waitForTimeout(Timeouts.transition);
		await page.keyboard.press('4');
		await page.keyboard.press('5');
		await page.keyboard.press('6');

		// Trigger keyboard sequence 7-8-9 (send immediately after first sequence)
		await page.keyboard.press('7');
		await page.keyboard.press('8');
		await page.keyboard.press('9');

		// Two triggered regions visible simultaneously
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]'), 10, 10, 640, 720);

		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_465b7757.mp4"]'), 10, 650, 640, 720);

		// First region: video hides, img4 visible
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img4"]'), 10, 10, 640, 720);

		// Second region: video hides, img6 visible
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_4_d0d4"][id*=".jpg-video-img6"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_4_d0d4"][id*=".jpg-video-img6"]'), 10, 650, 640, 720);

		// First region: img4 hides, video visible again
		await expect(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]'), 10, 10, 640, 720);

		// Second region: img6 hides
		await expect(frame.locator('img[id*="img_4_d0d4"][id*=".jpg-video-img6"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });

		// First region: video hides, img4 visible
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img4"]'), 10, 10, 640, 720);

		// img4 hides, img1 visible (back to main playlist)
		await expect(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img2"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img2"]'), 10, 10, 1280, 720);

		// Main video loops back
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img2"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_465b7757.mp4"]'), 10, 10, 1280, 720);
	});
});
