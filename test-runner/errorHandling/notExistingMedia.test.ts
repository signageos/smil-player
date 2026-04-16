import { test, expect } from '../fixtures';
import { DUID, Timeouts } from '../config';
import { testCoordinates } from '../helpers';

test.describe('NonExistingMedia.smil test', () => {
	test('processes smil file correctly', async ({ page, context, smilUrls }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.notExistingMedia);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Intro landscape2 is intentionally not asserted here. Its visible
		// duration is bounded by Promise.all(downloadPromises) for the main
		// playlist (smilPlayer.ts:291-308). When the main playlist has
		// fast-failing URLs (as in this fixture: statttttic/signaaaaaageos/
		// signageeeeeeos hostnames → DNS error in tens of ms), intro visibility
		// can flash below Playwright's poll interval, producing a flake where
		// the element is in DOM but never sampled as visible. Intro rendering
		// is covered by repeatCountIntroImage.test.ts under stable (non-broken)
		// URLs. This test's scope is broken-URL recovery, verified by the
		// main-region assertions below.
		await expect(frame.locator('img[id*="img_1_aba1"][id*=".jpg-main-img2"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(frame.locator('img[id*="img_1_aba1"][id*=".jpg-main-img2"]'), 0, 0, 1920, 1080);

		await expect(frame.locator('img[id*="img_1_aba1"][id*=".jpg-main-img2"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]'), 0, 0, 1920, 1080);

		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[id*="img_1_aba1"][id*=".jpg-main-img2"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[id*="img_1_aba1"][id*=".jpg-main-img2"]'), 0, 0, 1920, 1080);
	});
});
