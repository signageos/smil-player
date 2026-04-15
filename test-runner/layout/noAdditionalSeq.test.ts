import { test, expect } from '../fixtures';
import { DUID, Timeouts } from '../config';

test.describe('noAdditionalSeq.smil test', () => {
	test('processes smil file correctly', async ({ page, context, smilUrls }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.noAdditionalSeq);

		await page.goto(`/?duid=${DUID}`);

		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).toHaveCount(4);
	});
});
