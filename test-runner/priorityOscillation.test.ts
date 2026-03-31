import { test, expect } from '@playwright/test';
import { DUID, Timeouts, SMILUrls } from './config';

// P_high has two wallclock windows (0-15s and 25-40s) with a gap between them.
// P_low (always active) defers behind P_high. When window 1 ends, P_low plays
// in the gap. When window 2 starts, P_high stops P_low and takes over again.
// When window 2 ends, P_low resumes. Tests the full stop-resume-stop-resume cycle.
test.describe('priorityOscillation.smil test', () => {
	test('low-priority content recovers correctly through multiple high-priority windows', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.priorityOscillation);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		try {
			await expect(page.locator('video[src*="videos/loader_871e2ff0.mp4"]')).toBeVisible({ timeout: 10000 });
		} catch {
			// Files cached
		}

		// Window 1: P_high plays
		await expect(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });
		// Window 1 ends → P_low takes over
		await expect(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]')).toBeVisible({ timeout: Timeouts.priorityTransition });
		// Window 2 → P_high returns
		await expect(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.priorityTransition });
		// Window 2 ends → P_low again
		await expect(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]')).toBeVisible({ timeout: Timeouts.priorityTransition });
	});
});
