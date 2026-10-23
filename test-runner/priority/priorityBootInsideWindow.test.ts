import { test, expect } from '../fixtures';
import { DUID, Timeouts } from '../config';
import { waitForLoaderOrSkip } from '../helpers';

// Mechanism 1 of docs/superpowers/bugs/2026-09-18-priority-takeover-races.md.
// The campaign window is already open when the player boots, so the campaign slot precedes the
// lower slot in the region array and the lower class is defer-held, not pause-held. Pre-fix,
// handlePriorityWhenDone releases the slot between every repeatCount="1" pass of the campaign and
// the deferred lower video wins the race against the next pass: the screen alternates ~10s campaign
// image / ~10s lower video for the whole window (first leak ~20s after boot).
//
// CDN assets (same as the other priority fixtures) so the runtime file names are stable across the
// per-worker server ports: img_1.jpg → images/img_1_aba14e1e.jpg. The lower class starts with two
// videos; a lower <video> whose DOM src is still set (it is nulled on stop) is the leak. The loader is
// an image (landscape1.jpg), so no loader <video> can match ANY_LOWER_VIDEO.
const CAMPAIGN_IMG = 'img:visible[src*="images/img_1_aba14e1e.jpg"]';
const ANY_LOWER_VIDEO = 'video[src*="videos/video-test_"]';

test.describe('priorityBootInsideWindow.smil test', () => {
	test('lower class stays off screen for the whole campaign window, then resumes', async ({
		page,
		context,
		smilUrls,
	}) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.priorityBootInsideWindow);

		const gotoAt = Date.now();
		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		await waitForLoaderOrSkip(page);

		await expect(frame.locator(CAMPAIGN_IMG), 'campaign image paints at boot').toBeVisible({
			timeout: Timeouts.firstElement,
		});

		// Pre-fix the first lower video starts ~20s after boot and one more every ~20s.
		// Anchored to the SMIL fetch (goto), not to when the campaign image became visible (up to 90s
		// after goto on a slow boot): the window closes 80s after the SMIL fetch, so the deadline leaves
		// 10s of slack before that close instead of risking an overlap.
		const deadline = gotoAt + 70_000;
		while (Date.now() < deadline) {
			await expect(
				page.locator(ANY_LOWER_VIDEO),
				'lower video must not start inside the campaign window',
			).toHaveCount(0, { timeout: 500 });
			await page.waitForTimeout(1_000);
		}

		// Window closes 80s after the SMIL fetch: the lower class must resume (release path intact).
		await expect(page.locator(ANY_LOWER_VIDEO).first(), 'lower class resumes after the window closes').toBeVisible({
			timeout: Timeouts.priorityTransition,
		});
	});
});
