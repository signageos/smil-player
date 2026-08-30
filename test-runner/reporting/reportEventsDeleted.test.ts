import { test, expect } from '../fixtures';
import { DUID, Timeouts } from '../config';
import { getFileName } from '../../src/components/files/tools/fileName';

// Opt-in media-deleted event on the boot-cleanup path. Phase 1 downloads two
// images; phase 2 reloads with a SMIL that no longer references landscape2, so
// deleteUnusedFiles must remove its stored file and report media-deleted with
// the deleted file's local path. media-download must never appear (filtered).
test.describe('media-deleted reporting on the boot-cleanup path', () => {
	test('reports media-deleted when a SMIL update orphans a downloaded file', async ({
		page,
		context,
		request,
		smilUrls,
		testServerBaseUrl,
	}) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.reportEventsDeleted);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Phase 1: both images downloaded and rotating
		await expect(frame.locator('img[id*="landscape2"]')).toBeVisible({ timeout: Timeouts.firstElement });

		const fetchRecords = async () => {
			const response = await request.get(`${testServerBaseUrl}/report/history`);
			const reports = await response.json();
			return reports.flatMap((r: any) => r.body) as any[];
		};

		// No media-deleted yet — nothing was orphaned
		expect((await fetchRecords()).map((r) => r.name)).not.toContain('media-deleted');

		// Phase 2: reboot with the SMIL that dropped landscape2 (later init script wins)
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.reportEventsDeletedAfter);
		await page.reload();
		await expect(frame.locator('img[id*="landscape1"]')).toBeVisible({ timeout: Timeouts.firstElement });

		await expect
			.poll(
				async () => (await fetchRecords()).filter((r) => r.name === 'media-deleted').length,
				{ message: 'expected a media-deleted report after the orphaned file was cleaned up', timeout: 40_000 },
			)
			.toBeGreaterThanOrEqual(1);

		const records = await fetchRecords();
		const deleted = records.filter((r) => r.name === 'media-deleted');
		const orphanedFileName = getFileName(`${testServerBaseUrl}/assets/landscape2.jpg`);
		expect(
			deleted.some((r) => String(r.url).includes(orphanedFileName)),
			`a media-deleted report must reference the orphaned file ${orphanedFileName}`,
		).toBe(true);
		// events="media-deleted" filters everything else, including the phase-1 downloads
		expect(records.map((r) => r.name), 'media-download must be filtered out').not.toContain('media-download');
	});
});
