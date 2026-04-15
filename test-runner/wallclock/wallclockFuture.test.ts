import { test, expect } from '../fixtures';
import { DUID, Timeouts } from '../config';
import { testCoordinates } from '../helpers';

test.describe('wallclockFuture.smil test', () => {
	test('processes smil file correctly', async ({ page, context, smilUrls }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.wallclockFuture);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		await expect(page.locator('video[src*="videos/loader_871e2ff0.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(page.locator('video[src*="videos/loader_871e2ff0.mp4"]'), 0, 0, 1920, 1080);

		// Loader loops (plays ~2-3 times) before future wallclock content appears
		// Use combined timeout instead of hard waits: 3x video duration + element await
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.videoTransition * 3 + Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/loader_871e2ff0.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_465b7757.mp4"]'), 0, 0, 1280, 720);

		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[src*="images/img_1_aba14e1e.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[src*="images/img_1_aba14e1e.jpg"]'), 0, 0, 1280, 720);
	});
});
