import { test, expect } from '@playwright/test';
import { DUID, Timeouts, SMILUrls } from './config';
import { testCoordinates } from './helpers';

test.describe('nonExistingSmil.smil test', () => {
	test('processes smil file correctly', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.nonExisting);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		await expect(frame.locator('img[id*="63f74b87df.jpg-rootLayout-img"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(frame.locator('img[id*="63f74b87df.jpg-rootLayout-img"]'), 0, 0, 1920, 1080);

		await page.waitForTimeout(Timeouts.videoTransition);

		await expect(frame.locator('img[id*="63f74b87df.jpg-rootLayout-img"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="63f74b87df.jpg-rootLayout-img"]'), 0, 0, 1920, 1080);
	});
});
