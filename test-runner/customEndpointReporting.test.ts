import { test, expect } from './fixtures';
import { DUID, Timeouts, SMILUrls } from './config';
import { waitForLoaderOrSkip } from './helpers';

// Tests that the player sends PoP (Proof of Play) reports to a custom endpoint
// when <meta log="true" type="manual" endpoint="http://..."/> is configured.
//
// The player uses native fetch() POST to the endpoint URL after each media finishes
// playing. The test server captures these payloads at /report and exposes them
// via GET /report/history for assertion.
test.describe('customEndpointReporting.smil test', () => {
	test.beforeEach(async ({ request }) => {
		await request.post('http://localhost:3000/reset');
	});

	test('sends PoP reports to custom endpoint on media playback', async ({ page, context, request }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, SMILUrls.customEndpointReporting);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Wait for loader during prefetch
		await waitForLoaderOrSkip(page);

		// Wait for video to play (on main page)
		await expect(page.locator('video[src*="landscape1"]')).toBeVisible({ timeout: Timeouts.firstElement });

		// Wait for image to appear (in iframe) — indicates video finished, report should have been sent
		await expect(frame.locator('img[src*="landscape1"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// Wait for second cycle to accumulate more reports
		await expect(page.locator('video[src*="landscape1"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// Query report history from test server
		const response = await request.get('http://localhost:3000/report/history');
		const reports = await response.json();

		// Verify reports were received (at least video + image from first cycle)
		expect(reports.length).toBeGreaterThanOrEqual(2);

		// Verify report payload structure
		const firstReport = reports[0].body;
		expect(Array.isArray(firstReport)).toBe(true);
		expect(firstReport.length).toBeGreaterThanOrEqual(1);

		const record = firstReport[0];
		expect(record).toHaveProperty('name', 'media-playback');
		expect(record).toHaveProperty('recordedAt');
		expect(record).toHaveProperty('playbackSuccess', true);

		// Verify PoP attributes are present across all reports
		const allRecords = reports.flatMap((r: any) => r.body);
		const types = allRecords.map((r: any) => r.type).filter(Boolean);
		expect(types).toContain('video');
		expect(types).toContain('image');
	});
});
