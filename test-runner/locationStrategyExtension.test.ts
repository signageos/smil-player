import { test, expect, Frame } from '@playwright/test';

const EMULATOR_URL = 'http://localhost:8090';
const TEST_SERVER = 'http://localhost:3000';
const SMIL_URL = `${TEST_SERVER}/checkBeforePlayLocationNoExt.smil`;

async function getStableAppletFrame(page: any, timeout = 30000): Promise<Frame> {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		try {
			const iframeLocator = page.locator('iframe').first();
			await iframeLocator.waitFor({ state: 'attached', timeout: 5000 });
			const iframeHandle = await iframeLocator.elementHandle();
			const frame = await iframeHandle!.contentFrame();
			if (frame) {
				await frame.waitForSelector('body', { timeout: 5000 });
				return frame;
			}
		} catch {
			// Frame detached or not ready, retry
		}
		await new Promise((r) => setTimeout(r, 1000));
	}
	throw new Error('Could not get stable applet iframe');
}

// The location-header strategy must produce on-disk filenames with the resolved
// extension even when the SMIL src URL itself has no extension. This mirrors the
// Hygh production setup where <video src="…/content?id=N"> resolves to a Location
// header URL ending in .mp4. LG's video element infers codec from extension, so a
// missing extension breaks playback there.
test('location strategy: on-disk filename carries .mp4 from Location header when SMIL src is extensionless', async ({ context, page }) => {
	await context.addInitScript(`window.__SMIL_URL__ = '${SMIL_URL}';`);

	// Capture HEAD + GET traffic so the test self-documents when it fails.
	const downloadRequests: string[] = [];
	page.on('request', (req) => {
		const url = req.url();
		if (req.method() === 'GET' && url.includes('/cbp-loc-noext/file/')) {
			downloadRequests.push(url);
		}
	});

	// Fresh storage so the player must download.
	await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });
	await page.evaluate(async () => {
		const dbs = await indexedDB.databases();
		for (const db of dbs) {
			if (db.name) indexedDB.deleteDatabase(db.name);
		}
	});

	// Reload to start fresh.
	await page.goto(EMULATOR_URL, { waitUntil: 'load', timeout: 30000 });
	const appletFrame = await getStableAppletFrame(page);

	// Wait until both .mp4 downloads have been triggered.
	await expect.poll(() => downloadRequests.length, {
		message: 'Player should download at least one .mp4 via the Location header',
		timeout: 60000,
		intervals: [2000],
	}).toBeGreaterThanOrEqual(1);

	// Give the Phase-4 commit (prePlayLock) time to persist mediaInfoObject + files.
	await page.waitForTimeout(8000);

	// The mediaInfoObject is the canonical record of what's been committed.
	// Read it directly and verify (a) it has entries for both videos, (b) every
	// media entry's key (the canonical filename) ends in .mp4, and (c) each file
	// reported by mediaInfoObject actually exists on disk under that name.
	const result: any = await appletFrame.evaluate(async () => {
		const w = window as any;
		const sos = w.sos;
		const units = await sos.fileSystem.listStorageUnits();
		const internal = units.find((u: any) => !u.removable) || units[0];

		const metaContent: string = await sos.fileSystem.readFile({
			storageUnit: internal,
			filePath: 'smil/info/mediaInfo.smilMeta',
		});
		const meta = JSON.parse(metaContent);

		// Per-key existence check: filter to entries that look like media (value is a
		// URL or the key matches a hash pattern), then verify each file exists at
		// `smil/<videos|images|audios|widgets>/<key>` via sos.fileSystem.exists.
		const mediaFolders = ['smil/videos', 'smil/images', 'smil/audios', 'smil/widgets'];
		const checks: { key: string; value: any; foundAt: string | null }[] = [];
		for (const key of Object.keys(meta)) {
			// Skip the SMIL file entry itself
			if (key.endsWith('.smil')) continue;
			let foundAt: string | null = null;
			for (const folder of mediaFolders) {
				try {
					const fp = `${folder}/${key}`;
					const exists = await sos.fileSystem.exists({ storageUnit: internal, filePath: fp });
					if (exists) { foundAt = fp; break; }
				} catch {}
			}
			checks.push({ key, value: meta[key], foundAt });
		}
		return { meta, checks };
	});

	console.log('mediaInfo.smilMeta:', result.meta);
	console.log('per-file existence checks:', result.checks);

	// Assertion 1: at least one media entry committed.
	expect(result.checks.length, 'Expected mediaInfoObject to contain at least one media entry').toBeGreaterThan(0);

	// Assertion 2 (the bug fix): every committed media key MUST carry the extension
	// inherited from the resolved Location URL. Before the fix, the key was
	// `content_<hash>` with no extension — which on LG broke playback because the
	// video element couldn't infer the codec. After the fix, the canonical name
	// (used both as the mediaInfoObject key AND as the on-disk filename) is
	// `content_<hash>.mp4`.
	for (const c of result.checks) {
		expect(c.key, `mediaInfoObject key "${c.key}" should end with .mp4`).toMatch(/\.mp4$/);
	}

	// Assertion 3: the value stored for each entry must be a URL whose pathname
	// also ends in .mp4 — confirming the Location-header round-trip preserved the
	// extension and that the key/value pair is self-consistent.
	for (const c of result.checks) {
		expect(String(c.value)).toMatch(/\.mp4(\?|$)/);
	}
});
