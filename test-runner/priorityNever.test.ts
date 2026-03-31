import { test, expect } from '@playwright/test';
import { DUID, Timeouts, SMILUrls } from './config';
// Tests the lower="never" priority behavior: lower-priority content is
// prevented from beginning while the higher-priority element is active
// (SMIL 3.0 spec: "the begin of the new element is ignored").
// After P_high wallclock expires, P_low plays normally.
test.describe('priorityNever.smil test', () => {
	test('lower-priority content blocked by never rule until higher ends', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.priorityNever);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Loader may be skipped if files are cached from a previous run
		try {
			await expect(page.locator('video[src*="videos/loader_871e2ff0.mp4"]')).toBeVisible({ timeout: 10000 });
		} catch {
			// Files cached — loader was hidden or skipped
		}

		// P_high (highest priority, lower="never") plays: video-test-1 + img_1 loop
		await expect(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });

		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// Verify P_low content is NOT visible while P_high is active (core "never" assertion)
		await expect(frame.locator('img[src*="images/img_3_4ac1868a.jpg"]')).not.toBeVisible({ timeout: 3000 });
		await expect(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]')).not.toBeVisible({ timeout: 3000 });

		// P_high loops another iteration
		await expect(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// P_high wallclock ends at +40s → P_low finally plays
		await expect(
			frame.locator('img[src*="images/img_3_4ac1868a.jpg"]:visible, img[src*="images/img_2_18b5d21f.jpg"]:visible')
		).toBeVisible({ timeout: Timeouts.priorityTransition });
	});
});
