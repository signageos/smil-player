import { test, expect } from '@playwright/test';
import { DUID, Timeouts, SMILUrls } from './config';
import { testCoordinates } from './helpers';

test.describe('conditionalTimePriority.smil test', () => {
	test('processes smil file correctly', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.conditionalTimePriority);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		await expect(page.locator('video[src*="videos/video-test_17354648.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(page.locator('video[src*="videos/video-test_17354648.mp4"]'), 0, 0, 1920, 1080);

		await expect(frame.locator('img[id*="img_1_64a7_1f16f683.jpg-video-img2"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_17354648.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_1_64a7_1f16f683.jpg-video-img2"]'), 0, 0, 1920, 1080);

		await expect(page.locator('video[src*="videos/video-test_17354648.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_1_64a7_1f16f683.jpg-video-img2"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_17354648.mp4"]'), 0, 0, 1920, 1080);

		await expect(frame.locator('img[id*="img_1_64a7_1f16f683.jpg-video-img2"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_17354648.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_1_64a7_1f16f683.jpg-video-img2"]'), 0, 0, 1920, 1080);

		await expect(frame.locator('img[id*="img_2_beb3_926b4da4.jpg-video-img3"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_1_64a7_1f16f683.jpg-video-img2"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_2_beb3_926b4da4.jpg-video-img3"]'), 0, 0, 1920, 1080);

		await expect(frame.locator('img[id*="img_1_64a7_1f16f683.jpg-video-img4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_beb3_926b4da4.jpg-video-img3"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_1_64a7_1f16f683.jpg-video-img4"]'), 0, 0, 1920, 1080);

		await expect(page.locator('video[src*="videos/video-test_17354648.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_1_64a7_1f16f683.jpg-video-img4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_17354648.mp4"]'), 0, 0, 1920, 1080);
	});
});
