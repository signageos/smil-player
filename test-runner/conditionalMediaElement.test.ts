import { test, expect } from '@playwright/test';
import { DUID, Timeouts, SMILUrls } from './config';
import { testCoordinates } from './helpers';

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

		// Loader video
		await expect(page.locator('video[src*="videos/loader_fe864e57.mp4"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(page.locator('video[src*="videos/loader_fe864e57.mp4"]'), 0, 0, 1920, 1080);

		// First set of elements visible
		await expect(page.locator('video[src*="videos/video-test_17354648.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_54188510.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[src*="images/landscape1_68241f63.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// Check video2 coordinates with .each() pattern
		const video2Elements = page.locator('video[src*="videos/video-test_54188510.mp4"]');
		const video2Count = await video2Elements.count();
		for (let i = 0; i < video2Count; i++) {
			await testCoordinates(video2Elements.nth(i), ...video2Coords[i]);
		}
		await testCoordinates(page.locator('video[src*="videos/video-test_17354648.mp4"]'), 0, 0, 960, 540);
		await testCoordinates(frame.locator('img[src*="images/landscape1_68241f63.jpg"]'), 0, 960, 960, 540);

		// Second state: landscape2 appears, video2 hides
		await expect(frame.locator('img[src*="images/landscape1_68241f63.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[src*="images/landscape2_9a769e36.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_17354648.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_54188510.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });

		await testCoordinates(frame.locator('img[src*="images/landscape1_68241f63.jpg"]'), 0, 960, 960, 540);
		await testCoordinates(frame.locator('img[src*="images/landscape2_9a769e36.jpg"]'), 540, 0, 960, 540);
		// Check video1 coordinates with .each() pattern
		const video1Elements = page.locator('video[src*="videos/video-test_17354648.mp4"]');
		const video1Count = await video1Elements.count();
		for (let i = 0; i < video1Count; i++) {
			await testCoordinates(video1Elements.nth(i), ...video1Coords[i]);
		}

		// Third state: landscape2 hides, video1 still visible
		await expect(frame.locator('img[src*="images/landscape1_68241f63.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[src*="images/landscape2_9a769e36.jpg"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_17354648.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		await testCoordinates(page.locator('video[src*="videos/video-test_17354648.mp4"]').last(), 0, 0, 960, 540);
		await testCoordinates(frame.locator('img[id*="landscape1_7a8cff48.jpg-top-right-img4"]'), 0, 960, 960, 540);
		await testCoordinates(frame.locator('img[id*="landscape1_7a8cff48.jpg-bottom-left-img8"]'), 540, 0, 960, 540);
		await testCoordinates(frame.locator('img[id*="landscape1_7a8cff48.jpg-bottom-right-img12"]'), 540, 960, 960, 540);

		// Fourth state: video2 reappears
		await expect(frame.locator('img[src*="images/landscape1_68241f63.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[src*="images/landscape2_9a769e36.jpg"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_17354648.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video[src*="videos/video-test_54188510.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		await page.waitForTimeout(Timeouts.transition);
		// Check video2 coordinates with reversed index pattern
		const video2ElementsAgain = page.locator('video[src*="videos/video-test_54188510.mp4"]');
		const video2CountAgain = await video2ElementsAgain.count();
		for (let i = 0; i < video2CountAgain; i++) {
			const correctIndex = video2Coords.length - 1 - i;
			await testCoordinates(video2ElementsAgain.nth(i), ...video2Coords[correctIndex]);
		}
		await testCoordinates(page.locator('video[src*="videos/video-test_17354648.mp4"]').last(), 0, 0, 960, 540);
		await testCoordinates(frame.locator('img[id*="landscape1_7a8cff48.jpg-top-right-img4"]'), 0, 960, 960, 540);
	});
});
