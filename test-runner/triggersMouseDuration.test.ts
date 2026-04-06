import { test, expect } from './fixtures';
import { DUID, Timeouts } from './config';
import { testCoordinates } from './helpers';

test.describe('triggersMouseDuration.smil test', () => {
    test('mouse click trigger plays for set duration then auto-stops', async ({ page, context, smilUrls }) => {
        await context.addInitScript((url: string) => {
            (window as any).__SMIL_URL__ = url;
        }, smilUrls.triggersMouseDuration);
        await page.goto(`/?duid=${DUID}`);
        const frame = page.frameLocator('iframe');

        // Default content: video-test-1 in full region
        await expect(page.locator('video[src*="video-test_465b7757"]')).toBeVisible({ timeout: Timeouts.firstElement });
        await testCoordinates(page.locator('video[src*="video-test_465b7757"]'), 10, 10, 1280, 720);

        // Click to activate trigger (dur="5")
        await page.waitForTimeout(Timeouts.transition);
        await page.click('body');

        // Triggered content: video-test-2 in sub-region
        await expect(page.locator('video[src*="video-test_0b02adc4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
        await testCoordinates(page.locator('video[src*="video-test_0b02adc4"]'), 10, 10, 640, 720);

        // After 5s duration expires, default content resumes in full region
        await expect(page.locator('video[src*="video-test_465b7757"]')).toBeVisible({ timeout: Timeouts.elementAwait });
        await testCoordinates(page.locator('video[src*="video-test_465b7757"]'), 10, 10, 1280, 720);
    });
});
