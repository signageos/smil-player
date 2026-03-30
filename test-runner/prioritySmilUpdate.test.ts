import { test, expect } from '@playwright/test';
import { DUID, Timeouts, SMILUrls } from './config';

// Tests that a SMIL file update during active priority playback correctly cancels
// all priority playlists and reloads with new content.
//
// Phase 1 (first SMIL fetch): P_high active → plays video-test-1 + img_1, P_low deferred
// Phase 2 (second SMIL fetch after ~5s refresh): P_high wallclock expired → P_low plays img_2 + video-test-2
//
// The /dynamic-update/ endpoint returns incrementing Last-Modified headers and
// different wallclock values on each GET request (HEAD requests don't increment).
test.describe('prioritySmilUpdate.smil test', () => {
	test('SMIL update during priority playback cancels and reloads correctly', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.prioritySmilUpdate);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Loader may be skipped if files are cached from a previous run
		try {
			await expect(page.locator('video[src*="videos/loader_871e2ff0.mp4"]')).toBeVisible({ timeout: 10000 });
		} catch {
			// Files cached — loader was hidden or skipped
		}

		// Phase 1: P_high plays (highest priority, active wallclock)
		await expect(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// P_low is deferred — should NOT be visible during Phase 1
		await expect(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]')).not.toBeVisible({ timeout: 3000 });

		// Phase 2: ResourceChecker detects new Last-Modified header (Refresh content="5"),
		// triggers cancelFunction=true, player reloads with Phase 2 SMIL where
		// P_high wallclock is in the past (expired). Only P_low plays.
		// Use generous timeout: 5s refresh interval + HEAD request + reload + asset prefetch
		await expect(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]')).toBeVisible({ timeout: 45000 });

		// Verify P_low continues (video-test-2)
		await expect(page.locator('video:visible[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// P_low loops — confirms new SMIL is active and stable
		await expect(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });
	});
});
