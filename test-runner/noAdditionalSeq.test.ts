import { test, expect } from '@playwright/test';
import { DUID, Timeouts, SMILUrls } from './config';

test.describe('noAdditionalSeq.smil test', () => {
	test('processes smil file correctly', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.noAdditionalSeq);

		await page.goto(`/?duid=${DUID}`);

		await expect(page.locator('video[src*="videos/video-test_54188510.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await expect(page.locator('video[src*="videos/video-test_54188510.mp4"]')).toHaveCount(4);
	});
});
