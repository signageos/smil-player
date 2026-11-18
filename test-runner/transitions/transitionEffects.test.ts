import type { FrameLocator, Locator, Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { DUID, Timeouts, SmilUrlsMap } from '../config';
import { testCoordinates, waitForLoaderOrSkip } from '../helpers';
import { durationCandidates } from '../duration/durationCandidates';
import { VisibilityMonitor } from '../visibilityMonitor';

/** Every transition fixture renders its media fullscreen over the 1920x1080 root. */
const expectFullscreen = (locator: Locator) => testCoordinates(locator, 0, 0, 1920, 1080);

/**
 * Poll an outgoing element's inline animation until it carries the transition's
 * effect keyword. Transition animations are transient (some have no `forwards`
 * fill), so polling must start while the outgoing element is still showing,
 * rather than racing the effect after the incoming element appears.
 */
async function expectTransitionEffect(
	frame: FrameLocator,
	selector: string,
	cssProp: 'animation' | '-webkit-animation',
	keyword: string,
	timeout: number,
	message: string,
) {
	await expect
		.poll(
			async () =>
				frame
					.locator(selector)
					.first()
					.evaluate(
						(el: HTMLElement, prop: string) =>
							prop === 'animation' ? el.style.animation : el.style.getPropertyValue(prop),
						cssProp,
					)
					.catch(() => ''),
			{ timeout, message },
		)
		.toContain(keyword);
}

/**
 * The transition specs share one lifecycle skeleton — first element shows
 * fullscreen, the transition effect runs on the OUTGOING element as the second
 * appears, then the sequence loops back — and differ only in the effect asserted
 * per type. Each mode keeps its own effect + structure assertions; only the
 * boilerplate (URL injection, loader skip, monitor.watch) is shared.
 *   - crossfade: outgoing <img> gets `fadeOut` (transIn attribute on the media)
 *   - defaultTransition: same `fadeOut`, but sourced from <meta defaultTransition>
 *     on an <img> with NO transIn (playlistDataPrepare transitionId fallback)
 *   - billboard: media renders as an <ol> sliced into columns that run `rotate`
 */
type TransitionMode = {
	smilUrlKey: keyof SmilUrlsMap;
	durationKey: Parameters<typeof durationCandidates>[0];
	title: string;
	assert: (page: Page, frame: FrameLocator, monitor: VisibilityMonitor) => Promise<void>;
};

const MODES: TransitionMode[] = [
	{
		smilUrlKey: 'crossfadeTransition',
		durationKey: 'simpleCrossfade',
		title: 'crossfade actually fades the outgoing image (not a hard cut)',
		assert: async (_page, frame, monitor) => {
			const img1 = frame.locator('img[id*="landscape1"]');
			const img2 = frame.locator('img[id*="landscape2"]');

			await expect(img1).toBeVisible({ timeout: Timeouts.firstElement });
			await expectFullscreen(img1);

			// The cross-FADE must actually run: while landscape2 is already visible, the
			// OUTGOING landscape1 is still present and carries the fadeOut animation
			// (htmlTools setTransitionCss → `animation: fadeOut ...`). This overlap is
			// what distinguishes a crossfade from a hard cut — the previous
			// sequence-only test passed even with transitions disabled.
			await expect(img2).toBeVisible({ timeout: Timeouts.elementAwait });
			await expectTransitionEffect(
				frame, 'img[id*="landscape1"]', 'animation', 'fadeOut', 5_000,
				'outgoing img must carry the crossfade fadeOut animation while the incoming image is visible',
			);
			await expectFullscreen(img2);

			// Second image disappears, first image reappears (loop)
			await expect(img2).not.toBeVisible({ timeout: Timeouts.elementAwait });
			await expect(img1).toBeVisible({ timeout: Timeouts.elementAwait });
			await expectFullscreen(img1);

			await monitor.assertDurationsWithinTolerance();
		},
	},
	{
		smilUrlKey: 'defaultTransition',
		durationKey: 'defaultTransition',
		title: 'meta defaultTransition applies crossfade to media without transIn',
		assert: async (_page, frame, monitor) => {
			const img1 = frame.locator('img[id*="landscape1"]');
			const img2 = frame.locator('img[id*="landscape2"]');

			await expect(img1).toBeVisible({ timeout: Timeouts.firstElement });
			await expectFullscreen(img1);

			// The outgoing first image must carry the crossfade inline animation even
			// though its <img> has NO transIn — setTransitionCss only fires when
			// transitionInfo resolved, which for a transIn-less img requires
			// <meta defaultTransition> (see playlistDataPrepare.ts transitionId fallback).
			await expect(img2).toBeVisible({ timeout: Timeouts.elementAwait });
			await expectTransitionEffect(
				frame, 'img[id*="landscape1"]', 'animation', 'fadeOut', 5_000,
				'outgoing img must get the fadeOut animation from defaultTransition',
			);

			// Sequence continues: first image hides, second shows fullscreen, loop back
			await expect(img1).not.toBeVisible({ timeout: Timeouts.elementAwait });
			await expectFullscreen(img2);
			await expect(img1).toBeVisible({ timeout: Timeouts.elementAwait });
			// Let landscape2 finish its fade-out before asserting durations, so the
			// monitor deterministically closes its visibility cycle (otherwise the
			// trailing open-ended cycle is excluded and n=0 races the poll).
			await expect(img2).not.toBeVisible({ timeout: Timeouts.elementAwait });

			await monitor.assertDurationsWithinTolerance();
		},
	},
	{
		smilUrlKey: 'billboardTransition',
		durationKey: 'simpleBillboard',
		title: 'billboard slices the image into columns and runs the rotate effect',
		assert: async (_page, frame, monitor) => {
			const ol1 = frame.locator('ol[id*="landscape1"]');
			const ol2 = frame.locator('ol[id*="landscape2"]');

			// First image appears, rendered as an <ol> billboard (not a plain <img>).
			await expect(ol1).toBeVisible({ timeout: Timeouts.firstElement });
			await expectFullscreen(ol1);

			// Structure: the image is sliced into columnCount=50 <li> columns, each a <div>
			// carrying a slice of the source image as its background. The old test only
			// checked the <ol> existed — it passed even with the column build broken.
			await expect(frame.locator('ol[id*="landscape1"] > li')).toHaveCount(50);
			const firstColumnBg = await frame
				.locator('ol[id*="landscape1"] > li > div')
				.first()
				.evaluate((d: HTMLElement) => d.style.backgroundImage);
			expect(firstColumnBg, 'each column div must carry a slice of the source image').toContain('landscape1');

			// Effect: when landscape1 transitions out (at the end of its dur), its column divs
			// run the `rotate` animation (htmlTools setTransitionCss billboard branch). That
			// animation is transient (~1.5s, no `forwards` fill, unlike crossfade's fadeOut), so
			// poll from now — while landscape1 is still showing — across its full dur.
			await expectTransitionEffect(
				frame, 'ol[id*="landscape1"] > li > div', '-webkit-animation', 'rotate', 12_000,
				'outgoing billboard columns must run the rotate animation',
			);

			// landscape2 is now showing.
			await expect(ol2).toBeVisible({ timeout: Timeouts.elementAwait });
			await expectFullscreen(ol2);

			// Second image disappears, first image reappears (loop)
			await expect(ol2).not.toBeVisible({ timeout: Timeouts.elementAwait });
			await expect(ol1).toBeVisible({ timeout: Timeouts.elementAwait });
			await expectFullscreen(ol1);

			await monitor.assertDurationsWithinTolerance();
		},
	},
];

test.describe('transition effects (crossfade/default/billboard)', () => {
	for (const mode of MODES) {
		test(mode.title, async ({ page, context, smilUrls, monitor }) => {
			await context.addInitScript((url: string) => {
				(window as unknown as { __SMIL_URL__?: string }).__SMIL_URL__ = url;
			}, smilUrls[mode.smilUrlKey]);

			await page.goto(`/?duid=${DUID}`);
			const frame = page.frameLocator('iframe');
			monitor.watch(durationCandidates(mode.durationKey));

			// Loader may be skipped entirely: these fixtures prefetch only 2 small
			// jpgs, so prefetch can finish before the intro video mounts.
			await waitForLoaderOrSkip(page);

			await mode.assert(page, frame, monitor);
		});
	}

	// Each campaign of a priorityClass is its own wallclock <seq>, so the incoming image is a
	// priority peer of the playing one. It must still sit underneath the outgoing image while
	// that one animates; otherwise the columns flip over an empty (black) region and the next
	// image hard-cuts in afterwards. Only the DOM overlap shows this — durations stay correct.
	test('billboard reveals the next image across campaigns of one priorityClass', async ({ page, context, smilUrls }) => {
		await context.addInitScript((url: string) => {
			(window as unknown as { __SMIL_URL__?: string }).__SMIL_URL__ = url;
		}, smilUrls.billboardPriorityTransition);

		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');
		await waitForLoaderOrSkip(page);
		await expect(frame.locator('ol[id*="landscape1"]')).toBeVisible({ timeout: Timeouts.firstElement });

		// Both directions: the second handover re-uses state left by the first loop pass.
		for (const [outgoing, incoming] of [['landscape1', 'landscape2'], ['landscape2', 'landscape1']]) {
			await expect
				.poll(
					async () =>
						frame
							.locator('body')
							.evaluate((_body, [out, inc]) => {
								const outgoingOl = document.querySelector<HTMLElement>(`ol[id*="${out}"]`);
								const incomingOl = document.querySelector<HTMLElement>(`ol[id*="${inc}"]`);
								const column = outgoingOl?.querySelector<HTMLElement>('li > div');
								return (
									!!column?.style.getPropertyValue('-webkit-animation').includes('rotate') &&
									incomingOl?.style.visibility === 'visible' &&
									!!incomingOl.querySelector<HTMLElement>('li > div')?.style.backgroundImage &&
									Number(incomingOl.style.zIndex) === Number(outgoingOl!.style.zIndex) - 1
								);
							}, [outgoing, incoming])
							.catch(() => false),
					{
						timeout: 12_000,
						intervals: [50],
						message: `${incoming} must be visible right under ${outgoing} while its columns rotate`,
					},
				)
				.toBe(true);
		}
	});
});
