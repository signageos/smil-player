import { test, expect } from '@playwright/test';
import { DUID, Timeouts, SMILUrls } from './config';

test.describe('conditionalTimePriority.smil test', () => {
	test('processes smil file correctly', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.conditionalTimePriority);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });

		await expect(frame.locator('img[id*="img_1_aba1"][id*=".jpg-video-img2"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });

		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_1_aba1"][id*=".jpg-video-img2"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });

		await expect(frame.locator('img[id*="img_1_aba1"][id*=".jpg-video-img2"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });

		// Time window expires → low-priority content takes over (use priorityTransition for wallclock transition)
		await expect(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img3"]')).toBeVisible({ timeout: Timeouts.priorityTransition });
		await expect(frame.locator('img[id*="img_1_aba1"][id*=".jpg-video-img2"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });

		await expect(frame.locator('img[id*="img_1_aba1"][id*=".jpg-video-img4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_2_18b5"][id*=".jpg-video-img3"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });

		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_1_aba1"][id*=".jpg-video-img4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
	});
});
