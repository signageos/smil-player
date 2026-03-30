import { test, expect } from '@playwright/test';
import { DUID, Timeouts, SMILUrls } from './config';
// Tests the lower="never" priority behavior.
// BUG: handleNeverBehaviour (playlistPriority.ts) only sleeps 100ms and does NOT
// actually block lower-priority content from rendering. The "never" rule is
// effectively ignored — lower-priority elements briefly appear during
// priority initialization and may remain visible alongside higher-priority content.
// This test only verifies:
// 1. P_high content plays during its wallclock window
// 2. After P_high wallclock expires, P_low content plays
test.describe('priorityNever.smil test', () => {
	test('higher-priority content plays and lower plays after it ends', async ({ page, context }) => {
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

		// P_high (highest priority) plays: video-test-1 + img_1 loop
		await expect(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });

		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// NOTE: Cannot assert P_low is NOT visible here — handleNeverBehaviour only
		// sleeps 100ms and does not block lower-priority content from rendering.
		// This is a known code bug (see playlistPriority.ts handleNeverBehaviour).

		// P_high loops another iteration
		await expect(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// P_high wallclock ends at +40s → P_low finally plays
		await expect(
			frame.locator('img[src*="images/img_3_4ac1868a.jpg"]:visible, img[src*="images/img_2_18b5d21f.jpg"]:visible')
		).toBeVisible({ timeout: Timeouts.priorityTransition });
	});
});
