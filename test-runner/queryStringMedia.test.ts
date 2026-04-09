import { test, expect } from './fixtures';
import { DUID, Timeouts } from './config';
import { testCoordinates, waitForLoaderOrSkip } from './helpers';

test.describe('queryStringMedia.smil test', () => {
    test('media URLs with query params resolve via location header strategy (204 + Location)', async ({ page, context, smilUrls }) => {
        await context.addInitScript((url: string) => {
            (window as any).__SMIL_URL__ = url;
        }, smilUrls.queryStringMedia);
        await page.goto(`/?duid=${DUID}`);
        const frame = page.frameLocator('iframe');

        // Loader during prefetch (may be skipped if assets are cached)
        await waitForLoaderOrSkip(page);

        // First image (resolved via Location header from /redirect/landscape1.jpg?v=1) loads and displays
        await expect(frame.locator('img[id*="landscape1"]')).toBeVisible({ timeout: Timeouts.elementAwait });
        await testCoordinates(frame.locator('img[id*="landscape1"]'), 0, 0, 1920, 1080);

        // Second image (resolved via Location header from /redirect/landscape2.jpg?v=2) loads and displays
        await expect(frame.locator('img[id*="landscape1"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
        await expect(frame.locator('img[id*="landscape2"]')).toBeVisible({ timeout: Timeouts.elementAwait });
        await testCoordinates(frame.locator('img[id*="landscape2"]'), 0, 0, 1920, 1080);

        // Loops back to first image (confirms full cycle works with location header strategy)
        await expect(frame.locator('img[id*="landscape2"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
        await expect(frame.locator('img[id*="landscape1"]')).toBeVisible({ timeout: Timeouts.elementAwait });
    });
});
