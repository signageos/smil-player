import { test, expect } from './fixtures';
import { DUID, Timeouts, SMILUrls } from './config';
import { waitForLoaderOrSkip } from './helpers';

// P_high has two wallclock windows (0-20s and 35-50s) with a gap between them.
// P_low (always active) defers behind P_high. When window 1 ends, P_low plays
// in the gap. When window 2 starts, P_high stops P_low and takes over again.
// When window 2 ends, P_low resumes. Tests the full stop-resume-stop-resume cycle.
//
// P_high content: video-test-1 (465b7757) + img_1
// P_low content: img_2 (18b5d21f) + video-test-2 (0b02adc4)
test.describe('priorityOscillation.smil test', () => {
	test('low-priority content recovers correctly through multiple high-priority windows', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.priorityOscillation);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		await waitForLoaderOrSkip(page);

		// Window 1: P_high plays (video-test-1)
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });

		// Window 1 ends → P_low takes over: img_2 (P_low-exclusive content)
		await expect(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]')).toBeVisible({ timeout: Timeouts.priorityTransition });

		// Window 2 → P_high returns: video-test-1 reappears
		// Use img_1 as the indicator since it's P_high's content that appears in the iframe
		// (unlike video-test-1 which is on the main page and may have src=null after window 1)
		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).toBeVisible({ timeout: Timeouts.priorityTransition });

		// Window 2 ends → P_low again: img_2 reappears
		await expect(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]')).toBeVisible({ timeout: Timeouts.priorityTransition });
	});
});
