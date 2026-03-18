import { test, expect } from '@playwright/test';

const EMULATOR_URL = 'http://localhost:8090';
const SMIL_URL = 'http://localhost:3000/checkBeforePlayVideo.smil';
const TEST_SERVER = 'http://localhost:3000';

/**
 * Verify that the video re-prepare fix prevents infinite hangs when a looping
 * video's source file is updated multiple times via the checkBeforePlay mechanism.
 *
 * Bug scenario (before fix):
 *   1st update → needsRePrepare → prepare(versioned_v1) → pool=2 → OK
 *   2nd update → prepare(versioned_v2) → pool=3 → "no more video players" → HANG
 *
 * The fix:
 *   - Don't mutate params[0] → play/onceEnded use un-versioned URL
 *   - Stop stale player after play() → frees pool slot → next prepare succeeds
 *   - Track versioned URLs per region → enables correct cleanup chain
 *
 * Observable markers in the emulator (via @signageos/front-applet debug output):
 *   - "success e:onceEnded"        → video loop completed
 *   - "invoking e:prepare" + __smil_version → re-prepare with versioned URL
 *   - "invoking e:stop" after prepare → stale player cleanup
 *   - "no more available video players" → pool exhaustion (should NOT appear)
 */

/** Count occurrences of a substring in an array of strings */
function countMatching(messages: string[], pattern: string): number {
	return messages.filter((m) => m.includes(pattern)).length;
}

test('video re-prepare: no hang after multiple file updates in single-video loop', async ({ context, page }) => {
	// Enable all debug logging to observe front-applet video API calls
	await context.addInitScript(() => {
		localStorage.setItem('debug', '*');
	});
	await context.addInitScript(`window.__SMIL_URL__ = '${SMIL_URL}';`);

	// Collect console messages for verification
	const consoleMessages: string[] = [];
	page.on('console', (msg) => consoleMessages.push(msg.text()));

	// Phase 1: Reset server state and clear IndexedDB
	await page.request.post(`${TEST_SERVER}/cbp-video/reset`);

	await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });
	await page.evaluate(async () => {
		const dbs = await indexedDB.databases();
		for (const db of dbs) {
			if (db.name) indexedDB.deleteDatabase(db.name);
		}
	});

	// Reload for clean start
	await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });

	// Phase 2: Wait for video to start playing and complete at least 2 loops
	console.log('Waiting for video playback to stabilize (2 loops)...');
	await expect(async () => {
		const endedCount = countMatching(consoleMessages, 'success e:onceEnded');
		if (endedCount < 2) throw new Error(`onceEnded count: ${endedCount}, need >= 2`);
	}).toPass({ intervals: [1000], timeout: 45000 });

	const baselineEnded = countMatching(consoleMessages, 'success e:onceEnded');
	console.log(`Baseline: ${baselineEnded} video loops completed. Triggering 1st file update...`);

	// Phase 3: Trigger first file update
	const data1 = await (await page.request.post(`${TEST_SERVER}/cbp-video/switch`)).json();
	console.log(`Server version: ${data1.version}`);

	// Wait for the deferred re-prepare to fire (versioned prepare after onceEnded)
	await expect(async () => {
		const prepareCount = consoleMessages.filter(
			(m) => m.includes('invoking e:prepare') && m.includes('__smil_version'),
		).length;
		if (prepareCount < 1) throw new Error(`Versioned prepare count: ${prepareCount}, expected >= 1`);
	}).toPass({ intervals: [1000], timeout: 45000 });

	console.log('1st re-prepare detected. Verifying video continues...');

	// Verify play() uses un-versioned URL (params[0] not mutated)
	const playMsgs = consoleMessages.filter((m) => m.includes('invoking e:play'));
	const playWithVersion = playMsgs.filter((m) => m.includes('__smil_version'));
	expect(playWithVersion.length).toBe(0); // play() should NEVER use versioned URL

	// Verify stale player cleanup happened (stop after prepare+play)
	const stopCount = consoleMessages.filter((m) => m.includes('invoking e:stop')).length;
	expect(stopCount).toBeGreaterThanOrEqual(1);

	// THE KEY CHECK: Video continues playing after 1st update
	const endedAfter1stPrepare = countMatching(consoleMessages, 'success e:onceEnded');
	await expect(async () => {
		const current = countMatching(consoleMessages, 'success e:onceEnded');
		if (current <= endedAfter1stPrepare) {
			throw new Error(`Video may be hung — onceEnded count stuck at ${current}`);
		}
	}).toPass({ intervals: [1000], timeout: 20000 });

	console.log('Video continues after 1st update. Triggering 2nd file update...');

	// Phase 4: Trigger second file update — THIS IS THE CRITICAL TEST
	// Before the fix: pool exhaustion → prepare fails → params[0] mutated → HANG
	const data2 = await (await page.request.post(`${TEST_SERVER}/cbp-video/switch`)).json();
	console.log(`Server version: ${data2.version}`);

	// Wait for 2nd versioned prepare
	await expect(async () => {
		const prepareCount = consoleMessages.filter(
			(m) => m.includes('invoking e:prepare') && m.includes('__smil_version'),
		).length;
		if (prepareCount < 2) throw new Error(`Versioned prepare count: ${prepareCount}, expected >= 2`);
	}).toPass({ intervals: [1000], timeout: 45000 });

	console.log('2nd re-prepare detected. Verifying video is NOT hung...');

	// THE KEY ASSERTION: Video continues playing after 2nd update
	const endedAfter2ndPrepare = countMatching(consoleMessages, 'success e:onceEnded');
	await expect(async () => {
		const current = countMatching(consoleMessages, 'success e:onceEnded');
		if (current <= endedAfter2ndPrepare) {
			throw new Error(`VIDEO HUNG after 2nd update — onceEnded stuck at ${current}`);
		}
	}).toPass({ intervals: [1000], timeout: 20000 });

	console.log('Video continues after 2nd update — no hang!');

	// Phase 5: Verify expected behavior
	const totalPrepares = consoleMessages.filter(
		(m) => m.includes('invoking e:prepare') && m.includes('__smil_version'),
	).length;
	const totalStops = consoleMessages.filter((m) => m.includes('invoking e:stop')).length;
	const poolErrors = countMatching(consoleMessages, 'no more available video players');
	const totalEnded = countMatching(consoleMessages, 'success e:onceEnded');

	console.log('\n--- Summary ---');
	console.log(`Versioned prepares: ${totalPrepares}`);
	console.log(`Stale player stops: ${totalStops}`);
	console.log(`Total video loops: ${totalEnded}`);
	console.log(`Pool exhaustion errors: ${poolErrors}`);

	expect(totalPrepares).toBeGreaterThanOrEqual(2);
	expect(totalStops).toBeGreaterThanOrEqual(2);
	expect(poolErrors).toBe(0);
	// play() should never use a versioned URL (params[0] not mutated)
	const allPlayWithVersion = consoleMessages.filter(
		(m) => m.includes('invoking e:play') && m.includes('__smil_version'),
	);
	expect(allPlayWithVersion.length).toBe(0);
});

test('video re-prepare: pool stays bounded after 3 consecutive updates', async ({ context, page }) => {
	await context.addInitScript(() => {
		localStorage.setItem('debug', '*');
	});
	await context.addInitScript(`window.__SMIL_URL__ = '${SMIL_URL}';`);

	const consoleMessages: string[] = [];
	page.on('console', (msg) => consoleMessages.push(msg.text()));

	await page.request.post(`${TEST_SERVER}/cbp-video/reset`);

	await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });
	await page.evaluate(async () => {
		const dbs = await indexedDB.databases();
		for (const db of dbs) {
			if (db.name) indexedDB.deleteDatabase(db.name);
		}
	});
	await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });

	// Wait for stable playback
	await expect(async () => {
		if (countMatching(consoleMessages, 'success e:onceEnded') < 2) {
			throw new Error('Waiting for stable playback');
		}
	}).toPass({ intervals: [1000], timeout: 45000 });

	console.log('Playback stable. Running 3 consecutive updates...');

	// Trigger 3 updates, verifying playback continues after each
	for (let i = 1; i <= 3; i++) {
		const resp = await (await page.request.post(`${TEST_SERVER}/cbp-video/switch`)).json();
		console.log(`Update #${i}: server version ${resp.version}`);

		// Wait for versioned prepare
		await expect(async () => {
			const count = consoleMessages.filter(
				(m) => m.includes('invoking e:prepare') && m.includes('__smil_version'),
			).length;
			if (count < i) throw new Error(`Prepare count: ${count}, expected >= ${i}`);
		}).toPass({ intervals: [1000], timeout: 45000 });

		// Verify video continues (onceEnded fires)
		const currentEnded = countMatching(consoleMessages, 'success e:onceEnded');
		await expect(async () => {
			if (countMatching(consoleMessages, 'success e:onceEnded') <= currentEnded) {
				throw new Error(`Video may be hung after update #${i}`);
			}
		}).toPass({ intervals: [1000], timeout: 20000 });

		console.log(`  Update #${i} OK — video still playing.`);
	}

	// Final assertions
	const poolErrors = countMatching(consoleMessages, 'no more available video players');
	const allPlayWithVersion = consoleMessages.filter(
		(m) => m.includes('invoking e:play') && m.includes('__smil_version'),
	);

	console.log(`Pool errors: ${poolErrors}, play() with version: ${allPlayWithVersion.length}`);
	expect(poolErrors).toBe(0);
	expect(allPlayWithVersion.length).toBe(0);

	console.log('All 3 updates succeeded — pool stays bounded!');
});
