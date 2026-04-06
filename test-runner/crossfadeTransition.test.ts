import { test, expect } from './fixtures';
import { DUID, Timeouts } from './config';
import { testCoordinates } from './helpers';

test.describe('simpleCrossfade.smil test', () => {
	test('crossfade transition displays images in sequence', async ({ page, context, smilUrls }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.crossfadeTransition);
		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Loader visible during prefetch
		await expect(page.locator('video[src*="loader_871e2ff0"]')).toBeVisible({ timeout: Timeouts.firstElement });

		// First image appears with crossfade transition
		await expect(frame.locator('img[id*="landscape1"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="landscape1"]'), 0, 0, 1920, 1080);

		// First image disappears, second image appears with crossfade
		await expect(frame.locator('img[id*="landscape1"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="landscape2"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="landscape2"]'), 0, 0, 1920, 1080);

		// Second image disappears, first image reappears (loop)
		await expect(frame.locator('img[id*="landscape2"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="landscape1"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="landscape1"]'), 0, 0, 1920, 1080);
	});
});
