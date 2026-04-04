import { test, expect } from './fixtures';
import { DUID, Timeouts, SMILUrls } from './config';

test.describe('prioritySeqCampaign.smil test', () => {
	test('production-style seq campaign rotation with priority', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.prioritySeqCampaign);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		try {
			await expect(page.locator('video[src*="videos/loader_871e2ff0.mp4"]')).toBeVisible({ timeout: 10000 });
		} catch {
			// Files cached
		}

		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[src*="images/img_3_4ac1868a.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		// After wallclock expires → low priority plays
		await expect(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]')).toBeVisible({ timeout: Timeouts.priorityTransition });
	});
});
