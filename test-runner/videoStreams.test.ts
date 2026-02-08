import { test, expect } from '@playwright/test';
import { DUID, Timeouts, SMILUrls } from './config';
import { testCoordinates } from './helpers';

test.describe('videoStreams.smil test', () => {
	test('processes smil file correctly', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.videoStreams);
		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Loader video visible
		await expect(page.locator('video[src*="videos/loader_fe864e57.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(page.locator('video[src*="videos/loader_fe864e57.mp4"]'), 0, 0, 1920, 1080);

		// Loader hides, landscape image visible in top-right
		await expect(page.locator('video[src*="videos/loader_fe864e57.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="landscape1_7a8cff48.jpg-top-right-img1"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="landscape1_7a8cff48.jpg-top-right-img1"]'), 0, 960, 960, 540);

		// Landscape image hides, local video visible in top-right
		await expect(frame.locator('img[id*="landscape1_7a8cff48.jpg-top-right-img1"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_54188510.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_54188510.mp4"]'), 0, 960, 960, 540);

		// Local video hides, stream video visible in top-right
		await expect(page.locator('video[src*="videos/video-test_54188510.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="https://www.rmp-streaming.com/media/bbb-360p.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="https://www.rmp-streaming.com/media/bbb-360p.mp4"]'), 0, 960, 960, 540);

		// Stream video hides, landscape image loops back
		await expect(page.locator('video[src*="https://www.rmp-streaming.com/media/bbb-360p.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="landscape1_7a8cff48.jpg-top-right-img1"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="landscape1_7a8cff48.jpg-top-right-img1"]'), 0, 960, 960, 540);
	});
});
