import { test, expect } from './fixtures';
import { DUID, Timeouts } from './config';

// ============================================================================
// Option-C behavioural guardrail for playMode="one" [5ab5829].
//
// Structure: outer <seq repeatCount="2"> wraps <seq playMode="one"> with 3
// nested child seqs. The SMIL player's own playlist loop (runEndlessLoop in
// playlistCommon.ts) restarts the whole playlist whenever the top par
// finishes, so visible-sequence assertions that depended on "img_3 never
// plays" are impossible — the cycle just restarts and eventually reaches
// img_3 in either regime. What *does* differ between regimes is the ratio of
// child plays per `processRandomPlayMode` activation:
//
//   - Correct: each activation of playMode="one" picks exactly one child,
//     so every "random play mode" log produces exactly one "finished playing
//     html element" log. Ratio → 1.
//   - Broken (pre-5ab5829): each activation returns the full child list
//     unchanged, so every "random play mode" log produces 3 "finished
//     playing html element" logs. Ratio → 3.
//
// Assert the ratio stays near 1. A regression to 3 is an immediate fail and
// cannot be hidden by the outer-repeat/playlist-loop wrapping that defeated
// the visible-sequence approach.
// ============================================================================

test.describe('playModeOneFiniteRepeat.smil test', () => {
	test('playMode="one" activates 1:1 with play completions (not 1:3) [5ab5829]', async ({
		page, context, smilUrls,
	}) => {
		const finishedHtmlLogs: string[] = [];
		const randomPlayModeLogs: string[] = [];
		page.on('console', (msg) => {
			const t = msg.text();
			if (/finished playing html element/.test(t)) finishedHtmlLogs.push(t);
			if (/processing random play mode/.test(t)) randomPlayModeLogs.push(t);
		});

		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
			// Non-sync tests run with Debug.disable(); we need processor +
			// traverser debug output for the log-ratio assertion below.
			(window as any).__SYNC_CONFIG__ = { debugEnabled: 'true' };
		}, smilUrls.playModeOneFiniteRepeat);
		await page.goto(`/?duid=${DUID}`);
		const frame = page.frameLocator('iframe');

		// Sanity: the first img_1 and img_2 actually render (proves the SMIL
		// loaded and the test is observing real playback).
		await expect(frame.locator('img[src*="img_1"]')).toBeVisible({ timeout: Timeouts.firstElement });
		await expect(frame.locator('img[src*="img_2"]')).toBeVisible({ timeout: Timeouts.elementAwait });

		// Let the playlist run long enough that several playMode activations
		// and play completions have accumulated. At dur="2s" per image this
		// comfortably covers multiple outer-seq iterations and at least one
		// playlist-loop restart in both regimes.
		await page.waitForTimeout(12_000);

		const activations = randomPlayModeLogs.length;
		const plays = finishedHtmlLogs.filter((l) => /img_/.test(l)).length;

		// Require a minimum sample to avoid a trivial 0/0 ratio passing.
		expect(activations, 'no `processing random play mode` log observed — debug output likely not enabled').toBeGreaterThanOrEqual(3);
		expect(plays, 'no `finished playing html element` log observed for the playMode children').toBeGreaterThanOrEqual(3);

		const ratio = plays / activations;
		// Correct regime: ~1.0. Broken regime: ~3.0 (all three children per
		// activation). 1.8 splits the two cleanly and leaves slack for
		// end-of-window boundaries where an activation happened but its
		// corresponding play hasn't completed yet.
		expect(
			ratio,
			`plays/activations ratio = ${ratio.toFixed(2)} (${plays} plays / ${activations} activations) — expected ~1 with correct playMode="one"; a ratio near 3 indicates playMode is a no-op and all children play per outer iteration`,
		).toBeLessThan(1.8);
	});
});
