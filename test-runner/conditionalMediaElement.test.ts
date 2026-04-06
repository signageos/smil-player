import { test, expect } from './fixtures';
import { DUID, Timeouts } from './config';
import { testCoordinates, waitForLoaderOrSkip } from './helpers';

test.describe('conditionalMediaElement.smil test', () => {
	const video1Coords = [
		[540, 960, 960, 540],
		[0, 0, 960, 540],
	];
	const video2Coords = [
		[540, 0, 960, 540],
		[540, 960, 960, 540],
	];

	/** Find the video-test-1 element positioned at top-left (x≈0, y≈0) */
	async function findVideo1AtTopLeft(page: any) {
		const locator = page.locator('video[src*="videos/video-test_465b7757.mp4"]');
		const count = await locator.count();
		for (let i = 0; i < count; i++) {
			const box = await locator.nth(i).boundingBox();
			if (box && box.x < 10) return locator.nth(i);
		}
		// Fallback to first if only one element
		return locator.first();
	}

	test('processes smil file correctly', async ({ page, context, smilUrls }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.conditionalMediaElement);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Loader video (may be skipped if assets are cached from a previous test)
		await waitForLoaderOrSkip(page);

		// First set of elements visible
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]').first()).toBeVisible({ timeout: Timeouts.firstElement });
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]').first()).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[src*="images/landscape1_fe944bd5.jpg"]').first()).toBeVisible({ timeout: Timeouts.elementAwait });

		// Check video2 coordinates with .each() pattern
		const video2Elements = page.locator('video[src*="videos/video-test_0b02adc4.mp4"]');
		const video2Count = await video2Elements.count();
		for (let i = 0; i < video2Count; i++) {
			await testCoordinates(video2Elements.nth(i), ...video2Coords[i]);
		}
		// video1 may appear in multiple regions — find the one at top-left (x=0)
		const video1AtTL = await findVideo1AtTopLeft(page);
		await testCoordinates(video1AtTL, 0, 0, 960, 540);
		await testCoordinates(frame.locator('img[src*="images/landscape1_fe944bd5.jpg"]').first(), 0, 960, 960, 540);

		// Second state: landscape2 appears, video2 hides
		await expect(frame.locator('img[src*="images/landscape1_fe944bd5.jpg"]').first()).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[src*="images/landscape2_2d654451.jpg"]').first()).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]').first()).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]').first()).not.toBeVisible({ timeout: Timeouts.elementAwait });

		await testCoordinates(frame.locator('img[src*="images/landscape1_fe944bd5.jpg"]').first(), 0, 960, 960, 540);
		await testCoordinates(frame.locator('img[src*="images/landscape2_2d654451.jpg"]').first(), 540, 0, 960, 540);
		// Check video1 coordinates with .each() pattern
		const video1Elements = page.locator('video[src*="videos/video-test_465b7757.mp4"]');
		const video1Count = await video1Elements.count();
		for (let i = 0; i < video1Count; i++) {
			await testCoordinates(video1Elements.nth(i), ...video1Coords[i]);
		}

		// Third state: landscape2 hides, video1 still visible
		await expect(frame.locator('img[src*="images/landscape1_fe944bd5.jpg"]').first()).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[src*="images/landscape2_2d654451.jpg"]').first()).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]').first()).toBeVisible({ timeout: Timeouts.elementAwait });

		const video1AtTL3 = await findVideo1AtTopLeft(page);
		await testCoordinates(video1AtTL3, 0, 0, 960, 540);
		await testCoordinates(frame.locator('img[id*="landscape1"][id*=".jpg-top-right-img4"]'), 0, 960, 960, 540);
		await testCoordinates(frame.locator('img[id*="landscape1"][id*=".jpg-bottom-left-img8"]'), 540, 0, 960, 540);
		await testCoordinates(frame.locator('img[id*="landscape1"][id*=".jpg-bottom-right-img12"]'), 540, 960, 960, 540);

		// Fourth state: video2 reappears
		await expect(frame.locator('img[src*="images/landscape1_fe944bd5.jpg"]').first()).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[src*="images/landscape2_2d654451.jpg"]').first()).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_465b7757.mp4"]').first()).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_0b02adc4.mp4"]').first()).toBeVisible({ timeout: Timeouts.elementAwait });

		await page.waitForTimeout(Timeouts.transition);
		// Check video2 coordinates with reversed index pattern
		const video2ElementsAgain = page.locator('video[src*="videos/video-test_0b02adc4.mp4"]');
		const video2CountAgain = await video2ElementsAgain.count();
		for (let i = 0; i < video2CountAgain; i++) {
			const correctIndex = video2Coords.length - 1 - i;
			await testCoordinates(video2ElementsAgain.nth(i), ...video2Coords[correctIndex]);
		}
		const video1AtTL4 = await findVideo1AtTopLeft(page);
		await testCoordinates(video1AtTL4, 0, 0, 960, 540);
		await testCoordinates(frame.locator('img[id*="landscape1"][id*=".jpg-top-right-img4"]'), 0, 960, 960, 540);
	});
});
