import { test, expect } from './fixtures';
import { DUID, Timeouts, SMILUrls } from './config';
import { testCoordinates, dispatchWidgetTrigger } from './helpers';

test.describe('triggersWidget.smil test', () => {
	test('processes widget triggers correctly', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.triggersWidget);
		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Initial video visible (default content in full region)
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(page.locator('video[src*="videos/video-test_465b7757.mp4"]'), 10, 10, 1280, 720);

		// === Trigger1 activation via widget event ===
		await page.waitForTimeout(Timeouts.transition);
		await dispatchWidgetTrigger(page, 'trigger1');

		// Triggered video visible (trigger1 uses video-test-2 in sub-region)
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]'), 10, 10, 640, 720);

		// === Idempotency: re-dispatch trigger1 while playing — should be ignored ===
		await dispatchWidgetTrigger(page, 'trigger1');

		// Video should still be playing without disruption
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// Triggered video hides, trigger1 img4 visible
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_4_d0d4"][id*="-video-img4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_4_d0d4"][id*="-video-img4"]'), 10, 10, 640, 720);

		// trigger1 repeatCount=2: second iteration — video visible again
		await expect(frame.locator('img[id*="img_4_d0d4"][id*="-video-img4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]'), 10, 10, 640, 720);

		// Second iteration img4
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_4_d0d4"][id*="-video-img4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_4_d0d4"][id*="-video-img4"]'), 10, 10, 640, 720);

		// === Trigger completion: default content resumes in full region ===
		await expect(frame.locator('img[id*="img_4_d0d4"][id*="-video-img4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_465b7757.mp4"]'), 10, 10, 1280, 720);

		// === Trigger2 activation ===
		await page.waitForTimeout(Timeouts.transition);
		await dispatchWidgetTrigger(page, 'trigger2');

		// Trigger2 uses video-test-1 (same file as default) in sub-region — verify via its img (img6)
		// Wait for trigger2's img to appear (img_4.jpg with suffix img6)
		await expect(frame.locator('img[id*="img_4_d0d4"][id*="-video-img6"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_4_d0d4"][id*="-video-img6"]'), 10, 10, 640, 720);

		// === Trigger switching: dispatch trigger1 while trigger2 is playing ===
		await dispatchWidgetTrigger(page, 'trigger1');

		// Trigger1 video takes over (may be assigned to either sub-region depending on which is free)
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		const box = await page.locator('video[src*="videos/video-test_0b02adc4.mp4"]').boundingBox();
		expect(box).not.toBeNull();
		expect(box!.width).toBe(640);
		expect(box!.height).toBe(720);
	});
});
