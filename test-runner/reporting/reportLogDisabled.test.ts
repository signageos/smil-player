import { test, expect } from '../fixtures';
import { DUID, Timeouts } from '../config';
import { waitForLoaderOrSkip } from '../helpers';

// log="false" must be a real off switch for custom-endpoint reporting (filed
// bug #7: the custom-endpoint transport used to ignore the enabled flag and
// POST anyway whenever type="manual" + endpoint were set). Playback itself is
// asserted as the positive control that the playlist actually ran.
test.describe('reportLogDisabled.smil test', () => {
	test('sends no custom-endpoint reports when log="false"', async ({
		page,
		context,
		request,
		smilUrls,
		testServerBaseUrl,
	}) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.reportLogDisabled);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		await waitForLoaderOrSkip(page);

		// Positive control: a full playback cycle happens (video -> image -> video),
		// which without the fix would have produced download + playback reports.
		await expect(page.locator('video[src*="landscape1"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await expect(frame.locator('img[src*="landscape1"]')).toBeVisible({ timeout: 15_000 + Timeouts.elementAwait });
		await expect(page.locator('video[src*="landscape1"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		const response = await request.get(`${testServerBaseUrl}/report/history`);
		const reports = await response.json();
		expect(reports.length, 'no report POST may reach the endpoint with log="false"').toBe(0);
	});
});
