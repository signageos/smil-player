import { test, expect } from '@playwright/test';
import { DUID, Timeouts, SMILUrls } from './config';

// P2 (middle priority) plays first. P1 (highest) arrives at +15s and stops P2.
// P3 (lowest, always active) defers behind P2, then re-defers behind P1.
// P2's wallclock expires at +25s (during P1's window). When P1 ends at +40s,
// P2's endTime has passed so it doesn't resume, and P3 plays immediately.
test.describe('priorityDeferInterrupt.smil test', () => {
	test('deferred element survives blocker replacement by higher priority', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.priorityDeferInterrupt);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		try {
			await expect(page.locator('video[src*="videos/loader_871e2ff0.mp4"]')).toBeVisible({ timeout: 10000 });
		} catch {
			// Files cached
		}

		// P2 plays first: img_3
		await expect(frame.locator('img[src*="images/img_3_4ac1868a.jpg"]')).toBeVisible({ timeout: Timeouts.firstElement });
		// P1 arrives at +15s, stops P2
		await expect(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.priorityTransition });
		// P1 ends at +40s, P2 expired at +25s → P3 plays
		await expect(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]')).toBeVisible({ timeout: Timeouts.priorityTransition });
	});
});
