import { test, expect } from '@playwright/test';
import { DUID, Timeouts, SMILUrls } from './config';
import { testCoordinates } from './helpers';

test.describe('repeatCountIntroImage.smil test', () => {
	test('processes smil file correctly', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.repeatCountIntroImage);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		await expect(frame.locator('img[id*="landscape2_20622151.jpg-rootLayout-img0"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(frame.locator('img[id*="landscape2_20622151.jpg-rootLayout-img0"]'), 0, 0, 1920, 1080);

		await expect(page.locator('video[src*="videos/video-test_17354648.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_17354648.mp4"]'), 0, 0, 1920, 1080);

		await expect(page.locator('video[src*="videos/video-test_17354648.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="landscape1_7a8cff48.jpg-main-img2"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="landscape1_7a8cff48.jpg-main-img2"]'), 0, 0, 1920, 1080);

		await expect(frame.locator('img[id*="landscape1_7a8cff48.jpg-main-img2"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="landscape2_20622151.jpg-main-img3"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="landscape2_20622151.jpg-main-img3"]'), 0, 0, 1920, 1080);

		await expect(frame.locator('img[id*="landscape1_7a8cff48.jpg-main-img2"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="landscape2_20622151.jpg-main-img3"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="landscape1_7a8cff48.jpg-main-img2"]'), 0, 0, 1920, 1080);

		await expect(frame.locator('img[id*="landscape1_7a8cff48.jpg-main-img2"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="landscape2_20622151.jpg-main-img3"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="landscape2_20622151.jpg-main-img3"]'), 0, 0, 1920, 1080);

		await expect(page.locator('video[src*="videos/video-test_54188510.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="landscape2_20622151.jpg-main-img3"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_54188510.mp4"]'), 0, 0, 1920, 1080);
		await page.waitForTimeout(Timeouts.videoTransition);

		await expect(page.locator('video[src*="videos/video-test_54188510.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="landscape2_20622151.jpg-main-img3"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_54188510.mp4"]'), 0, 0, 1920, 1080);

		await expect(page.locator('video[src*="videos/video-test_17354648.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_54188510.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_17354648.mp4"]'), 0, 0, 1920, 1080);
	});
});
