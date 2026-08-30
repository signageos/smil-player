import { test, expect } from '../fixtures';
import { DUID, Timeouts } from '../config';

// Opt-in media-skipped event on the playability-gate skip path. The gated slot's
// /gate/check GET returns 404 (skip-mode on), so the element is skipped every
// pass — with events="media-skipped" each skip must be reported with the gated
// element's src. media-playback must never appear (filtered by the allowlist).
test.describe('media-skipped reporting on the playCheckUrl gate path', () => {
	test('reports media-skipped when the gate closes an element', async ({
		page,
		context,
		request,
		smilUrls,
		testServerBaseUrl,
	}) => {
		// Close the gate before the player boots so every pass skips the element
		await request.post(`${testServerBaseUrl}/gate/skip-mode/skipped-one`);

		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.reportEventsSkipped);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Playback is running: the non-gated image shows
		await expect(frame.locator('img[id*="landscape1"]')).toBeVisible({ timeout: Timeouts.firstElement });

		const fetchRecords = async () => {
			const response = await request.get(`${testServerBaseUrl}/report/history`);
			const reports = await response.json();
			return reports.flatMap((r: any) => r.body) as any[];
		};

		await expect
			.poll(
				async () => (await fetchRecords()).filter((r) => r.name === 'media-skipped').length,
				{ message: 'expected a media-skipped report for the gated element', timeout: 40_000 },
			)
			.toBeGreaterThanOrEqual(1);

		const records = await fetchRecords();
		const skipped = records.filter((r) => r.name === 'media-skipped');
		expect(skipped[0].url, 'media-skipped carries the gated element src').toContain('landscape2.jpg');
		// events="media-skipped" filters everything else, including playback of the open slot
		expect(records.map((r) => r.name), 'media-playback must be filtered out').not.toContain('media-playback');
	});
});
