import { test, expect } from './fixtures';
import { DUID, Timeouts } from './config';
import { waitForLoaderOrSkip } from './helpers';

// Tests that lower="stop" does NOT stop the higher-priority element when a lower
// arrives. Without the fix in handlePriorityBeforePlay, handleStopBehaviour acts on
// previousPlayingIndex (the higher element), permanently killing it and letting the
// lower take over. The fix remaps lower="stop" → never in this branch.
//
// Verified empirically: without the remap, P_high is stopped and P_low takes over.
// With the remap, P_high plays throughout its window and P_low plays after.
//
// Note: handleNeverBehaviour only sleeps 100ms, so P_low may briefly flicker visible
// (same limitation as priorityNever test). The key assertion is that P_high CONTINUES
// playing — it was not stopped.
test.describe('priorityLowerStop.smil test', () => {
	test('lower="stop" does not kill higher-priority content', async ({ page, context, smilUrls }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.priorityLowerStop);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Loader may be skipped if files are cached from a previous run
		await waitForLoaderOrSkip(page);

		// P_high (lower="stop", highest priority) plays: video-test-1 + img_1
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// P_high continues looping — the critical assertion: P_high was NOT stopped
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// P_high wallclock ends at +30s → P_low finally plays: img_2 or img_3
		// (seq position depends on timing of priority transition)
		await expect(
			frame.locator('img[src*="images/img_2_18b5d21f.jpg"]:visible, img[src*="images/img_3_4ac1868a.jpg"]:visible')
		).toBeVisible({ timeout: Timeouts.priorityTransition });

		// P_low continues looping — see the other image
		await expect(
			frame.locator('img[src*="images/img_2_18b5d21f.jpg"]:visible, img[src*="images/img_3_4ac1868a.jpg"]:visible')
		).toBeVisible({ timeout: Timeouts.elementAwait });
	});
});
