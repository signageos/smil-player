import { test, expect } from '../fixtures';
import { DUID, Timeouts } from '../config';
import { testCoordinates, waitForLoaderOrSkip } from '../helpers';

test.describe('simpleBillboard.smil test', () => {
	test('billboard transition displays images in sequence', async ({ page, context, smilUrls }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.billboardTransition);
		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Loader visible during prefetch (may be skipped if assets cached, or slow on first webpack compile)
		await waitForLoaderOrSkip(page);

		// First image appears with billboard transition (rendered as <ol> with <li> columns)
		await expect(frame.locator('ol[id*="landscape1"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(frame.locator('ol[id*="landscape1"]'), 0, 0, 1920, 1080);

		// First image disappears, second image appears with billboard
		await expect(frame.locator('ol[id*="landscape1"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('ol[id*="landscape2"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('ol[id*="landscape2"]'), 0, 0, 1920, 1080);

		// Second image disappears, first image reappears (loop)
		await expect(frame.locator('ol[id*="landscape2"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('ol[id*="landscape1"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('ol[id*="landscape1"]'), 0, 0, 1920, 1080);
	});
});
