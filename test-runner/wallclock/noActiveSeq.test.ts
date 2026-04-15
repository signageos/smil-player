import { test, expect } from '../fixtures';
import { DUID, Timeouts } from '../config';
import { testCoordinates } from '../helpers';

test.describe('wallclockNoActiveSeq.smil test', () => {
	test('processes smil file correctly', async ({ page, context, smilUrls }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.noActiveSeq);

		await page.goto(`/?duid=${DUID}`);

		await expect(page.locator('video[src*="videos/loader_871e2ff0.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(page.locator('video[src*="videos/loader_871e2ff0.mp4"]'), 0, 0, 1920, 1080);

		await page.waitForTimeout(Timeouts.videoTransition);

		await expect(page.locator('video[src*="videos/loader_871e2ff0.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		await page.waitForTimeout(Timeouts.videoTransition);

		await expect(page.locator('video[src*="videos/loader_871e2ff0.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/loader_871e2ff0.mp4"]'), 0, 0, 1920, 1080);
	});
});
