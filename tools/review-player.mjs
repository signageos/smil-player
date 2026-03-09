#!/usr/bin/env node

/**
 * SMIL Player Review Script
 *
 * Launches headless Chromium, loads a SMIL file in the emulator,
 * waits for content to render, then outputs DOM state + screenshot.
 *
 * Usage:
 *   node tools/review-player.mjs --smil-url=http://localhost:3000/zonesCypress.smil [--wait=15] [--screenshot=/tmp/smil-review.png]
 *
 * Prerequisites:
 *   - Dev server running: npm start (port 8090)
 *   - Test server running: npm run start-e2e-server (port 3000)
 */

import { chromium } from '@playwright/test';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
	options: {
		'smil-url': { type: 'string' },
		wait: { type: 'string', default: '15' },
		screenshot: { type: 'string', default: '/tmp/smil-review.png' },
	},
});

const smilUrl = args['smil-url'];
const waitSeconds = parseInt(args.wait, 10);
const screenshotPath = args.screenshot;

if (!smilUrl) {
	console.error('Usage: node tools/review-player.mjs --smil-url=<URL> [--wait=15] [--screenshot=/tmp/smil-review.png]');
	process.exit(1);
}

const EMULATOR_URL = 'http://localhost:8090?duid=218603c29e5e7275a238c43a1422a9b19188752893c12c5128';
const consoleMessages = [];
const errors = [];

let browser;
try {
	browser = await chromium.launch({ headless: true });
	const context = await browser.newContext({
		viewport: { width: 1080, height: 1920 },
		ignoreHTTPSErrors: true,
	});
	const page = await context.newPage();

	// Collect console messages from main page
	page.on('console', (msg) => {
		consoleMessages.push({ source: 'main', type: msg.type(), text: msg.text() });
	});
	page.on('pageerror', (err) => {
		errors.push({ source: 'main', message: err.message });
	});

	// Navigate to emulator
	await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });

	// Wait for the applet iframe to appear and load
	const iframeLocator = page.locator('iframe').first();
	await iframeLocator.waitFor({ state: 'attached', timeout: 15000 });
	const iframeHandle = await iframeLocator.elementHandle();
	const appletFrame = await iframeHandle.contentFrame();

	if (!appletFrame) {
		throw new Error('Could not access applet iframe content frame');
	}

	// Collect console from iframe
	appletFrame.on('console', (msg) => {
		consoleMessages.push({ source: 'iframe', type: msg.type(), text: msg.text() });
	});

	// Type SMIL URL and submit
	await appletFrame.waitForSelector('#SMILUrl', { timeout: 10000 });
	await appletFrame.fill('#SMILUrl', smilUrl);
	await new Promise((r) => setTimeout(r, 500));
	await appletFrame.evaluate(() => {
		document.querySelector('#SMILUrlWrapper').dispatchEvent(new Event('submit'));
	});

	// Wait for content to render
	console.error(`Waiting ${waitSeconds}s for content to render...`);
	await new Promise((r) => setTimeout(r, waitSeconds * 1000));

	// Capture DOM state: videos on main page
	const videos = await page.evaluate(() => {
		return Array.from(document.querySelectorAll('video')).map((v) => {
			const rect = v.getBoundingClientRect();
			const style = window.getComputedStyle(v);
			return {
				src: v.src || v.getAttribute('src'),
				visible: style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0',
				rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
			};
		});
	});

	// Capture DOM state: images and widgets inside iframe
	let images = [];
	let widgets = [];

	// Re-fetch frames in case new ones loaded during playback
	const frames = page.frames();
	for (const frame of frames) {
		if (frame === page.mainFrame()) continue;
		try {
			const frameImages = await frame.evaluate(() => {
				return Array.from(document.querySelectorAll('img')).map((img) => {
					const rect = img.getBoundingClientRect();
					const style = window.getComputedStyle(img);
					return {
						src: img.src || img.getAttribute('src'),
						id: img.id || null,
						visible:
							style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0',
						rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
					};
				});
			});
			images = images.concat(frameImages);

			const frameWidgets = await frame.evaluate(() => {
				return Array.from(document.querySelectorAll('iframe')).map((w) => {
					const rect = w.getBoundingClientRect();
					const style = window.getComputedStyle(w);
					return {
						src: w.src || w.getAttribute('src'),
						visible:
							style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0',
						rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
					};
				});
			});
			widgets = widgets.concat(frameWidgets);
		} catch {
			// Frame may have been detached during iteration
		}
	}

	// Take screenshot
	await page.screenshot({ path: screenshotPath, fullPage: true });

	// Output results
	const result = {
		screenshotPath,
		domState: {
			videos: videos.filter((v) => v.src),
			images: images.filter((i) => i.src),
			widgets: widgets.filter((w) => w.src),
		},
		consoleErrors: consoleMessages.filter((m) => m.type === 'error'),
		consoleWarnings: consoleMessages.filter((m) => m.type === 'warning'),
		errors,
		totalConsoleMessages: consoleMessages.length,
	};

	console.log(JSON.stringify(result, null, 2));
} catch (err) {
	console.error('Review failed:', err.message);
	const result = {
		screenshotPath: null,
		domState: { videos: [], images: [], widgets: [] },
		consoleErrors: consoleMessages.filter((m) => m.type === 'error'),
		consoleWarnings: consoleMessages.filter((m) => m.type === 'warning'),
		errors: [...errors, { source: 'script', message: err.message }],
		totalConsoleMessages: consoleMessages.length,
	};
	console.log(JSON.stringify(result, null, 2));
	process.exitCode = 1;
} finally {
	if (browser) await browser.close();
}
