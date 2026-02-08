import { test, expect } from '@playwright/test';
import { DUID, Timeouts, SMILUrls } from './config';
import { testCoordinates } from './helpers';

test.describe('wallclockFixedSeqWebsite.smil test', () => {
	test('processes smil file correctly', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.wallclockFixedSeqWebsite);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		await expect(page.locator('video[src*="videos/loader_fe864e57.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(page.locator('video[src*="videos/loader_fe864e57.mp4"]'), 0, 0, 1920, 1080);

		await expect(frame.locator('iframe[src*="https://www.signageos.io"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_17354648.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		// await expect(page.locator('video[src*="videos/loader_fe864e57.mp4"]')).toHaveCount(0);

		await testCoordinates(page.locator('video[src*="videos/video-test_17354648.mp4"]'), 0, 0, 960, 540);
		await expect(page.locator('video[src*="videos/video-test_54188510.mp4"]')).toHaveCount(0);

		await expect(page.locator('video[src*="videos/video-test_17354648.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[src*="images/landscape1_68241f63.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[src*="images/landscape1_68241f63.jpg"]'), 0, 0, 960, 540);
		await expect(frame.locator('img[src*="images/landscape2_9a769e36.jpg"]')).toHaveCount(0);

		await expect(page.locator('video[src*="videos/video-test_17354648.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[src*="images/landscape1_68241f63.jpg"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_17354648.mp4"]'), 0, 0, 960, 540);
		await expect(page.locator('video[src*="videos/video-test_54188510.mp4"]')).toHaveCount(0);
		await expect(frame.locator('iframe[src*="https://www.signageos.io"]')).toBeVisible({ timeout: Timeouts.elementAwait });
	});
});
