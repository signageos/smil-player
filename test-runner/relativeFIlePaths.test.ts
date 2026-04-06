import { test, expect } from './fixtures';
import { DUID, Timeouts } from './config';
import { testCoordinates, waitForLoaderOrSkip } from './helpers';
import { getFileName } from './fileNameHelper';

test.describe('relativeFilePaths.smil test', () => {
	// FIXME: Relative path resolution in the player's download pipeline doesn't produce expected
	// video element src attributes. The test server correctly serves files at resolved URLs
	// (http://localhost:3000/layout/assets/loader.mp4 returns 200), but the player doesn't
	// create video elements with matching src patterns. Needs production code investigation.
	test('processes smil file correctly', async ({ page, context, smilUrls, testServerBaseUrl }) => {
		// Compute checksummed filename dynamically (depends on test server port)
		const landscape1Video = getFileName(`${testServerBaseUrl}/layout/assets/landscape1.mp4`);

		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.relativeFilePaths);

		await page.goto(`/?duid=${DUID}`);

		await waitForLoaderOrSkip(page);

		await expect(page.locator(`video[src*="videos/${landscape1Video}"]`)).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(page.locator(`video[src*="videos/${landscape1Video}"]`), 270, 480, 960, 540);

		// Wait for video to loop back (3x video transition duration = ~16s)
		await expect(page.locator(`video[src*="videos/${landscape1Video}"]`)).toBeVisible({ timeout: Timeouts.videoTransition * 3 + Timeouts.elementAwait });
		await testCoordinates(page.locator(`video[src*="videos/${landscape1Video}"]`), 270, 480, 960, 540);
	});
});
