import { test, expect } from '../fixtures';
import { DUID, Timeouts } from '../config';
import { testCoordinates } from '../helpers';

test.describe('widgetExtensions.smil test', () => {
	test('processes smil file correctly', async ({ page, context, smilUrls }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.widgetExtensions);
		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// All four widget iframes visible
		await expect(frame.locator('iframe[id*="index"][id*=".html-top-right-ref1"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await expect(frame.locator('iframe[id*="index"][id*=".html-top-left-ref2"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('iframe[id*="index"][id*=".html-bottom-right-ref3"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('iframe[id*="index"][id*=".html-bottom-left-ref4"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// Check coordinates for all four quadrants
		await testCoordinates(frame.locator('iframe[id*="index"][id*=".html-top-right-ref1"]'), 0, 960, 960, 540);
		await testCoordinates(frame.locator('iframe[id*="index"][id*=".html-top-left-ref2"]'), 0, 0, 960, 540);
		await testCoordinates(frame.locator('iframe[id*="index"][id*=".html-bottom-right-ref3"]'), 540, 960, 960, 540);
		await testCoordinates(frame.locator('iframe[id*="index"][id*=".html-bottom-left-ref4"]'), 540, 0, 960, 540);
	});
});
