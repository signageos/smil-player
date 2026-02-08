import { test, expect } from '@playwright/test';
import { DUID, Timeouts, SMILUrls } from './config';
import { testCoordinates } from './helpers';

test.describe('widgetExtensions.smil test', () => {
	test('processes smil file correctly', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.widgetExtensions);
		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// All four widget iframes visible
		await expect(frame.locator('iframe[id*="index_f86c9931.html-top-right-ref1"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await expect(frame.locator('iframe[id*="index_5922c6df.html-top-left-ref2"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('iframe[id*="index_01d0e4ae.html-bottom-right-ref3"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('iframe[id*="index_c60fe849.html-bottom-left-ref4"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// Check coordinates for all four quadrants
		await testCoordinates(frame.locator('iframe[id*="index_f86c9931.html-top-right-ref1"]'), 0, 960, 960, 540);
		await testCoordinates(frame.locator('iframe[id*="index_5922c6df.html-top-left-ref2"]'), 0, 0, 960, 540);
		await testCoordinates(frame.locator('iframe[id*="index_01d0e4ae.html-bottom-right-ref3"]'), 540, 960, 960, 540);
		await testCoordinates(frame.locator('iframe[id*="index_c60fe849.html-bottom-left-ref4"]'), 540, 0, 960, 540);
	});
});
