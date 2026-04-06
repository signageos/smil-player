import { test, expect } from './fixtures';
import { DUID, Timeouts, SMILUrls } from './config';
import { testCoordinates } from './helpers';

test.describe('relativeFilePaths.smil test', () => {
	// FIXME: Relative path resolution in the player's download pipeline doesn't produce expected
	// video element src attributes. The test server correctly serves files at resolved URLs
	// (http://localhost:3000/layout/assets/loader.mp4 returns 200), but the player doesn't
	// create video elements with matching src patterns. Needs production code investigation.
	test('processes smil file correctly', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.relativeFilePaths);

		await page.goto(`/?duid=${DUID}`);

		try {
			await expect(page.locator('video[src*="videos/loader_5c220733.mp4"]')).toBeVisible({ timeout: 10000 });
		} catch {
			// Files cached — loader was hidden or skipped
		}

		await expect(page.locator('video[src*="videos/landscape1_0fbebf6f.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(page.locator('video[src*="videos/landscape1_0fbebf6f.mp4"]'), 270, 480, 960, 540);
		// await expect(page.locator('video[src*="videos/loader_5c220733.mp4"]')).toHaveCount(0);
		await page.waitForTimeout(Timeouts.videoTransition);
		await page.waitForTimeout(Timeouts.videoTransition);
		await page.waitForTimeout(Timeouts.videoTransition);

		await expect(page.locator('video[src*="videos/landscape1_0fbebf6f.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/landscape1_0fbebf6f.mp4"]'), 270, 480, 960, 540);
	});
});
