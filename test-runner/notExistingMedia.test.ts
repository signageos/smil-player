import { test, expect } from '@playwright/test';
import { DUID, Timeouts, SMILUrls } from './config';
import { testCoordinates } from './helpers';

test.describe('NonExistingMedia.smil test', () => {
	test('processes smil file correctly', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.notExistingMedia);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		await expect(frame.locator('img[id*="landscape2"][id*=".jpg-rootLayout-img0"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(frame.locator('img[id*="landscape2"][id*=".jpg-rootLayout-img0"]'), 0, 0, 1920, 1080);

		await expect(frame.locator('img[id*="img_1_aba1"][id*=".jpg-main-img2"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_1_aba1"][id*=".jpg-main-img2"]'), 0, 0, 1920, 1080);

		await expect(frame.locator('img[id*="img_1_aba1"][id*=".jpg-main-img2"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]'), 0, 0, 1920, 1080);

		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_1_aba1"][id*=".jpg-main-img2"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_1_aba1"][id*=".jpg-main-img2"]'), 0, 0, 1920, 1080);
	});
});
