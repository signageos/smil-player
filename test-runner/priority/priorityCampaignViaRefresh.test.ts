import { test, expect } from '../fixtures';
import { DUID, Timeouts } from '../config';

// A priority campaign delivered THROUGH a SMIL refresh while the base loop is running.
// Fixture shape = what a scheduling backend renders: <meta defaultRepeatCount="indefinite"/>,
// <excl> of <priorityClass><par begin end><seq repeatCount="indefinite">. This shape routes the
// campaign <par> through createRepeatCountIndefinitePromise, which ARMS waitTimeoutOrFileUpdate
// for a future begin (the multi-class seq template never arms it — it re-passes instead).
//
// Phase 1 (first GET): campaign window permanently expired → base loop only.
// Phase 2 (GET after the 5s refresh): campaign window re-rendered from "now":
//   priorityNowViaRefresh    begin = now       → control, takes over immediately
//   priorityFutureViaRefresh begin = now + 40s → the new version arms a 40s wait, then the
//                                                version-0 cancel resolves the shared cancelDeferred
//                                                and the wait returns "file updated" → campaign never plays
const CAMPAIGN_VIDEO = 'video[src*="videos/video-test_465b7757.mp4"]';
const BASE_IMG = 'img[src*="images/img_1_aba14e1e.jpg"]';
// refresh (≤5s) + reload + 40s wallclock wait + first-frame; window stays open for 150s
const CAMPAIGN_APPEARS = 100_000;

test.describe('campaign delivered by SMIL refresh', () => {
	for (const [label, key] of [
		['begin = now (control)', 'priorityNowViaRefresh'],
		['begin = now + 40s', 'priorityFutureViaRefresh'],
	] as const) {
		test(`plays inside its window: ${label}`, async ({ page, context, smilUrls }) => {
			await context.addInitScript((url: string) => {
				(window as unknown as { __SMIL_URL__?: string }).__SMIL_URL__ = url;
			}, smilUrls[key]);
			await page.goto(`/?duid=${DUID}`);
			const frame = page.frameLocator('iframe');

			// Phase 1: base loop
			await expect(frame.locator(BASE_IMG)).toBeVisible({ timeout: Timeouts.firstElement });

			// Phase 2: campaign must appear inside its window
			await expect(page.locator(CAMPAIGN_VIDEO), 'campaign delivered by refresh never started').toBeVisible({
				timeout: CAMPAIGN_APPEARS,
			});
		});
	}
});
