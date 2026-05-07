import { test, expect } from '@playwright/test';
import { DUID, Timeouts, SMILUrls } from './config';
import { testCoordinates } from './helpers';

test.describe('wallclockFuture.smil test', () => {
	test('processes smil file correctly', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.wallclockFuture);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		await expect(page.locator('video[src*="videos/loader_fe864e57.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(page.locator('video[src*="videos/loader_fe864e57.mp4"]'), 0, 0, 1920, 1080);

		await page.waitForTimeout(Timeouts.videoTransition);

		await expect(page.locator('video[src*="videos/loader_fe864e57.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		await page.waitForTimeout(Timeouts.videoTransition);
		await page.waitForTimeout(Timeouts.videoTransition);

		await expect(page.locator('video[src*="videos/video-test_17354648.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/loader_fe864e57.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_17354648.mp4"]'), 0, 0, 1280, 720);

		await expect(page.locator('video[src*="videos/video-test_17354648.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[src*="images/img_1_64a752b2.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[src*="images/img_1_64a752b2.jpg"]'), 0, 0, 1280, 720);
	});
});
