import { test, expect } from './fixtures';
import { DUID, Timeouts } from './config';
import { testCoordinates, waitForLoaderOrSkip } from './helpers';

test.describe('noAdditionalPar.smil test', () => {
	test('processes smil file correctly', async ({ page, context, smilUrls }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.noAdditionalPar);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		await waitForLoaderOrSkip(page);

		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]').first()).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[src*="images/landscape1_fe944bd5.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).toHaveCount(2);
		// await expect(page.locator('video[src*="videos/loader_871e2ff0.mp4"]')).toHaveCount(0);
	});
});
