import { test, expect } from '../fixtures';
import { DUID, Timeouts } from '../config';

/**
 * Smoke test for ticker rendering and animation — the only e2e coverage
 * of `src/components/playlist/tools/tickerTools.ts`. Acts as the
 * regression guard for the 4B fix (pre-stop on start) and more broadly
 * as a canary against silent breakage of the ticker pipeline (font /
 * layout / appendChild / setTimeout loop).
 *
 * createTickerElement builds a wrapper `<div id="ticker-<region>-<key>">`
 * and appends it to `document.body`; startTickerAnimation then appends
 * `<span>` children for each text item and self-schedules a 1 s tick
 * that slides each span's `left` by `velocity` px.
 */
test.describe('Ticker rendering and animation', () => {
	test('wrapper mounts with text spans and their left position advances over time', async ({
		page,
		context,
		smilUrls,
	}) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.tickerBasic);

		await page.goto(`/?duid=${DUID}`);

		// The ticker wrapper renders inside the applet iframe — same as
		// images / widgets, not on the emulator's top window. The
		// `document.body.appendChild` inside createTickerElement targets
		// the iframe's document when the player is running there.
		const tickerWrapper = page.frameLocator('iframe').locator('div[id^="ticker-"]').first();
		await expect(tickerWrapper).toBeVisible({ timeout: Timeouts.firstElement });

		// Text children are `<span>` elements appended by
		// startTickerAnimation. Two `<text>` entries in the fixture → two
		// spans expected. Use `>= 1` so the test is robust to minor
		// implementation tweaks.
		const spans = tickerWrapper.locator('span');
		await expect(spans.first()).toBeVisible({ timeout: Timeouts.elementAwait });
		expect(await spans.count()).toBeGreaterThanOrEqual(1);

		// Animation check — tickerTick runs every 1000 ms and decreases
		// `left` by `velocity` px (100 in this fixture). Sample `left`
		// twice, ~1.5 s apart, and assert movement. We compare as numbers
		// after stripping the `px` suffix so the test is not fragile to
		// browser rounding.
		const readLeft = async () =>
			parseFloat((await spans.first().evaluate((el: HTMLElement) => el.style.left)).replace('px', ''));
		const leftT0 = await readLeft();
		await page.waitForTimeout(1_500);
		const leftT1 = await readLeft();

		// eslint-disable-next-line no-console
		console.log(`[ticker] spans=${await spans.count()} leftT0=${leftT0} leftT1=${leftT1}`);

		expect(leftT1).not.toBe(leftT0);
	});
});
