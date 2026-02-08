import { test, expect } from '@playwright/test';
import { DUID, Timeouts, SMILUrls } from './config';
import { testCoordinates } from './helpers';

test.describe('triggersMouse.smil test', () => {
	test('processes smil file correctly', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.triggersMouse);
		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Initial video visible
		await expect(page.locator('video[src*="videos/video-test_17354648.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(page.locator('video[src*="videos/video-test_17354648.mp4"]'), 10, 10, 1280, 720);

		// First mouse click trigger
		await page.waitForTimeout(Timeouts.transition);
		await page.click('body');

		// Triggered video visible
		await expect(page.locator('video[src*="videos/video-test_54188510.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_54188510.mp4"]'), 10, 10, 640, 720);

		// Triggered video hides, img3 visible
		await expect(page.locator('video[src*="videos/video-test_54188510.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]'), 10, 10, 640, 720);

		// img3 hides, img1 visible (back to main playlist)
		await expect(frame.locator('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_beb3_e6b35b8b.jpg-video-img1"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_2_beb3_e6b35b8b.jpg-video-img1"]'), 10, 10, 1280, 720);

		await page.waitForTimeout(Timeouts.transition);

		// Second mouse click trigger
		await page.click('body');

		// Triggered video visible again
		await expect(page.locator('video[src*="videos/video-test_54188510.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_54188510.mp4"]'), 10, 10, 640, 720);

		// Click during triggered content
		await page.click('body');

		// Triggered video hides, img3 visible
		await expect(page.locator('video[src*="videos/video-test_54188510.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]'), 10, 10, 640, 720);

		// Click during img3
		await page.click('body');

		// Triggered video visible, img3 hides
		await expect(page.locator('video[src*="videos/video-test_54188510.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_54188510.mp4"]'), 10, 10, 640, 720);

		// Click again
		await page.click('body');

		// Triggered video hides, img3 visible
		await expect(page.locator('video[src*="videos/video-test_54188510.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]'), 10, 10, 640, 720);

		// Main video loops back, img3 hides
		await expect(page.locator('video[src*="videos/video-test_17354648.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_17354648.mp4"]'), 10, 10, 1280, 720);

		// Main video hides, img1 visible
		await expect(page.locator('video[src*="videos/video-test_17354648.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_beb3_e6b35b8b.jpg-video-img1"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_2_beb3_e6b35b8b.jpg-video-img1"]'), 10, 10, 1280, 720);
	});
});
