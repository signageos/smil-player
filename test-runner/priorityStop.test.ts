import { test, expect } from '@playwright/test';
import { DUID, Timeouts, SMILUrls } from './config';
import { testCoordinates } from './helpers';

test.describe('priorityStop.smil test', () => {
	test('processes smil file correctly', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.priorityStop);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Loader may be skipped if files are cached from a previous run
		try {
			await expect(page.locator('video[src*="videos/loader_871e2ff0.mp4"]')).toBeVisible({ timeout: 10000 });
			await testCoordinates(page.locator('video[src*="videos/loader_871e2ff0.mp4"]'), 0, 0, 1920, 1080);
		} catch {
			// Files cached — loader was hidden or skipped
		}

		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]'), 0, 0, 1280, 720);

		await expect(page.locator('video[src*="videos/loader_871e2ff0.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });

		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]'), 0, 0, 1280, 720);

		await expect(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]'), 0, 0, 1280, 720);

		await expect(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]'), 0, 0, 1280, 720);

		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[src*="images/img_3_4ac1868a.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[src*="images/img_3_4ac1868a.jpg"]'), 0, 0, 1280, 720);

		await expect(page.locator('video:visible[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video:visible[src*="videos/video-test_0b02adc4.mp4"]'), 0, 0, 1280, 720);
		await page.waitForTimeout(Timeouts.videoTransition);

		await expect(page.locator('video:visible[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video:visible[src*="videos/video-test_0b02adc4.mp4"]'), 0, 0, 1280, 720);

		await expect(frame.locator('img[src*="images/img_3_4ac1868a.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video:visible[src*="videos/video-test_0b02adc4.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[src*="images/img_3_4ac1868a.jpg"]'), 0, 0, 1280, 720);

		await expect(frame.locator('img[src*="images/img_3_4ac1868a.jpg"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video:visible[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video:visible[src*="videos/video-test_0b02adc4.mp4"]'), 0, 0, 1280, 720);
		await page.waitForTimeout(Timeouts.videoTransition);

		await expect(page.locator('video:visible[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video:visible[src*="videos/video-test_0b02adc4.mp4"]'), 0, 0, 1280, 720);

		await expect(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[src*="images/img_3_4ac1868a.jpg"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]'), 0, 0, 1280, 720);

		await expect(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]'), 0, 0, 1280, 720);

		await expect(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]'), 0, 0, 1280, 720);

		await expect(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]'), 0, 0, 1280, 720);

		await expect(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]'), 0, 0, 1280, 720);

		await expect(page.locator('video:visible[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video:visible[src*="videos/video-test_0b02adc4.mp4"]'), 0, 0, 1280, 720);

		await expect(frame.locator('img[src*="images/img_3_4ac1868a.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[src*="images/img_3_4ac1868a.jpg"]'), 0, 0, 1280, 720);

		await expect(frame.locator('img[src*="images/img_3_4ac1868a.jpg"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video:visible[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video:visible[src*="videos/video-test_0b02adc4.mp4"]'), 0, 0, 1280, 720);
		await page.waitForTimeout(Timeouts.videoTransition);

		await expect(page.locator('video:visible[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video:visible[src*="videos/video-test_0b02adc4.mp4"]'), 0, 0, 1280, 720);

		// P2 wallclock ends → P1 (highest priority) resumes.
		// P1 continues from where it was stopped in its seq, NOT from the first element.
		// This is because handlePrecedingContentStop defers remaining seq elements until the
		// blocking higher-priority content finishes, then releases them in order.
		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]'), 0, 0, 1280, 720);

		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]'), 0, 0, 1280, 720);

		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).not.toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]'), 0, 0, 1280, 720);
	});
});
