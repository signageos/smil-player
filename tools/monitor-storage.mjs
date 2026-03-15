#!/usr/bin/env node

/**
 * Storage Eviction Monitor — matches production testing.smil scenario
 *
 * Simulates: 20 video slots, 10 active (with Location-based updates),
 * 10 returning 404 (skipped). Active slots 1-7 alternate between two
 * campaign variants (a↔b) every 110s. Slots 8-10 are stable (always "a").
 *
 * Location URLs include random UUID query params (simulates production CDN).
 * The fix keys storageInfo by base URL (no query params) and skips
 * re-preservation if already stored.
 *
 * Expected storage lifecycle:
 *   Cycle 0: Download 10 videos (a-variants)         → storage: 0
 *   Cycle 1: Preserve 7 a-variants, download b       → storage: 7
 *   Cycle 2: Preserve 7 b-variants, restore a        → storage: 14
 *   Cycle 3+: Early-return (already stored), restore  → storage: 14 (stable)
 *
 * Usage:
 *   node tools/monitor-storage.mjs [--wait=500]
 *
 * Prerequisites:
 *   - Dev server running: npm start (port 8090)
 */

import { chromium } from '@playwright/test';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
	options: {
		wait: { type: 'string', default: '500' },
	},
});

const totalWait = parseInt(args.wait, 10);
const TEST_PORT = 3001;
const REFRESH_INTERVAL = 110; // seconds between SMIL refreshes (matches production testing.smil)
const EMULATOR_URL = 'http://localhost:8090?duid=storagetest_' + Date.now();
const SCREEN_ID = 'test-screen-001';
const NUM_TOTAL = 20;
const NUM_ACTIVE = 10; // IDs 1-10 return 200, IDs 11-20 return 404
const NUM_ALTERNATING = 7; // IDs 1-7 alternate a↔b, IDs 8-10 always "a"

// Small binary payload — doesn't need to be playable video,
// emulator's sos.fileSystem.downloadFile stores raw bytes
const FAKE_VIDEO = Buffer.alloc(1024, 0x42);

// --- Time-based campaign variant ---
const serverStartTime = Date.now();
let smilHeadCount = 0;
let smilGetCount = 0;

function getCurrentCycle() {
	return Math.floor((Date.now() - serverStartTime) / (REFRESH_INTERVAL * 1000));
}

function getCurrentVariant() {
	return getCurrentCycle() % 2 === 0 ? 'a' : 'b';
}

// SMIL with 20 video elements — identical structure to testing.smil
const SMIL = `<smil>
    <head>
        <layout>
            <root-layout width="1080" height="1920" backgroundColor="#FFFFFF"></root-layout>
            <region regionName="fullscreen" left="0" top="0" width="1080" height="1920" z-index="1" backgroundColor="#000000"></region>
        </layout>
        <meta http-equiv="Refresh" content="${REFRESH_INTERVAL}" timeOut="5000" onlySmilUpdate="false" skipContentOnHttpStatus="404" updateMechanism="location"></meta>
    </head>
    <body>
        <seq>
${Array.from({ length: NUM_TOTAL }, (_, i) => `            <video src="http://localhost:${TEST_PORT}/content?screen=${SCREEN_ID}&amp;id=${i + 1}" region="fullscreen"></video>`).join('\n')}
        </seq>
    </body>
</smil>`;

const server = http.createServer((req, res) => {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', '*');
	res.setHeader('Access-Control-Expose-Headers', 'Location, Last-Modified, Content-Length');
	res.setHeader('Cache-Control', 'no-cache, no-store');

	if (req.method === 'OPTIONS') {
		res.writeHead(204);
		res.end();
		return;
	}

	const url = new URL(req.url, `http://localhost:${TEST_PORT}`);

	// --- SMIL file ---
	if (url.pathname === '/test-storage.smil') {
		if (req.method === 'HEAD') {
			smilHeadCount++;
			res.writeHead(200, {
				'Content-Type': 'text/xml',
				'Last-Modified': new Date().toUTCString(),
				'Content-Length': String(Buffer.byteLength(SMIL)),
			});
			res.end();
		} else {
			smilGetCount++;
			const variant = getCurrentVariant();
			console.error(`  [server] SMIL GET #${smilGetCount} (cycle: ${getCurrentCycle()}, variant: ${variant})`);
			res.writeHead(200, {
				'Content-Type': 'text/xml',
				'Last-Modified': new Date().toUTCString(),
			});
			res.end(SMIL);
		}
		return;
	}

	// --- Content HEAD: location strategy ---
	// IDs 1-10: return 200 + Location header pointing to campaign-specific URL with UUID
	// IDs 11-20: return 404 → player sets media.expr = skipContent
	if (url.pathname === '/content' && req.method === 'HEAD') {
		const id = parseInt(url.searchParams.get('id'), 10);
		if (!id || id < 1 || id > NUM_TOTAL) {
			res.writeHead(404);
			res.end();
			return;
		}

		if (id > NUM_ACTIVE) {
			// IDs 11-20: 404
			res.writeHead(404);
			res.end();
			return;
		}

		// IDs 1-10: 200 with Location
		const uuid = randomUUID();
		let variant;
		if (id <= NUM_ALTERNATING) {
			variant = getCurrentVariant(); // IDs 1-7: alternate a↔b
		} else {
			variant = 'a'; // IDs 8-10: always "a" (stable)
		}
		const locationUrl = `http://localhost:${TEST_PORT}/actual/vid${id}_${variant}.mp4?uuid=${uuid}`;
		res.writeHead(200, {
			'Content-Type': 'video/mp4',
			'Content-Length': String(FAKE_VIDEO.length),
			Location: locationUrl,
		});
		res.end();
		return;
	}

	// --- Content GET (for initial download from src URL) ---
	if (url.pathname === '/content' && req.method === 'GET') {
		const id = parseInt(url.searchParams.get('id'), 10);
		if (!id || id > NUM_ACTIVE) {
			res.writeHead(404);
			res.end();
			return;
		}
		res.writeHead(200, { 'Content-Type': 'video/mp4' });
		res.end(FAKE_VIDEO);
		return;
	}

	// --- Actual video file GET (from Location URL) ---
	if (url.pathname.startsWith('/actual/')) {
		res.writeHead(200, {
			'Content-Type': 'video/mp4',
			'Content-Length': String(FAKE_VIDEO.length),
		});
		res.end(FAKE_VIDEO);
		return;
	}

	res.writeHead(404);
	res.end('Not found');
});

// --- Storage message tracking ---
const storageLog = [];
let totalConsoleMessages = 0;

function trackMessage(text) {
	totalConsoleMessages++;
	const lc = text.toLowerCase();
	if (
		lc.includes('storage') ||
		lc.includes('preserv') ||
		lc.includes('evict') ||
		lc.includes('restor') ||
		lc.includes('dedup') ||
		lc.includes('new file version') ||
		lc.includes('skipping preservation') ||
		lc.includes('already in storage')
	) {
		const ts = new Date().toISOString().substring(11, 19);
		storageLog.push({ ts, text: text.substring(0, 300) });
	}
}

// --- Main ---
async function main() {
	await new Promise((resolve) => server.listen(TEST_PORT, resolve));
	console.error(`Test server on port ${TEST_PORT}`);
	console.error(
		`Monitoring for ${totalWait}s (expecting ${Math.floor(totalWait / REFRESH_INTERVAL)}+ refresh cycles)`,
	);
	console.error(`Videos 1-${NUM_ALTERNATING}: alternate a↔b, ${NUM_ALTERNATING + 1}-${NUM_ACTIVE}: stable, ${NUM_ACTIVE + 1}-${NUM_TOTAL}: 404\n`);

	let browser;
	try {
		browser = await chromium.launch({ headless: true });
		const context = await browser.newContext({
			viewport: { width: 1080, height: 1920 },
			ignoreHTTPSErrors: true,
		});

		await context.addInitScript(
			`window.__SMIL_URL__ = 'http://localhost:${TEST_PORT}/test-storage.smil';`,
		);

		const page = await context.newPage();
		page.on('console', (msg) => trackMessage(msg.text()));
		page.on('frameattached', (frame) => {
			try {
				frame.on('console', (msg) => trackMessage(msg.text()));
			} catch (_e) {
				// frame may detach
			}
		});

		console.error('Launching emulator...');
		await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });

		const startTime = Date.now();
		const progressInterval = setInterval(() => {
			const elapsed = Math.round((Date.now() - startTime) / 1000);
			const cycle = getCurrentCycle();
			process.stderr.write(
				`\r  [${elapsed}s/${totalWait}s] cycle: ${cycle} variant: ${getCurrentVariant()} SMIL HEAD: ${smilHeadCount} GET: ${smilGetCount} storage msgs: ${storageLog.length} console: ${totalConsoleMessages}   `,
			);
		}, 5000);

		await new Promise((r) => setTimeout(r, totalWait * 1000));
		clearInterval(progressInterval);
		process.stderr.write('\n\n');

		await browser.close();
	} catch (err) {
		console.error('Error:', err.message);
		if (browser) await browser.close();
	} finally {
		server.close();
	}

	// --- Report ---
	const evictions = storageLog.filter((m) => m.text.includes('Deleted oldest storage file'));
	const earlyReturns = storageLog.filter((m) => m.text.includes('Content already in storage'));
	const preservations = storageLog.filter((m) => m.text.includes('Successfully preserved'));
	const restores = storageLog.filter(
		(m) => m.text.includes('restored from storage') || m.text.includes('Restored from storage'),
	);
	const spaceOK = storageLog.filter((m) => m.text.includes('Storage space OK'));
	const newVersions = storageLog.filter((m) => m.text.includes('New file version'));
	const skipped404 = storageLog.filter((m) => m.text.includes('skipContent'));

	console.log('\n=== STORAGE MONITOR RESULTS ===');
	console.log(`Duration:             ${totalWait}s`);
	console.log(`SMIL HEAD requests:   ${smilHeadCount}`);
	console.log(`SMIL GET requests:    ${smilGetCount}`);
	console.log(`Total console msgs:   ${totalConsoleMessages}`);
	console.log(`Storage-related msgs: ${storageLog.length}`);
	console.log('');
	console.log(`New version detects:      ${newVersions.length}`);
	console.log(`Evictions (WANT 0):       ${evictions.length}`);
	console.log(`Early returns (WANT >0):  ${earlyReturns.length}`);
	console.log(`Preservations:            ${preservations.length}`);
	console.log(`Restores:                 ${restores.length}`);
	console.log(`Storage OK checks:        ${spaceOK.length}`);

	const pass = evictions.length === 0;
	console.log('');
	console.log(pass ? 'PASS: No evictions' : 'FAIL: Unexpected evictions detected');

	if (earlyReturns.length > 0) {
		console.log('PASS: Early returns detected (fix working)');
	} else {
		console.log('NOTE: No early returns seen (may need more refresh cycles)');
	}

	// Print all storage messages
	if (storageLog.length > 0) {
		console.log('\n--- All storage messages ---');
		for (const msg of storageLog) {
			console.log(`[${msg.ts}] ${msg.text}`);
		}
	}
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
