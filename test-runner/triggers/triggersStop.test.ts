import { test, expect } from '../fixtures';
import { DUID, Timeouts } from '../config';
import { testCoordinates } from '../helpers';

test.describe('triggersStop.smil test', () => {
	test('duration trigger expires and returns to default content', async ({ page, context, smilUrls }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.triggersStop);
		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Initial video visible
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(page.locator('video[src*="videos/video-test_465b7757.mp4"]'), 10, 10, 1280, 720);

		// Click to activate trigger2 (dur="7", end="trigger2")
		await page.waitForTimeout(Timeouts.transition);
		await page.click('body');

		// Triggered video visible
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]'), 10, 10, 640, 720);

		// Wait for 7s duration to expire — default content should resume
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_465b7757.mp4"]'), 10, 10, 1280, 720);
	});

	test('self-cancel toggle stops trigger early on re-click', async ({ page, context, smilUrls }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.triggersStop);
		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Initial video visible
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });

		// Click to activate trigger2
		await page.waitForTimeout(Timeouts.transition);
		await page.click('body');

		// Triggered video visible
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// Click again to self-cancel (end="trigger2")
		await page.waitForTimeout(Timeouts.transition);
		await page.click('body');

		// Default content resumes (trigger stopped early)
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_465b7757.mp4"]'), 10, 10, 1280, 720);
	});

	test('keyboard trigger with repeatCount=1 plays once and returns', async ({ page, context, smilUrls }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.triggersStop);
		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Initial video visible
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });

		// Type 7-8-9 to activate trigger1 (repeatCount="1")
		await page.waitForTimeout(Timeouts.transition);
		await page.keyboard.press('7');
		await page.keyboard.press('8');
		await page.keyboard.press('9');

		// Trigger1 uses video-test-1 (same as default) but plays in sub-region, then shows img4
		// Verify trigger1 by its unique img (img_4.jpg)
		await expect(frame.locator('img[id*="img_4_d0d4"][id*=".jpg-video-img"]')).toBeVisible({ timeout: Timeouts.longerElementAwait });
		await testCoordinates(frame.locator('img[id*="img_4_d0d4"][id*=".jpg-video-img"]'), 10, 10, 640, 720);

		// After single play, default content resumes in full region
		await expect(frame.locator('img[id*="img_4_d0d4"][id*=".jpg-video-img"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_465b7757.mp4"]'), 10, 10, 1280, 720);
	});
});
