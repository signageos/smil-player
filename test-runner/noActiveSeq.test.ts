import { test, expect } from '@playwright/test';
import { DUID, Timeouts, SMILUrls } from './config';
import { testCoordinates } from './helpers';

test.describe('wallclockNoActiveSeq.smil test', () => {
	test('processes smil file correctly', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.noActiveSeq);

		await page.goto(`/?duid=${DUID}`);

		await expect(page.locator('video[src*="videos/loader_fe864e57.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(page.locator('video[src*="videos/loader_fe864e57.mp4"]'), 0, 0, 1920, 1080);

		await page.waitForTimeout(Timeouts.videoTransition);

		await expect(page.locator('video[src*="videos/loader_fe864e57.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		await page.waitForTimeout(Timeouts.videoTransition);

		await expect(page.locator('video[src*="videos/loader_fe864e57.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/loader_fe864e57.mp4"]'), 0, 0, 1920, 1080);
	});
});
