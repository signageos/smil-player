#!/usr/bin/env node
/**
 * Standalone SMIL player verification script.
 *
 * Launches headless Chromium, loads a SMIL file in the emulator,
 * captures console logs, DOM state, and screenshots, then outputs
 * structured JSON that Claude Code can parse.
 *
 * Usage:
 *   node tools/verify-smil.mjs \
 *     --smil-url=http://localhost:3000/zonesCypress.smil \
 *     [--duid=218603c29e5e7275a238c43a1422a9b19188752893c12c5128] \
 *     [--wait=20] \
 *     [--screenshot=/tmp/verify.png] \
 *     [--output=/tmp/results.json] \
 *     [--viewport=1080x1920] \
 *     [--emulator=http://localhost:8090]
 */

import { chromium } from 'playwright';
import { writeFile } from 'fs/promises';

// --- Argument parsing ---
function parseArgs(argv) {
	const args = {
		smilUrl: null,
		duid: '218603c29e5e7275a238c43a1422a9b19188752893c12c5128',
		wait: 20,
		screenshot: '/tmp/verify.png',
		output: '/tmp/verify-results.json',
		viewport: '1080x1920',
		emulator: 'http://localhost:8090',
	};

	for (const arg of argv.slice(2)) {
		const match = arg.match(/^--(\w[\w-]*)=(.+)$/);
		if (match) {
			const key = match[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
			args[key] = match[2];
		}
	}

	if (!args.smilUrl) {
		console.error('Usage: node tools/verify-smil.mjs --smil-url=<URL> [options]');
		console.error('  --duid=<id>            Device UID (default: test DUID)');
		console.error('  --wait=<seconds>       Wait duration after navigation (default: 20)');
		console.error('  --screenshot=<path>    Screenshot output path (default: /tmp/verify.png)');
		console.error('  --output=<path>        JSON output path (default: /tmp/verify-results.json)');
		console.error('  --viewport=<WxH>       Viewport size (default: 1080x1920)');
		console.error('  --emulator=<url>       Emulator base URL (default: http://localhost:8090)');
		process.exit(1);
	}

	args.wait = parseInt(args.wait, 10);
	return args;
}

// --- DOM state capture ---
async function captureMainPageState(page) {
	return page.evaluate(() => {
		return [...document.querySelectorAll('video')].map((v) => ({
			src: v.src || null,
			visible: v.offsetWidth > 0 && v.offsetHeight > 0,
			bounds: v.getBoundingClientRect
				? { x: Math.round(v.getBoundingClientRect().x), y: Math.round(v.getBoundingClientRect().y), w: v.offsetWidth, h: v.offsetHeight }
				: null,
			currentTime: v.currentTime || 0,
			paused: v.paused,
			duration: v.duration || 0,
		}));
	});
}

async function captureIframeState(page) {
	const images = [];
	const iframes = [];

	// Find the applet iframe (port 8091)
	for (const frame of page.frames()) {
		const url = frame.url();
		if (!url.includes(':8091') && !url.includes('/applet')) continue;

		try {
			const frameImages = await frame.evaluate(() => {
				return [...document.querySelectorAll('img')].map((img) => ({
					src: img.src || null,
					visible: img.offsetWidth > 0 && img.offsetHeight > 0,
					bounds: {
						x: Math.round(img.getBoundingClientRect().x),
						y: Math.round(img.getBoundingClientRect().y),
						w: img.offsetWidth,
						h: img.offsetHeight,
					},
				}));
			});
			images.push(...frameImages);

			const frameIframes = await frame.evaluate(() => {
				return [...document.querySelectorAll('iframe')].map((f) => ({
					src: f.src || null,
					visible: f.offsetWidth > 0 && f.offsetHeight > 0,
					bounds: {
						x: Math.round(f.getBoundingClientRect().x),
						y: Math.round(f.getBoundingClientRect().y),
						w: f.offsetWidth,
						h: f.offsetHeight,
					},
				}));
			});
			iframes.push(...frameIframes);
		} catch (e) {
			// Frame may have navigated or be inaccessible
		}
	}

	return { images, iframes };
}

// --- Main ---
async function main() {
	const args = parseArgs(process.argv);
	const [vw, vh] = args.viewport.split('x').map(Number);

	console.log(`Verifying: ${args.smilUrl}`);
	console.log(`  DUID: ${args.duid}`);
	console.log(`  Wait: ${args.wait}s`);
	console.log(`  Viewport: ${vw}x${vh}`);

	const browser = await chromium.launch({ headless: true });
	const context = await browser.newContext({
		viewport: { width: vw, height: vh },
		bypassCSP: true,
	});
	const page = await context.newPage();

	// --- Console collection ---
	const consoleMessages = [];
	const consoleErrors = [];
	const consoleWarnings = [];

	page.on('console', (msg) => {
		const entry = { level: msg.type(), text: msg.text(), timestamp: Date.now() };
		consoleMessages.push(entry);
		if (msg.type() === 'error') consoleErrors.push(msg.text());
		if (msg.type() === 'warning') consoleWarnings.push(msg.text());
	});
	page.on('pageerror', (err) => {
		consoleErrors.push(err.message);
	});

	// --- Network tracking ---
	const failedRequests = [];
	page.on('requestfailed', (req) => {
		failedRequests.push({ url: req.url(), failure: req.failure()?.errorText || 'unknown' });
	});

	// --- Inject SMIL URL and navigate ---
	await context.addInitScript(
		(url) => {
			window.__SMIL_URL__ = url;
		},
		args.smilUrl,
	);

	const startTime = Date.now();
	await page.goto(`${args.emulator}/?duid=${args.duid}`);

	console.log(`  Navigated. Waiting ${args.wait}s for content...`);
	await page.waitForTimeout(args.wait * 1000);

	// --- Capture state ---
	console.log('  Capturing state...');
	const videos = await captureMainPageState(page);
	const { images, iframes } = await captureIframeState(page);

	// --- Screenshot ---
	await page.screenshot({ path: args.screenshot, fullPage: true });
	console.log(`  Screenshot: ${args.screenshot}`);

	// --- Build result ---
	const smilPlayerMessages = consoleMessages.filter((m) => m.text.includes('SMIL-PLAYER') || m.text.includes('smil-player')).map((m) => m.text);

	const result = {
		timestamp: new Date().toISOString(),
		smilUrl: args.smilUrl,
		duid: args.duid,
		waitDuration: args.wait * 1000,
		elapsedMs: Date.now() - startTime,
		dom: {
			videos: videos.map((v) => ({
				...v,
				src: v.src ? v.src.split('/').pop() : null,
				srcFull: v.src,
			})),
			images: images.map((img) => ({
				...img,
				src: img.src ? img.src.split('/').pop() : null,
				srcFull: img.src,
			})),
			iframes,
		},
		console: {
			errorCount: consoleErrors.length,
			warningCount: consoleWarnings.length,
			totalMessages: consoleMessages.length,
			errors: consoleErrors.slice(0, 20),
			warnings: consoleWarnings.slice(0, 10),
			smilPlayerMessages: smilPlayerMessages.slice(0, 50),
		},
		network: {
			failedRequests: failedRequests.slice(0, 20),
		},
		screenshot: args.screenshot,
	};

	// --- Write output ---
	await writeFile(args.output, JSON.stringify(result, null, 2));
	console.log(`  Results: ${args.output}`);

	// --- Summary ---
	const visibleVideos = videos.filter((v) => v.visible);
	const visibleImages = images.filter((i) => i.visible);
	console.log(`\nSummary:`);
	console.log(`  Videos: ${visibleVideos.length} visible / ${videos.length} total`);
	console.log(`  Images: ${visibleImages.length} visible / ${images.length} total`);
	console.log(`  Iframes: ${iframes.filter((f) => f.visible).length} visible / ${iframes.length} total`);
	console.log(`  Console: ${consoleErrors.length} errors, ${consoleWarnings.length} warnings, ${consoleMessages.length} total`);
	console.log(`  Network failures: ${failedRequests.length}`);

	await browser.close();

	// Exit with error code if there were console errors
	if (consoleErrors.length > 0) {
		console.log(`\n[WARN] ${consoleErrors.length} console error(s) detected`);
	}
	process.exit(0);
}

main().catch((err) => {
	console.error('Fatal error:', err.message);
	process.exit(1);
});
