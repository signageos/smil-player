import { test, expect } from './fixtures';
import { DUID, Timeouts, SMILUrls } from './config';
import { testCoordinates } from './helpers';

test.describe('triggersCrossCancel.smil test', () => {
	test('trigger1 starts content, trigger2 cancels it', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.triggersCrossCancel);
		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Default content: video-test-1 in full region
		await expect(page.locator('video[src*="video-test_465b7757"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(page.locator('video[src*="video-test_465b7757"]'), 10, 10, 1280, 720);

		// Press 1-2-3 to activate trigger1 (starts triggered content)
		await page.waitForTimeout(Timeouts.transition);
		await page.keyboard.press('1');
		await page.keyboard.press('2');
		await page.keyboard.press('3');

		// Triggered content: video-test-2 in sub-region
		await expect(page.locator('video[src*="video-test_0b02adc4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="video-test_0b02adc4"]'), 10, 10, 640, 720);

		// Press 4-5-6 to activate trigger2 (cancels triggered content)
		await page.waitForTimeout(Timeouts.transition);
		await page.keyboard.press('4');
		await page.keyboard.press('5');
		await page.keyboard.press('6');

		// Triggered content stops
		await expect(page.locator('video[src*="video-test_0b02adc4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });

		// Default content resumes in full region
		await expect(page.locator('video[src*="video-test_465b7757"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="video-test_465b7757"]'), 10, 10, 1280, 720);
	});

	test('trigger2 has no effect without prior trigger1 activation', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.triggersCrossCancel);
		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Default content visible
		await expect(page.locator('video[src*="video-test_465b7757"]')).toBeVisible({ timeout: Timeouts.firstElement });

		// Press 4-5-6 (cancel trigger) without prior activation — nothing should change
		await page.waitForTimeout(Timeouts.transition);
		await page.keyboard.press('4');
		await page.keyboard.press('5');
		await page.keyboard.press('6');

		// Default content still playing (allow time for any unintended state change to manifest)
		await expect(page.locator('video[src*="video-test_465b7757"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="video-test_465b7757"]'), 10, 10, 1280, 720);
	});
});
