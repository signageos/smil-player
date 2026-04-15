import { test, expect } from '../fixtures';
import { DUID, Timeouts } from '../config';
import { testCoordinates } from '../helpers';

test.describe('playModeOne.smil test', () => {
	test('playMode="one" plays one element per cycle, advancing sequentially', async ({ page, context, smilUrls }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.playModeOne);
		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Loader during prefetch
		await expect(page.locator('video[src*="loader_871e2ff0"]')).toBeVisible({ timeout: Timeouts.firstElement });

		// Cycle 1: video-test-1 plays (first child of playMode="one")
		await expect(page.locator('video[src*="video-test_465b7757"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="video-test_465b7757"]'), 0, 0, 1920, 1080);

		// Cycle 2: landscape1 image (second child)
		await expect(page.locator('video[src*="video-test_465b7757"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="landscape1"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="landscape1"]'), 0, 0, 1920, 1080);

		// Cycle 3: landscape2 image (third child)
		await expect(frame.locator('img[id*="landscape1"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="landscape2"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="landscape2"]'), 0, 0, 1920, 1080);

		// Cycle 4: wraps back to video-test-1 (confirms sequential advance with wrap)
		await expect(frame.locator('img[id*="landscape2"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="video-test_465b7757"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="video-test_465b7757"]'), 0, 0, 1920, 1080);
	});
});
