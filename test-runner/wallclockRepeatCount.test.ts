import { test, expect } from '@playwright/test';
import { DUID, Timeouts, SMILUrls } from './config';
import { testCoordinates } from './helpers';

test.describe('wallclockRepeatCount.smil test', () => {
	test('processes smil file correctly', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.wallclockRepeatCount);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		await expect(page.locator('video[src*="videos/loader_871e2ff0.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(page.locator('video[src*="videos/loader_871e2ff0.mp4"]'), 0, 0, 1920, 1080);

		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[src*="images/landscape1_fe944bd5.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		// await expect(page.locator('video[src*="videos/loader_871e2ff0.mp4"]')).toHaveCount(0);

		await testCoordinates(page.locator('video[src*="videos/video-test_465b7757.mp4"]'), 0, 0, 960, 540);
		await testCoordinates(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]'), 540, 960, 960, 540);
		await testCoordinates(frame.locator('img[src*="images/landscape1_fe944bd5.jpg"]'), 0, 960, 960, 540);

		await page.waitForTimeout(Timeouts.transition);

		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[src*="images/landscape1_fe944bd5.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		await testCoordinates(page.locator('video[src*="videos/video-test_465b7757.mp4"]'), 0, 0, 960, 540);
		await testCoordinates(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]'), 540, 960, 960, 540);
		await testCoordinates(frame.locator('img[src*="images/landscape1_fe944bd5.jpg"]'), 0, 960, 960, 540);
	});
});
