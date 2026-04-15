import { test, expect } from '../fixtures';
import { DUID, Timeouts } from '../config';
import { testCoordinates, waitForLoaderOrSkip } from '../helpers';

test.describe('videoStreams.smil test', () => {
	// FIXME: External streaming URL https://www.rmp-streaming.com/media/bbb-360p.mp4 has SSL
	// certificate issues (curl exit code 60). The stream never loads, so the video sequence
	// stalls at the local video and never transitions to stream playback.
	test.fixme('processes smil file correctly', async ({ page, context, smilUrls }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.videoStreams);
		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Loader video visible (optional — may be cached)
		await waitForLoaderOrSkip(page);

		// Loader hides, landscape image visible in top-right
		await expect(frame.locator('img[id*="landscape1"][id*=".jpg-top-right-img1"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(frame.locator('img[id*="landscape1"][id*=".jpg-top-right-img1"]'), 0, 960, 960, 540);

		// Landscape image hides, local video visible in top-right
		await expect(frame.locator('img[id*="landscape1"][id*=".jpg-top-right-img1"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]'), 0, 960, 960, 540);

		// Local video hides, stream video visible in top-right
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="https://www.rmp-streaming.com/media/bbb-360p.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="https://www.rmp-streaming.com/media/bbb-360p.mp4"]'), 0, 960, 960, 540);

		// Stream video hides, landscape image loops back
		await expect(page.locator('video[src*="https://www.rmp-streaming.com/media/bbb-360p.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="landscape1"][id*=".jpg-top-right-img1"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="landscape1"][id*=".jpg-top-right-img1"]'), 0, 960, 960, 540);
	});
});
