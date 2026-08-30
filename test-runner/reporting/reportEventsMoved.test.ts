import { test, expect } from '../fixtures';
import { DUID, Timeouts } from '../config';

// Opt-in media-moved event on the mapping-only update path. The slot's redirect
// Location gains a new version query param after POST /moved/bump; the content
// bytes are unchanged and already on device, so the player updates only the URL
// mapping — with events="media-moved" that mapping change must be reported (the
// spec asserts at least one report, not exactly one — check-interval timing makes
// an exact count flaky), carrying the NEW resolved URL. media-download must never
// appear (filtered).
test.describe('media-moved reporting on mapping-only update path', () => {
	test('reports media-moved once when the redirect target URL changes without a re-download', async ({
		page,
		context,
		request,
		smilUrls,
		testServerBaseUrl,
	}) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.reportEventsMoved);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Initial download cycle: content plays from /dedup/content/shared.jpg?v=1
		await expect(frame.locator('img[id*="slot-one"]')).toBeVisible({ timeout: Timeouts.firstElement });

		const fetchRecords = async () => {
			const response = await request.get(`${testServerBaseUrl}/report/history`);
			const reports = await response.json();
			return reports.flatMap((r: any) => r.body) as any[];
		};

		// No media-moved before the bump (the mapping has not changed yet)
		expect((await fetchRecords()).map((r) => r.name)).not.toContain('media-moved');

		// Move the content: Location now points to ...?v=2 (same bytes)
		await request.post(`${testServerBaseUrl}/moved/bump`);

		// The 10s update check detects the mapping-only change and reports it
		await expect
			.poll(
				async () => (await fetchRecords()).filter((r) => r.name === 'media-moved').length,
				{ message: 'expected a media-moved report after the redirect target changed', timeout: 40_000 },
			)
			.toBeGreaterThanOrEqual(1);

		const records = await fetchRecords();
		const moved = records.filter((r) => r.name === 'media-moved');
		expect(moved[0].url, 'media-moved reports the NEW resolved URL').toContain('shared.jpg?v=2');
		// events="media-moved" filters everything else, including the initial download
		expect(records.map((r) => r.name), 'media-download must be filtered out').not.toContain('media-download');
	});
});
