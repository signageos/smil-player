import { test, expect } from '@playwright/test';
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
		await expect(page.locator('video[src*="videos/video-test_17354648.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(page.locator('video[src*="videos/video-test_17354648.mp4"]'), 10, 10, 1280, 720);

		// Trigger keyboard sequence 4-5-6
		await page.waitForTimeout(Timeouts.transition);
		await page.keyboard.press('4');
		await page.keyboard.press('5');
		await page.keyboard.press('6');

		// Triggered video visible
		await expect(page.locator('video[src*="videos/video-test_54188510.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_54188510.mp4"]'), 10, 10, 640, 720);

		// Triggered video hides, image img3 visible
		await expect(page.locator('video[src*="videos/video-test_54188510.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]'), 10, 10, 640, 720);

		// img3 hides, triggered video visible again
		await expect(frame.locator('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_54188510.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_54188510.mp4"]'), 10, 10, 640, 720);

		// Triggered video hides, img3 visible again
		await expect(page.locator('video[src*="videos/video-test_54188510.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]'), 10, 10, 640, 720);

		// img3 hides, img1 visible (back to main playlist)
		await expect(frame.locator('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_beb3_e6b35b8b.jpg-video-img1"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_2_beb3_e6b35b8b.jpg-video-img1"]'), 10, 10, 1280, 720);
		await page.waitForTimeout(Timeouts.transition);

		// Trigger keyboard sequence 4-5-6 again
		await page.keyboard.press('4');
		await page.keyboard.press('5');
		await page.keyboard.press('6');

		await page.waitForTimeout(Timeouts.transition);

		// Trigger keyboard sequence 7-8-9
		await page.keyboard.press('7');
		await page.keyboard.press('8');
		await page.keyboard.press('9');

		// Two triggered regions visible simultaneously
		await expect(page.locator('video[src*="videos/video-test_54188510.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_54188510.mp4"]'), 10, 10, 640, 720);

		await expect(page.locator('video[src*="videos/video-test_17354648.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_17354648.mp4"]'), 10, 650, 640, 720);

		// First region: video hides, img3 visible
		await expect(page.locator('video[src*="videos/video-test_54188510.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]'), 10, 10, 640, 720);

		// Second region: video hides, img5 visible
		await expect(page.locator('video[src*="videos/video-test_17354648.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_4_3fe3_e33c3741.jpg-video-img5"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_4_3fe3_e33c3741.jpg-video-img5"]'), 10, 650, 640, 720);

		// First region: img3 hides, video visible again
		await expect(frame.locator('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_54188510.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_54188510.mp4"]'), 10, 10, 640, 720);

		// Second region: img5 hides
		await expect(frame.locator('img[id*="img_4_3fe3_e33c3741.jpg-video-img5"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });

		// First region: video hides, img3 visible
		await expect(page.locator('video[src*="videos/video-test_54188510.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]'), 10, 10, 640, 720);

		// img3 hides, img1 visible (back to main playlist)
		await expect(frame.locator('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_beb3_e6b35b8b.jpg-video-img1"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_2_beb3_e6b35b8b.jpg-video-img1"]'), 10, 10, 1280, 720);

		// Main video loops back
		await expect(page.locator('video[src*="videos/video-test_17354648.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_beb3_e6b35b8b.jpg-video-img1"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_17354648.mp4"]'), 10, 10, 1280, 720);
	});
});
