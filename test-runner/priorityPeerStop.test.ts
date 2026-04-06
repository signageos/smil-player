import { test, expect } from './fixtures';
import { DUID, Timeouts, SMILUrls } from './config';
import { waitForLoaderOrSkip } from './helpers';

test.describe('priorityPeerStop.smil test', () => {
	test('stopped peer recovers via handlePrecedingContentStop when stopper finishes', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.priorityPeerStop);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		await waitForLoaderOrSkip(page);

		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		await expect(frame.locator('img[src*="images/img_3_4ac1868a.jpg"]')).toBeVisible({ timeout: Timeouts.priorityTransition });

		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.priorityTransition });
	});
});
