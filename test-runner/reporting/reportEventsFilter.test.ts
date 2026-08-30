import { test, expect } from '../fixtures';
import { DUID, Timeouts } from '../config';
import { waitForLoaderOrSkip } from '../helpers';

// Tests the <meta events="..."> allowlist for custom-endpoint reporting.
// The fixture sets events="media-playback", so ONLY media-playback records may
// reach the endpoint — media-download, playlist-download and playlist-playback
// are emitted by the same playlist run but must be dropped at the gate.
test.describe('reportEventsFilter.smil test', () => {
	test('sends only allowlisted event names to the custom endpoint', async ({
		page,
		context,
		request,
		smilUrls,
		testServerBaseUrl,
	}) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.reportEventsFilter);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		await waitForLoaderOrSkip(page);

		// Full cycle: video (15s) -> image -> video again, so both a media-playback
		// record and (if unfiltered) media-download/playlist records would exist.
		await expect(page.locator('video[src*="landscape1"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await expect(frame.locator('img[src*="landscape1"]')).toBeVisible({ timeout: 15_000 + Timeouts.elementAwait });
		await expect(page.locator('video[src*="landscape1"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		const response = await request.get(`${testServerBaseUrl}/report/history`);
		const reports = await response.json();
		const records: any[] = reports.flatMap((r: any) => r.body);

		const names = records.map((r) => r.name);
		expect(
			names.filter((name) => name === 'media-playback').length,
			'expected at least one allowlisted media-playback report',
		).toBeGreaterThanOrEqual(1);
		expect(names, 'media-download must be filtered out').not.toContain('media-download');
		expect(names, 'playlist-download must be filtered out').not.toContain('playlist-download');
		expect(names, 'playlist-playback must be filtered out').not.toContain('playlist-playback');
	});
});
