import { test, expect } from './fixtures';
import { DUID, Timeouts, SMILUrls } from './config';
import { testCoordinates } from './helpers';

test.describe('queryStringMedia.smil test', () => {
    test('media URLs with query params and 302 redirect load and play correctly', async ({ page, context }) => {
        await context.addInitScript((url: string) => {
            (window as any).__SMIL_URL__ = url;
        }, SMILUrls.queryStringMedia);
        await page.goto(`/?duid=${DUID}`);
        const frame = page.frameLocator('iframe');

        // Loader during prefetch
        await expect(page.locator('video[src*="loader_871e2ff0"]')).toBeVisible({ timeout: Timeouts.firstElement });

        // First image (redirected from /redirect/landscape1.jpg?v=1) loads and displays
        await expect(frame.locator('img[id*="landscape1"]')).toBeVisible({ timeout: Timeouts.elementAwait });
        await testCoordinates(frame.locator('img[id*="landscape1"]'), 0, 0, 1920, 1080);

        // Second image (redirected from /redirect/landscape2.jpg?v=2) loads and displays
        await expect(frame.locator('img[id*="landscape1"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
        await expect(frame.locator('img[id*="landscape2"]')).toBeVisible({ timeout: Timeouts.elementAwait });
        await testCoordinates(frame.locator('img[id*="landscape2"]'), 0, 0, 1920, 1080);

        // Loops back to first image (confirms full cycle works with redirected query-param URLs)
        await expect(frame.locator('img[id*="landscape2"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
        await expect(frame.locator('img[id*="landscape1"]')).toBeVisible({ timeout: Timeouts.elementAwait });
    });
});
