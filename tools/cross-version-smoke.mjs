#!/usr/bin/env node
/**
 * Cross-version sync smoke test.
 *
 * Launches 2 browser contexts on the same sync group but with DIFFERENT SMIL
 * URLs. Captures per-device console + a minimal DOM snapshot every 5s for
 * 90s. Prints a summary so the operator can eyeball whether:
 *   - the cross-version alignment-peek log line appears on the affected device,
 *   - DOM keeps cycling on the affected device (no freeze),
 *   - no `networkFailureTimeout` or `Wrapping resync target` log fires.
 *
 * Default device order: device 0 (master) on LONG fixture (10 elements),
 * device 1 (slave) on SHORT fixture (5 elements). The SHORT slave is the
 * cross-version victim — its local maxSyncIndexPerRegion=5 so master
 * broadcasts of syncIndex 6-10 trip the predicate.
 *
 * Usage:
 *   node tools/cross-version-smoke.mjs [--wait=90] [--master=long|short]
 */

import { chromium } from 'playwright';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

const EMULATOR = process.env.SMIL_EMULATOR_BASE || 'http://localhost:8090';
const TEST_SERVER = 'http://localhost:3000';
const SYNC_SERVER = 'https://sync.signage-cdn.com';
const DUID_BASE = '218603c29e5e7275a238c43a1422a9b19188752893c12c5128'.slice(0, 48);
const OUT_DIR = '/tmp/cross-version-smoke';
const GROUP = `cross-version-smoke-${Date.now()}`;

const args = process.argv.slice(2).reduce((acc, arg) => {
	const m = arg.match(/^--(\w[\w-]*)=(.+)$/);
	if (m) acc[m[1]] = m[2];
	return acc;
}, {});
const WAIT_S = Number(args.wait || 90);
const MASTER = args.master === 'short' ? 'short' : 'long';

async function spawnDevice(browser, index, smilUrl, deviceId) {
	const duid = DUID_BASE + String(index).padStart(2, '0');
	const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, bypassCSP: true });
	const page = await ctx.newPage();
	const messages = [];
	page.on('console', (msg) => messages.push({ ts: Date.now(), level: msg.type(), text: msg.text() }));
	page.on('pageerror', (err) => messages.push({ ts: Date.now(), level: 'pageerror', text: String(err) }));

	await ctx.addInitScript((cfg) => {
		window.__SMIL_URL__ = cfg.smilUrl;
		window.__SYNC_CONFIG__ = {
			syncGroupName: cfg.groupName,
			syncDeviceId: cfg.deviceId,
			syncServerUrl: cfg.syncServerUrl,
			debugEnabled: 'true',
		};
	}, { smilUrl, groupName: GROUP, deviceId, syncServerUrl: SYNC_SERVER });

	await page.goto(`${EMULATOR}/?duid=${duid}`);
	return { ctx, page, messages, deviceId, duid, smilUrl };
}

async function snapshotDom(page) {
	try {
		return await page.evaluate(() => {
			const frame = Array.from(document.querySelectorAll('iframe')).find((f) =>
				f.src && (f.src.includes(':8091') || f.src.includes('/applet')),
			);
			const root = frame?.contentDocument || document;
			const imgs = Array.from(root.querySelectorAll('img'));
			const visible = imgs.filter((i) => i.offsetWidth > 0 && i.offsetHeight > 0).map((i) => {
				const src = (i.src || '').split('/').pop() || null;
				return src;
			});
			return visible;
		});
	} catch {
		return null;
	}
}

(async () => {
	if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });

	const browser = await chromium.launch({ headless: true });
	const SHORT = `${TEST_SERVER}/syncFiles/crossVersionShort.smil`;
	const LONG = `${TEST_SERVER}/syncFiles/crossVersionLong.smil`;
	const masterUrl = MASTER === 'long' ? LONG : SHORT;
	const slaveUrl = MASTER === 'long' ? SHORT : LONG;

	console.log(`[smoke] group=${GROUP}`);
	console.log(`[smoke] master(dev0) on ${MASTER === 'long' ? 'LONG' : 'SHORT'}: ${masterUrl}`);
	console.log(`[smoke] slave (dev1) on ${MASTER === 'long' ? 'SHORT' : 'LONG'}: ${slaveUrl}`);

	// Master joins first to win election.
	const dev0 = await spawnDevice(browser, 0, masterUrl, 'dev-0');
	await new Promise((r) => setTimeout(r, 2000));
	const dev1 = await spawnDevice(browser, 1, slaveUrl, 'dev-1');

	const startTs = Date.now();
	const snapshots = [];
	const SNAPSHOT_EVERY_MS = 5000;
	const totalSnapshots = Math.floor((WAIT_S * 1000) / SNAPSHOT_EVERY_MS);
	for (let i = 0; i < totalSnapshots; i++) {
		await new Promise((r) => setTimeout(r, SNAPSHOT_EVERY_MS));
		const [v0, v1] = await Promise.all([snapshotDom(dev0.page), snapshotDom(dev1.page)]);
		const elapsed = Math.floor((Date.now() - startTs) / 1000);
		snapshots.push({ t: elapsed, dev0: v0, dev1: v1 });
		console.log(`[smoke t=${elapsed}s] dev0=${JSON.stringify(v0)} dev1=${JSON.stringify(v1)}`);
	}

	const summarize = (dev) => {
		const text = dev.messages.map((m) => `[${m.level}] ${m.text}`).join('\n');
		const findCount = (re) => (text.match(re) || []).length;
		return {
			deviceId: dev.deviceId,
			smilUrl: dev.smilUrl,
			totalLines: dev.messages.length,
			crossVersionLines: findCount(/Peer broadcast cross-version/g),
			networkFailureTimeoutLines: findCount(/networkFailureTimeout|signal-ready timed out/g),
			wrappingResyncTargetLines: findCount(/Wrapping resync target/g),
			masterElectionLines: findCount(/master|elected/g),
			pageErrorLines: findCount(/pageerror/g),
			fatalLines: findCount(/Uncaught (TypeError|ReferenceError|SyntaxError|RangeError)|Cannot read properties of|is not a function|is not defined/g),
		};
	};

	const summary = {
		group: GROUP,
		master: MASTER,
		waitSeconds: WAIT_S,
		dev0: summarize(dev0),
		dev1: summarize(dev1),
		snapshots,
	};

	await writeFile(`${OUT_DIR}/summary.json`, JSON.stringify(summary, null, 2));
	await writeFile(`${OUT_DIR}/dev0-${dev0.deviceId}.log`, dev0.messages.map((m) => `[${m.level}] ${m.text}`).join('\n'));
	await writeFile(`${OUT_DIR}/dev1-${dev1.deviceId}.log`, dev1.messages.map((m) => `[${m.level}] ${m.text}`).join('\n'));

	console.log('\n=== SUMMARY ===');
	console.log(JSON.stringify(summary, (k, v) => (k === 'snapshots' ? `[${snapshots.length} snapshots]` : v), 2));
	console.log(`\nLogs: ${OUT_DIR}/`);

	await browser.close();
})().catch((err) => {
	console.error(err);
	process.exit(1);
});
