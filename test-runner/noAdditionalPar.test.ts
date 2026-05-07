import { test, expect } from '@playwright/test';
import { DUID, Timeouts, SMILUrls } from './config';
import { testCoordinates } from './helpers';

test.describe('noAdditionalPar.smil test', () => {
	test('processes smil file correctly', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.noAdditionalPar);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		await expect(page.locator('video[src*="videos/loader_fe864e57.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(page.locator('video[src*="videos/loader_fe864e57.mp4"]'), 0, 0, 1920, 1080);

		await expect(page.locator('video[src*="videos/video-test_17354648.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_54188510.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[src*="images/landscape1_68241f63.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_54188510.mp4"]')).toHaveCount(2);
		// await expect(page.locator('video[src*="videos/loader_fe864e57.mp4"]')).toHaveCount(0);
	});
});
