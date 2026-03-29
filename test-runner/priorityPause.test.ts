import { test, expect } from '@playwright/test';
import { DUID, Timeouts, SMILUrls } from './config';
import { testCoordinates } from './helpers';

test.describe('priorityPause.smil test', () => {
	test('processes smil file correctly', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.priorityPause);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Loader may be skipped if files are cached from a previous run
		try {
			await expect(page.locator('video[src*="videos/loader_871e2ff0.mp4"]')).toBeVisible({ timeout: 10000 });
			await testCoordinates(page.locator('video[src*="videos/loader_871e2ff0.mp4"]'), 0, 0, 1920, 1080);
		} catch {
			// Files cached — loader was hidden or skipped
		}

		// P3 (lowest, always active): img_1 + img_2 + video-test-1 loop
		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]'), 0, 0, 1280, 720);

		await expect(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]'), 0, 0, 1280, 720);

		// P2 interrupts P3 (pauses it) at +20s: img_3 + video-test-2 loop
		await expect(frame.locator('img[src*="images/img_3_4ac1868a.jpg"]')).toBeVisible({ timeout: Timeouts.priorityTransition });
		await testCoordinates(frame.locator('img[src*="images/img_3_4ac1868a.jpg"]'), 0, 0, 1280, 720);

		await expect(page.locator('video:visible[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video:visible[src*="videos/video-test_0b02adc4.mp4"]'), 0, 0, 1280, 720);
		await page.waitForTimeout(Timeouts.videoTransition);

		// P1 interrupts P2 (pauses it) at +50s: video-test-1 + img_1 loop
		await expect(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.priorityTransition });
		await testCoordinates(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]'), 0, 0, 1280, 720);

		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]'), 0, 0, 1280, 720);

		// P1 plays another iteration
		await expect(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video:visible[src*="videos/video-test_465b7757.mp4"]'), 0, 0, 1280, 720);

		// P1 wallclock ends at +70s → P2 resumes (was paused): continues with its content
		await expect(frame.locator('img[src*="images/img_3_4ac1868a.jpg"]')).toBeVisible({ timeout: Timeouts.priorityTransition });
		await testCoordinates(frame.locator('img[src*="images/img_3_4ac1868a.jpg"]'), 0, 0, 1280, 720);

		await expect(page.locator('video:visible[src*="videos/video-test_0b02adc4.mp4"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(page.locator('video:visible[src*="videos/video-test_0b02adc4.mp4"]'), 0, 0, 1280, 720);

		// P2 wallclock ends at +100s → P3 resumes (was paused): continues with its content
		await expect(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]')).toBeVisible({ timeout: Timeouts.priorityTransition });
		await testCoordinates(frame.locator('img:visible[src*="images/img_1_aba14e1e.jpg"]'), 0, 0, 1280, 720);

		await expect(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]')).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(frame.locator('img[src*="images/img_2_18b5d21f.jpg"]'), 0, 0, 1280, 720);
	});
});
