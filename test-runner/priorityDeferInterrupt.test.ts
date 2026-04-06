import { test, expect } from './fixtures';
import { DUID, Timeouts } from './config';
import { waitForLoaderOrSkip } from './helpers';

// P2 (middle priority, already active) plays first. P1 (highest) arrives at +30s and stops P2.
// P3 (lowest, always active) defers behind P2, then re-defers behind P1.
// P2's wallclock expires at +40s (during P1's window). When P1 ends at +60s,
// P2's endTime has passed so it doesn't resume, and P3 plays immediately.
test.describe('priorityDeferInterrupt.smil test', () => {
	test('deferred element survives blocker replacement by higher priority', async ({ page, context, smilUrls }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.priorityDeferInterrupt);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		await waitForLoaderOrSkip(page);

		// P2 plays first: img_3 (P2 already active, highest currently-active priority)
		await expect(frame.locator('img[src*="images/img_3_4ac1868a.jpg"]')).toBeVisible({ timeout: Timeouts.firstElement });
		// P1 arrives at +30s, stops P2
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.priorityTransition });
		// P1 ends at +60s, P2 expired at +40s → P3 plays
		await expect(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]')).toBeVisible({ timeout: Timeouts.priorityTransition });
	});
});
