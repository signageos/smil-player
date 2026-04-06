import { test, expect } from './fixtures';
import { DUID, Timeouts, SMILUrls } from './config';
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

	test('processes smil file correctly', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.conditionalMediaElement);

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
		// video1 may appear in multiple regions at certain timing, check the one in top-left
		const video1First = page.locator('video[src*="videos/video-test_465b7757.mp4"]');
		const video1FirstCount = await video1First.count();
		if (video1FirstCount === 1) {
			await testCoordinates(video1First, 0, 0, 960, 540);
		} else {
			// Multiple video-test-1 elements — find the one at top-left (x=0)
			let found = false;
			for (let i = 0; i < video1FirstCount; i++) {
				const box = await video1First.nth(i).boundingBox();
				if (box && box.x === 0) { await testCoordinates(video1First.nth(i), 0, 0, 960, 540); found = true; break; }
			}
			expect(found).toBe(true);
		}
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

		await testCoordinates(page.locator('video[src*="videos/video-test_465b7757.mp4"]').last(), 0, 0, 960, 540);
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
		await testCoordinates(page.locator('video[src*="videos/video-test_465b7757.mp4"]').last(), 0, 0, 960, 540);
		await testCoordinates(frame.locator('img[id*="landscape1"][id*=".jpg-top-right-img4"]'), 0, 960, 960, 540);
	});
});
