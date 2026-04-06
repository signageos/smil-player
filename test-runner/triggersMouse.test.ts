import { test, expect } from './fixtures';
import { DUID, Timeouts } from './config';
import { testCoordinates } from './helpers';

test.describe('triggersMouse.smil test', () => {
	test('processes smil file correctly', async ({ page, context, smilUrls }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.triggersMouse);
		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Initial video visible
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(page.locator('video[src*="videos/video-test_465b7757.mp4"]'), 10, 10, 1280, 720);

		// First mouse click trigger
		await page.waitForTimeout(Timeouts.transition);
		await page.click('body');

		// Triggered video visible
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]'), 10, 10, 640, 720);

		// Triggered video hides, img4 visible
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img4"]'), 10, 10, 640, 720);

		// img4 hides, img1 visible (back to main playlist)
		await expect(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img2"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img2"]'), 10, 10, 1280, 720);

		await page.waitForTimeout(Timeouts.transition);

		// Second mouse click trigger
		await page.click('body');

		// Triggered video visible again
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]'), 10, 10, 640, 720);

		// Click during triggered content
		await page.click('body');

		// Triggered video hides, img4 visible
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img4"]'), 10, 10, 640, 720);

		// Click during img4
		await page.click('body');

		// Triggered video visible, img4 hides
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]'), 10, 10, 640, 720);

		// Click again
		await page.click('body');

		// Triggered video hides, img4 visible
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img4"]'), 10, 10, 640, 720);

		// Main video loops back, img4 hides
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_465b7757.mp4"]'), 10, 10, 1280, 720);

		// Main video hides, img1 visible
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img2"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img2"]'), 10, 10, 1280, 720);
	});
});
