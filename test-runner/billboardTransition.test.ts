import { test, expect } from './fixtures';
import { DUID, Timeouts, SMILUrls } from './config';
import { testCoordinates } from './helpers';

test.describe('simpleBillboard.smil test', () => {
	test('billboard transition displays images in sequence', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.billboardTransition);
		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Loader visible during prefetch (may be skipped if assets cached, or slow on first webpack compile)
		try {
			await expect(page.locator('video[src*="loader_871e2ff0"]')).toBeVisible({ timeout: 10000 });
		} catch {
			// Files cached or webpack still compiling
		}

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
