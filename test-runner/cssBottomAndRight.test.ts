import { test, expect } from '@playwright/test';
import { DUID, Timeouts, SMILUrls } from './config';
import { testCoordinates } from './helpers';

test.describe('cssBottomAndRight.smil test', () => {
	test('processes smil file correctly', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.cssBottom);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		await expect(frame.locator('img[id*="img_1_aba1"][id*=".jpg-video2-img1"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(frame.locator('img[id*="img_1_aba1"][id*=".jpg-video2-img1"]'), 252, 825, 540, 608);

		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]'), 364, 1188, 540, 608);
	});
});
