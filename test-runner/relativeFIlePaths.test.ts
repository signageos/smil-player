import { test, expect } from '@playwright/test';
import { DUID, Timeouts, SMILUrls } from './config';
import { testCoordinates } from './helpers';

test.describe('relativeFilePaths.smil test', () => {
	test('processes smil file correctly', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.relativeFilePaths);

		await page.goto(`/?duid=${DUID}`);

		await expect(page.locator('video[src*="videos/loader_a667ec98.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(page.locator('video[src*="videos/loader_a667ec98.mp4"]'), 0, 0, 1920, 1080);

		await expect(page.locator('video[src*="videos/landscape1_86c12946.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/landscape1_86c12946.mp4"]'), 270, 480, 960, 540);
		// await expect(page.locator('video[src*="videos/loader_a667ec98.mp4"]')).toHaveCount(0);
		await page.waitForTimeout(Timeouts.videoTransition);
		await page.waitForTimeout(Timeouts.videoTransition);
		await page.waitForTimeout(Timeouts.videoTransition);

		await expect(page.locator('video[src*="videos/landscape1_86c12946.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/landscape1_86c12946.mp4"]'), 270, 480, 960, 540);
	});
});
