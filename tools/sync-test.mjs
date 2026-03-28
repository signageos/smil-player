#!/usr/bin/env node
/**
 * Multi-device sync test script.
 *
 * Launches N browser contexts (each representing a separate device) with
 * coordinated sync configuration, captures per-device state, and analyzes
 * synchronization quality.
 *
 * Usage:
 *   node tools/sync-test.mjs \
 *     --smil-url=http://localhost:3000/syncFiles/wallclockSync.smil \
 *     --devices=2 \
 *     --sync-group=test-group \
 *     --sync-server=http://sync-server:port \
 *     [--wait=60] \
 *     [--snapshot-interval=10] \
 *     [--output=/tmp/sync-results] \
 *     [--emulator=http://localhost:8090] \
 *     [--viewport=1080x1920] \
 *     [--debug]
 */

import { chromium } from 'playwright';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

// --- Argument parsing ---
function parseArgs(argv) {
	const args = {
		smilUrl: null,
		devices: 2,
		syncGroup: null,
		syncServer: null,
		wait: 60,
		snapshotInterval: 10,
		output: '/tmp/sync-results',
		emulator: 'http://localhost:8090',
		viewport: '1080x1920',
		debug: false,
	};

	for (const arg of argv.slice(2)) {
		if (arg === '--debug') {
			args.debug = true;
			continue;
		}
		const match = arg.match(/^--(\w[\w-]*)=(.+)$/);
		if (match) {
			const key = match[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
			args[key] = match[2];
		}
	}

	if (!args.smilUrl || !args.syncGroup || !args.syncServer) {
		console.error('Usage: node tools/sync-test.mjs --smil-url=<URL> --sync-group=<name> --sync-server=<http://...> [options]');
		console.error('  --devices=<N>              Number of devices (default: 2)');
		console.error('  --wait=<seconds>           Total observation time (default: 60)');
		console.error('  --snapshot-interval=<s>    Screenshot interval (default: 10)');
		console.error('  --output=<dir>             Output directory (default: /tmp/sync-results)');
		console.error('  --emulator=<url>           Emulator URL (default: http://localhost:8090)');
		console.error('  --viewport=<WxH>           Viewport (default: 1080x1920)');
		console.error('  --debug                    Enable SMIL player debug logs');
		process.exit(1);
	}

	args.devices = parseInt(args.devices, 10);
	args.wait = parseInt(args.wait, 10);
	args.snapshotInterval = parseInt(args.snapshotInterval, 10);
	return args;
}

// --- DOM state capture (same as verify-smil.mjs) ---
async function captureDeviceState(page) {
	const videos = await page.evaluate(() => {
		return [...document.querySelectorAll('video')].map((v) => ({
			src: v.src ? v.src.split('/').pop() : null,
			visible: v.offsetWidth > 0 && v.offsetHeight > 0,
			currentTime: v.currentTime || 0,
			paused: v.paused,
		}));
	});

	let images = [];
	let iframes = [];
	for (const frame of page.frames()) {
		const url = frame.url();
		if (!url.includes(':8091') && !url.includes('/applet')) continue;
		try {
			const frameImages = await frame.evaluate(() =>
				[...document.querySelectorAll('img')].map((img) => ({
					src: img.src ? img.src.split('/').pop() : null,
					visible: img.offsetWidth > 0 && img.offsetHeight > 0,
				})),
			);
			images.push(...frameImages);

			const frameIframes = await frame.evaluate(() =>
				[...document.querySelectorAll('iframe')].map((f) => ({
					src: f.src ? f.src.split('/').pop() : null,
					visible: f.offsetWidth > 0 && f.offsetHeight > 0,
				})),
			);
			iframes.push(...frameIframes);
		} catch (_e) {}
	}

	return {
		videos: videos.filter((v) => v.visible),
		images: images.filter((i) => i.visible),
		iframes: iframes.filter((f) => f.visible),
	};
}

// --- Console analysis ---
function analyzeSyncMessages(messages) {
	const counts = {
		cmdPrepare: 0,
		cmdPlay: 0,
		cmdFinish: 0,
		ackPrepared: 0,
		ackPlaying: 0,
		ackFinished: 0,
		signalReady: 0,
		isMaster: 0,
		syncConnected: 0,
		syncGroupJoined: 0,
	};

	for (const msg of messages) {
		const text = msg.text;
		if (text.includes('cmd-prepare')) counts.cmdPrepare++;
		if (text.includes('cmd-play')) counts.cmdPlay++;
		if (text.includes('cmd-finish')) counts.cmdFinish++;
		if (text.includes('ack-prepared')) counts.ackPrepared++;
		if (text.includes('ack-playing')) counts.ackPlaying++;
		if (text.includes('ack-finished')) counts.ackFinished++;
		if (text.includes('signal-ready')) counts.signalReady++;
		if (text.includes('isMaster')) counts.isMaster++;
		if (text.includes('Connecting to sync') || text.includes('sync server')) counts.syncConnected++;
		if (text.includes('sync group') || text.includes('joinGroup')) counts.syncGroupJoined++;
	}
	return counts;
}

function detectRole(messages) {
	// Master sends commands, slave sends acks
	for (const msg of messages) {
		if (msg.text.includes('isMaster') && msg.text.includes('true')) return 'master';
		if (msg.text.includes('isMaster') && msg.text.includes('false')) return 'slave';
	}
	return 'unknown';
}

function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

// --- Main ---
async function main() {
	const args = parseArgs(process.argv);
	const [vw, vh] = args.viewport.split('x').map(Number);

	console.log(`Sync Test: ${args.smilUrl}`);
	console.log(`  Devices: ${args.devices}`);
	console.log(`  Sync group: ${args.syncGroup}`);
	console.log(`  Sync server: ${args.syncServer}`);
	console.log(`  Wait: ${args.wait}s (snapshots every ${args.snapshotInterval}s)`);

	// Create output directory
	if (!existsSync(args.output)) {
		await mkdir(args.output, { recursive: true });
	}

	const browser = await chromium.launch({ headless: true });
	const devices = [];

	// --- Create N device contexts ---
	for (let i = 0; i < args.devices; i++) {
		const context = await browser.newContext({
			viewport: { width: vw, height: vh },
			bypassCSP: true,
		});
		const page = await context.newPage();

		const duid = `sync-test-device-${i}-${Date.now()}`;
		const deviceId = `device-${i}`;

		const syncConfig = {
			syncGroupName: args.syncGroup,
			syncDeviceId: deviceId,
			syncServerUrl: args.syncServer,
		};

		// Optionally enable debug logging
		if (args.debug) {
			syncConfig.debugEnabled = 'true';
		}

		await context.addInitScript(
			(cfg) => {
				window.__SMIL_URL__ = cfg.smilUrl;
				window.__SYNC_CONFIG__ = cfg.syncConfig;
			},
			{ smilUrl: args.smilUrl, syncConfig },
		);

		// Console collection per device
		const messages = [];
		const errors = [];
		page.on('console', (msg) => {
			const entry = { time: Date.now(), level: msg.type(), text: msg.text() };
			messages.push(entry);
			if (msg.type() === 'error') errors.push(msg.text());
			// Print sync-related messages in real-time
			if (
				args.debug &&
				(msg.text().includes('sync') ||
					msg.text().includes('cmd-') ||
					msg.text().includes('ack-') ||
					msg.text().includes('signal-') ||
					msg.text().includes('Master') ||
					msg.text().includes('isMaster'))
			) {
				console.log(`  [dev-${i}] ${msg.text().substring(0, 150)}`);
			}
		});
		page.on('pageerror', (err) => errors.push(err.message));

		devices.push({ context, page, duid, deviceId, messages, errors });
	}

	// --- Staggered navigation (device 0 first = becomes master) ---
	console.log(`\nStarting device 0 (will become master)...`);
	await devices[0].page.goto(`${args.emulator}/?duid=${devices[0].duid}`);
	await sleep(3000); // Give master time to connect to sync server

	for (let i = 1; i < devices.length; i++) {
		console.log(`Starting device ${i} (slave)...`);
		await devices[i].page.goto(`${args.emulator}/?duid=${devices[i].duid}`);
		await sleep(1000);
	}

	// --- Wait and take periodic snapshots ---
	console.log(`\nObserving for ${args.wait}s...`);
	const startTime = Date.now();

	for (let t = 0; t < args.wait; t += args.snapshotInterval) {
		const elapsed = Math.min(args.snapshotInterval, args.wait - t);
		await sleep(elapsed * 1000);

		const timeLabel = `t${t + elapsed}`;
		for (let i = 0; i < devices.length; i++) {
			try {
				await devices[i].page.screenshot({
					path: `${args.output}/device-${i}-${timeLabel}.png`,
				});
			} catch (e) {
				console.log(`  [WARN] Screenshot failed for device ${i} at ${timeLabel}: ${e.message}`);
			}
		}
		console.log(`  Snapshot at ${timeLabel}s`);
	}

	// --- Final state capture ---
	console.log('\nCapturing final state...');
	const deviceResults = [];

	for (let i = 0; i < devices.length; i++) {
		const dev = devices[i];

		// Final screenshot
		try {
			await dev.page.screenshot({ path: `${args.output}/device-${i}-final.png` });
		} catch (_e) {}

		// DOM state
		let domState = { videos: [], images: [], iframes: [] };
		try {
			domState = await captureDeviceState(dev.page);
		} catch (_e) {}

		// Sync analysis
		const syncMessages = analyzeSyncMessages(dev.messages);
		const role = detectRole(dev.messages);

		// Write console log
		await writeFile(`${args.output}/device-${i}-console.json`, JSON.stringify(dev.messages, null, 2));

		const result = {
			id: dev.deviceId,
			duid: dev.duid,
			role,
			dom: domState,
			syncMessages,
			errorCount: dev.errors.length,
			errors: dev.errors.slice(0, 10),
			totalConsoleMessages: dev.messages.length,
		};

		deviceResults.push(result);

		console.log(`  Device ${i} (${role}): ${domState.videos.length} videos, ${domState.images.length} images, ${dev.errors.length} errors`);
		console.log(`    Sync: cmd-prepare=${syncMessages.cmdPrepare}, ack-prepared=${syncMessages.ackPrepared}, signal-ready=${syncMessages.signalReady}`);
	}

	// --- Cross-device analysis ---
	const visibleContentPerDevice = deviceResults.map((d) => {
		const videoSrcs = d.dom.videos.map((v) => v.src).sort();
		const imageSrcs = d.dom.images.map((i) => i.src).sort();
		return JSON.stringify({ videos: videoSrcs, images: imageSrcs });
	});

	const contentMatch = visibleContentPerDevice.length > 0 && visibleContentPerDevice.every((c) => c === visibleContentPerDevice[0]);

	const hasMaster = deviceResults.some((d) => d.role === 'master');
	const hasSlave = deviceResults.some((d) => d.role === 'slave');
	const rolesAssigned = hasMaster && (devices.length === 1 || hasSlave);

	let syncStatus = 'UNKNOWN';
	if (!rolesAssigned) {
		syncStatus = 'NO_SYNC_ROLES';
	} else if (contentMatch) {
		syncStatus = 'IN_SYNC';
	} else {
		syncStatus = 'OUT_OF_SYNC';
	}

	// --- Write summary ---
	const summary = {
		timestamp: new Date().toISOString(),
		smilUrl: args.smilUrl,
		syncGroup: args.syncGroup,
		syncServer: args.syncServer,
		deviceCount: args.devices,
		observationDuration: args.wait,
		elapsedMs: Date.now() - startTime,
		syncStatus,
		contentMatch,
		rolesAssigned,
		devices: deviceResults,
	};

	await writeFile(`${args.output}/summary.json`, JSON.stringify(summary, null, 2));

	console.log(`\n--- Sync Test Summary ---`);
	console.log(`  Status: ${syncStatus}`);
	console.log(`  Content match: ${contentMatch}`);
	console.log(`  Roles: ${deviceResults.map((d) => `${d.id}=${d.role}`).join(', ')}`);
	console.log(`  Output: ${args.output}/`);

	await browser.close();
	process.exit(0);
}

main().catch((err) => {
	console.error('Fatal error:', err.message);
	process.exit(1);
});
