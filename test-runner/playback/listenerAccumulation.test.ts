import { test, expect } from '../fixtures';
import { DUID, Timeouts } from '../config';

/**
 * E2e regression guard for roadmap Task 4A — the DOM event-listener leak
 * in PlaylistTriggers. Before the fix, every SMIL reload re-ran
 * `watchTriggers()` and stacked 9 fresh DOM handlers on top of the old
 * ones (no `removeEventListener` anywhere in the repo). After the fix,
 * `ListenerScope.removeAll()` at the top of `watchTriggers` detaches the
 * prior set before the new one is registered.
 *
 * Test shape: instrument `EventTarget.prototype.addEventListener` /
 * `removeEventListener` so we can count globally, load the trigger-aware
 * fixture via the `/dynamic-update/:fileName` endpoint (which fires
 * exactly one reload via a varying-then-stable Last-Modified), then
 * compare active-listener counts before vs. after the reload.
 *
 * Pre-fix: active count grows by ≥9 per reload and `removed` stays at 0.
 * Post-fix: active count is ~flat and `removed` grows by ≥9.
 */
test.describe('DOM listener accumulation across SMIL reloads', () => {
	test('watchTriggers does not leak listeners after a SMIL reload', async ({ page, context, smilUrls }) => {
		// Instrumentation MUST land before any app code — addInitScript runs
		// before <script> tags in the page, which is exactly what we need.
		//
		// We filter by event type: the audit's leak is scoped to the 9 DOM
		// handlers PlaylistTriggers attaches, which all use one of
		// `sosEvent` / `click` / `touchend` / `keydown`. Counting every
		// addEventListener call across the emulator would drown the signal
		// in unrelated <video> / <img> / resize listeners (empirically
		// ~170 net adds per processingLoop iteration for this fixture).
		//
		// Caveat observed empirically: some of the emulator's own setup
		// code re-patches `EventTarget.prototype.addEventListener` after
		// this init script runs, so a subset of later calls (including
		// some from PlaylistTriggers itself) go through a path that this
		// patch does not see. The test therefore does NOT rely on hitting
		// an exact "9 added" count — instead, the load-bearing signal is
		// that `removedDelta > 0` after a reload: the fix calls
		// `removeEventListener` inside `ListenerScope.removeAll`, and even
		// the subset this patch catches is enough to flip from 0 to > 0
		// relative to the regression baseline.
		await context.addInitScript(() => {
			const TRIGGER_TYPES = new Set(['sosEvent', 'click', 'touchend', 'keydown']);
			const state = { added: 0, removed: 0 };
			(window as any).__listenerStats = () => ({ ...state });
			const origAdd = EventTarget.prototype.addEventListener;
			const origRemove = EventTarget.prototype.removeEventListener;
			EventTarget.prototype.addEventListener = function (
				this: EventTarget,
				type: string,
				...rest: unknown[]
			) {
				if (TRIGGER_TYPES.has(type)) state.added++;
				return origAdd.apply(this, [type, ...rest] as Parameters<typeof origAdd>);
			};
			EventTarget.prototype.removeEventListener = function (
				this: EventTarget,
				type: string,
				...rest: unknown[]
			) {
				if (TRIGGER_TYPES.has(type)) state.removed++;
				return origRemove.apply(this, [type, ...rest] as Parameters<typeof origRemove>);
			};
		});

		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.triggersLeakProbe);

		// Track GET requests to the SMIL endpoint — reaching a second GET
		// means the Phase-1→Phase-2 reload has happened and `processingLoop`
		// (which owns the `watchTriggers` call) has been re-entered once.
		let smilGetCount = 0;
		page.on('response', (resp) => {
			if (resp.request().method() !== 'GET') return;
			if (!resp.url().includes('/dynamic-update/triggersLeakProbe.smil')) return;
			smilGetCount++;
		});

		await page.goto(`/?duid=${DUID}`);

		// Wait for the fixture's looping image to appear in the applet iframe.
		// By the time it's visible, the first `watchTriggers()` has completed
		// and the keyboard / click / touchstart / sosEvent listeners are all
		// attached to document / window / window.parent.document. Use a
		// `src*=` match (existing e2e convention) rather than `id*=` — the
		// player does not always propagate the SMIL element id verbatim.
		const probeImg = page.frameLocator('iframe').locator('img[src*="img_2"]').first();
		await expect(probeImg).toBeVisible({ timeout: Timeouts.firstElement });

		// Let any trailing setup work settle before snapshotting.
		await page.waitForTimeout(2_000);
		const before = await page.evaluate(() => (window as any).__listenerStats());

		// Poll for the second GET — that's the reload the Refresh="5" meta
		// + varying Last-Modified forces exactly once. Generous timeout to
		// absorb 5 s refresh interval + HEAD + fetch + restart + processingLoop
		// re-entry on slow CI.
		await expect.poll(() => smilGetCount, { timeout: 45_000, intervals: [1_000] }).toBeGreaterThanOrEqual(2);

		// The second GET is a necessary-but-not-sufficient signal: processingLoop
		// awaits several setup steps before reaching `watchTriggers`. Pad a few
		// seconds so the second invocation has definitely run its full sync
		// path (watchKeyboardInput → watchOnTouchOnClick → watchWidgetTriggers)
		// before we measure.
		await page.waitForTimeout(4_000);
		const after = await page.evaluate(() => (window as any).__listenerStats());

		const addedDelta = after.added - before.added;
		const removedDelta = after.removed - before.removed;
		const activeDelta = addedDelta - removedDelta;

		// eslint-disable-next-line no-console
		console.log(
			`[listener-accumulation] before=${JSON.stringify(before)} after=${JSON.stringify(after)} `
			+ `addedΔ=${addedDelta} removedΔ=${removedDelta} activeΔ=${activeDelta}`,
		);

		// Primary discriminator — verified via TDD-RED: with the fix reverted
		// this value is 0 (no removeEventListener is ever called by trigger
		// code), with the fix it is > 0 (ListenerScope.removeAll fires once
		// per watchTriggers re-invocation). One reload => at least one
		// observable remove.
		expect(removedDelta).toBeGreaterThan(0);

		// Secondary bound on net growth of trigger-event-type listeners.
		// With fix, adds and removes cancel → ≈ 0. Without fix, adds grow
		// without compensating removes → ≥ 3 on this fixture. Ceiling of 2
		// catches the regression with headroom for emulator churn on the
		// same event names.
		expect(activeDelta).toBeLessThanOrEqual(2);
	});
});
