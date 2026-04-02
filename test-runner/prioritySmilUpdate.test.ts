import { test, expect } from '@playwright/test';
import { DUID, Timeouts, SMILUrls } from './config';

// Tests that a SMIL file update during active priority playback correctly cancels
// all priority playlists and reloads with new content.
//
// Phase 1 (first SMIL fetch, requestCount=1): P_high active 60s, P_low deferred
// Phase 2 (second SMIL fetch after ~5s refresh, requestCount=2):
//   P_high active for 15s → verifies P_high plays immediately after reload (no P_low flicker)
//   Then P_high expires → P_low plays
//
// The /dynamic-update/ endpoint returns incrementing Last-Modified headers and
// different wallclock values on each GET request (HEAD requests don't increment).
test.describe('prioritySmilUpdate.smil test', () => {
	test.beforeEach(async ({ request }) => {
		// Reset server-side request counters so requestCount starts at 0
		await request.post('http://localhost:3000/reset');
	});

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
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });

		// Phase 2: ResourceChecker detects new Last-Modified header (Refresh content="5"),
		// triggers cancelFunction=true, player reloads with Phase 2 SMIL.
		// Phase 2 P_high is still active (15s window) — verify it plays immediately after reload.
		// Use generous timeout for reload: 5s refresh interval + HEAD + reload + asset prefetch
		// P_high content (video-test-1) should reappear after reload — confirms priority maintained.
		// Wait for video-test-1 to disappear (reload happening) then reappear (Phase 2 P_high)
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).not.toBeVisible({ timeout: 45000 });
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });

		// Verify P_low is NOT visible while Phase 2 P_high is active
		await expect(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]')).not.toBeVisible({ timeout: 3000 });

		// Phase 2 P_high expires after 15s → P_low finally plays
		await expect(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]')).toBeVisible({ timeout: Timeouts.priorityTransition });

		// Verify P_low continues (video-test-2)
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// P_low loops — confirms new SMIL is active and stable
		await expect(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });
	});
});
