import { test, expect } from '../fixtures';
import { DUID, Timeouts } from '../config';
import { waitForLoaderOrSkip } from '../helpers';

// Boot ordering (filed bug #9): with a meta-only logging config (no
// sos.config.reportUrl), the first playlist-playback report used to be dropped
// because sendSmiFileReport ran BEFORE setSmiLogging applied the parsed
// <meta log> config. After the swap the first playlist-playback must arrive.
test.describe('bootPlaylistPlayback test', () => {
	test('first playlist-playback report arrives with meta-only logging config', async ({
		page,
		context,
		request,
		smilUrls,
		testServerBaseUrl,
	}) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.customEndpointReporting);

		await page.goto(`/?duid=${DUID}`);

		await waitForLoaderOrSkip(page);
		await expect(page.locator('video[src*="landscape1"]')).toBeVisible({ timeout: Timeouts.firstElement });

		await expect
			.poll(
				async () => {
					const response = await request.get(`${testServerBaseUrl}/report/history`);
					const reports = await response.json();
					const records: any[] = reports.flatMap((r: any) => r.body);
					return records.filter((r) => r.name === 'playlist-playback').length;
				},
				{ message: 'expected a playlist-playback report for the SMIL file itself', timeout: Timeouts.elementAwait },
			)
			.toBeGreaterThanOrEqual(1);
	});
});
