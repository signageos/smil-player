import { test, expect } from './fixtures';
import { DUID, Timeouts } from './config';
import { testCoordinates } from './helpers';

test.describe('brokenXml.smil test', () => {
	test('processes smil file correctly', async ({ page, context, smilUrls }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.brokenXml);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		await expect(frame.locator('img[id*=".jpg-rootLayout-img"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(frame.locator('img[id*=".jpg-rootLayout-img"]'), 0, 0, 1920, 1080);

		await page.waitForTimeout(Timeouts.videoTransition);

		await expect(frame.locator('img[id*=".jpg-rootLayout-img"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*=".jpg-rootLayout-img"]'), 0, 0, 1920, 1080);
	});
});
