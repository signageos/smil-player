import { test, expect } from './fixtures';
import { DUID, Timeouts } from './config';
import { waitForLoaderOrSkip } from './helpers';

// Tests that lower="pause" does NOT pause the higher-priority element when a lower
// arrives. Without the fix in handlePriorityBeforePlay, handlePauseBehaviour acts on
// previousPlayingIndex (the higher element), pausing it and letting the lower take
// over. The fix remaps lower="pause" → defer in this branch.
//
// With the remap, P_high plays throughout its window. P_low defers (waits in
// handleDeferBehaviour) and plays cleanly after P_high's wallclock ends.
test.describe('priorityLowerPause.smil test', () => {
	test('lower="pause" does not pause higher-priority content', async ({ page, context, smilUrls }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.priorityLowerPause);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Loader may be skipped if files are cached from a previous run
		await waitForLoaderOrSkip(page);

		// P_high (lower="pause", highest priority) plays: video-test-1 + img_1
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// P_low content should NOT be visible — lower="pause" remapped to defer
		await expect(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]')).not.toBeVisible({ timeout: 3000 });

		// P_high continues looping — confirms it was NOT paused
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// P_high wallclock ends at +30s → P_low released from defer: img_2 + video-test-2
		await expect(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]')).toBeVisible({ timeout: Timeouts.priorityTransition });
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// P_low continues looping
		await expect(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });
	});
});
