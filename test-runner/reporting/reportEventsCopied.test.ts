import { test, expect } from '../fixtures';
import { DUID, Timeouts } from '../config';

// Opt-in media-copied event on the dedup copy path. Two <img> slots resolve to
// the same content URL; the player downloads once and copies for the duplicate.
// That copy used to be silent — with events="media-copied" it must be reported.
// (The opt-in-only negative — no media-copied without the allowlist — is covered
// by the isCustomEndpointEventAllowed unit matrix in test/unit/tools/files.spec.ts.)
test.describe('media-copied reporting on dedup copy path', () => {
	test('reports media-copied for the duplicate slot when allowlisted', async ({
		page,
		context,
		request,
		smilUrls,
		testServerBaseUrl,
	}) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.reportEventsCopied);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Both slots render, proving the duplicate slot was satisfied by a copy.
		await expect(frame.locator('img[id*="slot-one"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await expect(frame.locator('img[id*="slot-two"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		const fetchRecords = async () => {
			const response = await request.get(`${testServerBaseUrl}/report/history`);
			const reports = await response.json();
			return reports.flatMap((r: any) => r.body) as any[];
		};

		await expect
			.poll(
				async () => (await fetchRecords()).filter((r) => r.name === 'media-copied').length,
				{ message: 'expected a media-copied report for the duplicate slot', timeout: Timeouts.elementAwait },
			)
			.toBeGreaterThanOrEqual(1);

		const records = await fetchRecords();
		const copied = records.filter((r) => r.name === 'media-copied');
		expect(copied[0].url, 'media-copied reports the resolved content URL').toContain('shared.jpg');
		// events="media-copied" excludes everything else, including media-download
		expect(records.map((r) => r.name), 'media-download must be filtered out').not.toContain('media-download');
	});
});
