import { test, expect } from './fixtures';
import { DUID, Timeouts, SMILUrls } from './config';
import { waitForLoaderOrSkip } from './helpers';

// Tests higher="stop" priority behavior with three priority levels.
// Timeline: P3 always active → P2 stops P3 at +35s → P1 stops P2 at +60s →
//           P1 ends at +80s, P2 resumes → P2 ends at +100s, P3 resumes.
//
// Phase-transition assertions only — no intra-phase element tracking.
// P1 content: video-test-1 (465b7757) + img_1  (shares media with P3)
// P2 content: img_3 (4ac1868a) + video-test-2 (0b02adc4)  (P2-exclusive)
// P3 content: img_1 (aba14e1e) + img_2 (18b5d21f) + video-test-1 (465b7757)
test.describe('priorityStop.smil test', () => {
	test('processes smil file correctly', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.priorityStop);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Loader may be skipped if files are cached from a previous run
		await waitForLoaderOrSkip(page);

		// Phase 1: P3 plays (lowest priority, always active)
		// Any P3 content: img_1 or img_2 in iframe, or video-test-1 on main page
		await expect(
			frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"], img:visible[src*="images/img_2_18b5d21f.jpg"]')
		).toBeVisible({ timeout: Timeouts.firstElement });

		// Phase 2: P2 takes over at +35s (stops P3)
		// img_3 is P2-exclusive content — its presence proves P2 activated
		await expect(frame.locator('img[src*="images/img_3_4ac1868a.jpg"]')).toBeVisible({ timeout: Timeouts.priorityTransition });

		// Phase 3: P1 takes over at +60s (stops P2)
		// After P2 was active, video-test-1 reappearing means P1 stopped P2.
		// (P3 is stopped, so video-test-1 must be P1.)
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.priorityTransition });

		// Phase 4: P1 ends at +80s → P2 resumes (restarts from beginning)
		// img_3 is the first element in P2's seq — its reappearance proves P2 resumed
		await expect(frame.locator('img[src*="images/img_3_4ac1868a.jpg"]')).toBeVisible({ timeout: Timeouts.priorityTransition });

		// Phase 5: P2 ends at +100s → P3 resumes (restarts)
		// P3 content: img_1 or img_2 (after P2 content was showing)
		await expect(
			frame.locator('img[src*="images/img_1_aba14e1e.jpg"]:visible, img[src*="images/img_2_18b5d21f.jpg"]:visible')
		).toBeVisible({ timeout: Timeouts.priorityTransition });

		// Verify P3 continues looping: see next P3 element (img_2 or video-test-1)
		await expect(
			frame.locator('img[src*="images/img_2_18b5d21f.jpg"]')
		).toBeVisible({ timeout: Timeouts.elementAwait });
	});
});
