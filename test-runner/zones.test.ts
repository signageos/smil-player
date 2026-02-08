import { test, expect } from '@playwright/test';
import { DUID, Timeouts, SMILUrls } from './config';
import { testCoordinates } from './helpers';

test.describe('zonesCypress.smil test', () => {
	test('processes smil file correctly', async ({ page, context }) => {
		page.on('console', msg => {
			const text = msg.text();
			if (text.includes('SMIL-PLAYER') || text.includes('Playing video') || text.includes('src=')) {
				console.log(`[PAGE] ${text.substring(0, 200)}`);
			}
		});

		// Inject smilUrl into all frames before any script runs
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.zones);

		await page.goto(`/?duid=${DUID}`);

		const frame = page.frameLocator('iframe');

		// Step 1: Loader video visible on main page with full-screen coordinates
		const loader = page.locator('video[src*="loader"]');
		await expect(loader).toBeVisible({ timeout: Timeouts.firstElement });
		await testCoordinates(loader, 0, 0, 1920, 1080);

		// Step 2: Zone elements appear
		const widgetImg1 = frame.locator('img[src*="widget_ima"][src*=".png"]').first();
		await expect(widgetImg1).toBeVisible({ timeout: Timeouts.elementAwait });

		const bottomWidget = frame.locator('iframe[src*="bottomWidg"]');
		await expect(bottomWidget).toBeVisible({ timeout: Timeouts.elementAwait });

		const widgetImg2 = frame.locator('img[src*="widget_ima"][src*=".png"]').nth(1);
		await expect(widgetImg2).toBeVisible({ timeout: Timeouts.elementAwait });

		const video1 = page.locator('video[src*="video-test"]').first();
		await expect(video1).toBeVisible({ timeout: Timeouts.elementAwait });

		// Check zone coordinates
		await testCoordinates(widgetImg1, 0, 1280, 640, 506);
		// bottom=0 in SMIL → top = viewportHeight(1920) - height(360) = 1560
		await testCoordinates(bottomWidget, 1560, 0, 1280, 360);
		await testCoordinates(widgetImg2, 506, 1280, 640, 574);
		await testCoordinates(video1, 0, 0, 1280, 720);

		// Step 3: Video1 hides, video2 becomes visible
		await expect(video1).not.toBeVisible({ timeout: Timeouts.elementAwait });
		// After video1 hides, a new video-test element becomes visible
		const video2 = page.locator('video[src*="video-test"]').first();
		await expect(video2).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(video2, 0, 0, 1280, 720);

		// Step 4: Video2 hides, img_1 becomes visible (inside iframe)
		await expect(video2).not.toBeVisible({ timeout: Timeouts.elementAwait });
		const img1 = frame.locator('img[src*="img_1"]');
		await expect(img1).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(img1, 0, 0, 1280, 720);

		// Step 5: img_1 hides, img_2 becomes visible (inside iframe)
		await expect(img1).not.toBeVisible({ timeout: Timeouts.elementAwait });
		const img2 = frame.locator('img[src*="img_2"]');
		await expect(img2).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(img2, 0, 0, 1280, 720);

		// Step 6: Video1 loops back visible — re-check all zone coordinates
		const videoLooped = page.locator('video[src*="video-test"]').first();
		await expect(videoLooped).toBeVisible({ timeout: Timeouts.elementAwait });
		await testCoordinates(videoLooped, 0, 0, 1280, 720);
		await testCoordinates(widgetImg1, 0, 1280, 640, 506);
		await testCoordinates(bottomWidget, 1560, 0, 1280, 360);
		await testCoordinates(widgetImg2, 506, 1280, 640, 574);
		await expect(widgetImg1).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(bottomWidget).toBeVisible({ timeout: Timeouts.elementAwait });
		await expect(widgetImg2).toBeVisible({ timeout: Timeouts.elementAwait });
	});
});
