import { statSync } from 'fs';
import { APIRequestContext, Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { DUID, Timeouts } from '../config';
import { getFileName } from '../../src/components/files/tools/fileName';

// Files a live SMIL update drops must stay on the device for as long as the PREVIOUS playlist is
// still the one on screen, and be removed once the new playlist has taken over. Unit tests cover
// the files manager alone; only a running player shows that the removal waits for the hand-over
// and that playback reports stay truthful across it.
//
// Harness (/unused-cleanup/ on the test server, location strategy): the update drops `dropped`,
// adds `added`, keeps `kept`, and may not start before a wallclock gate ~30s ahead — so the new
// playlist is fully downloaded while the old one keeps cycling `kept` → `dropped`. Right at the
// hand-over the test also swaps the content behind `kept` (v1 → v2), so a content update lands
// next to the cleanup.
//
// Every content file is a different real video. A playback report names the content version in
// its URL; the duration of the <video> that was actually playing names it on screen. The two
// must agree for every single report — no old file reported under the new URL, or vice versa.

const ASSETS = 'test-server/testFiles/assets';
/** content file named by a report URL → the video that file really is */
const CONTENT = {
	'kept_v1.mp4': { asset: 'video-test-1.mp4', durationSec: 4.374 },
	'kept_v2.mp4': { asset: 'loader.mp4', durationSec: 4.838 },
	'dropped_v1.mp4': { asset: 'video-test-2.mp4', durationSec: 3.367 },
	'added_v1.mp4': { asset: 'landscape1.mp4', durationSec: 15.015 },
} as const;
type ContentFile = keyof typeof CONTENT;
type Slot = 'kept' | 'dropped' | 'added';

const assetSize = (content: ContentFile) => statSync(`${ASSETS}/${CONTENT[content].asset}`).size;

/** Seconds the new playlist is held back after the update is published. */
const GATE_SECONDS = 30;
const DURATION_TOLERANCE_SEC = 0.2;

interface VideoSample {
	t: number;
	/** this video is the topmost <video> at its own centre — i.e. the one a viewer sees */
	top: boolean;
	file: string;
	duration: number;
	currentTime: number;
}

interface PlaybackReport {
	receivedAt: number;
	status: number;
	url: string;
	slot: Slot;
	content: ContentFile;
}

interface DiskState {
	mediaInfo: Record<string, string>;
	files: Record<string, { exists: boolean; bytes: number }>;
}

/** Records every visible main-page <video> ~7x per second (the list resets only on a page reload). */
const SAMPLER = `
	if (window.top === window) {
		window.__videoSamples = [];
		setInterval(function () {
			var now = Date.now();
			document.querySelectorAll('video').forEach(function (v) {
				if (!v.src || !(v.offsetWidth > 0 && v.offsetHeight > 0) || getComputedStyle(v).visibility === 'hidden') {
					return;
				}
				var r = v.getBoundingClientRect();
				var stack = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2);
				var topVideo = stack.filter(function (e) { return e.tagName === 'VIDEO'; })[0];
				window.__videoSamples.push({
					t: now,
					top: topVideo === v,
					file: new URL(v.src).pathname.split('/').pop(),
					duration: isFinite(v.duration) ? v.duration : 0,
					currentTime: v.currentTime,
				});
			});
		}, 150);
	}
`;

const getSamples = (page: Page): Promise<VideoSample[]> =>
	page.evaluate(() => (window as unknown as { __videoSamples: VideoSample[] }).__videoSamples);

/** Samples of `file` in [from, to] during which the video was on top and really advancing. */
function playingSamples(samples: VideoSample[], file: string, from: number, to: number): VideoSample[] {
	const onTop = samples.filter((s) => s.file === file && s.top);
	return onTop.filter(
		(s, i) => s.t >= from && s.t <= to && s.duration > 0 && i > 0 && s.currentTime > onTop[i - 1].currentTime,
	);
}

async function fetchRecords(request: APIRequestContext, baseUrl: string): Promise<any[]> {
	const history = await (await request.get(`${baseUrl}/report/history`)).json();
	return history.flatMap((entry: any) =>
		[].concat(entry.body).map((body: any) => ({ ...body, receivedAt: Date.parse(entry.receivedAt) })),
	);
}

async function fetchPlaybacks(request: APIRequestContext, baseUrl: string): Promise<PlaybackReport[]> {
	return (await fetchRecords(request, baseUrl))
		.filter((r) => r.name === 'media-playback')
		.map((r) => {
			const match = String(r.url).match(/\/unused-cleanup\/content\/((kept|dropped|added)_v\d\.mp4)$/);
			expect(match, `media-playback must report a resolved content URL, got ${r.url}`).not.toBeNull();
			return { receivedAt: r.receivedAt, status: r.status, url: r.url, slot: match![2] as Slot, content: match![1] as ContentFile };
		});
}

/** What the device really holds: mediaInfo plus existence and byte size of each stored video. */
async function readDisk(page: Page, fileNames: string[]): Promise<DiskState> {
	const applet = page.frames().find((f) => f.url().includes('/applet'));
	if (!applet) {
		throw new Error('applet frame not found');
	}
	return applet.evaluate(async (names: string[]) => {
		const sos = (window as any).sos;
		const units = await sos.fileSystem.listStorageUnits();
		const storageUnit = units.find((u: any) => !u.removable) || units[0];
		const mediaInfo = JSON.parse(
			await sos.fileSystem.readFile({ storageUnit, filePath: 'smil/info/mediaInfo.smilMeta' }),
		);
		const files: Record<string, { exists: boolean; bytes: number }> = {};
		for (const name of names) {
			const filePath = `smil/videos/${name}`;
			const exists: boolean = await sos.fileSystem.exists({ storageUnit, filePath });
			let bytes = 0;
			if (exists) {
				const file = await sos.fileSystem.getFile({ storageUnit, filePath });
				bytes = (await (await fetch(file.localUri)).arrayBuffer()).byteLength;
			}
			files[name] = { exists, bytes };
		}
		return { mediaInfo, files };
	}, fileNames);
}

test.describe('unused files cleanup on a live SMIL update', () => {
	// After the kept slot's content swap the player re-prepares that video under a versioned URL
	// and never stops that one player again: it stays underneath on its last frame while the
	// playlist carries on above it (an older, separate defect of the re-prepare path). What a viewer
	// sees is asserted below through the topmost video, so only that leftover is exempted.
	test.use({ allowFrozenVideos: ['__smil_version'] });

	test('a dropped video outlives the previous playlist, then is removed, and every playback report matches what played', async ({
		page,
		context,
		request,
		smilUrls,
		testServerBaseUrl,
	}) => {
		test.setTimeout(300_000);
		const file: Record<Slot, string> = {
			kept: getFileName(`${testServerBaseUrl}/unused-cleanup/slot/kept.mp4`),
			dropped: getFileName(`${testServerBaseUrl}/unused-cleanup/slot/dropped.mp4`),
			added: getFileName(`${testServerBaseUrl}/unused-cleanup/slot/added.mp4`),
		};
		const allFiles = Object.values(file);
		const contentUrl = (content: ContentFile) => `${testServerBaseUrl}/unused-cleanup/content/${content}`;

		await context.addInitScript(SAMPLER);
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, smilUrls.unusedFilesCleanup);
		await page.goto(`/?duid=${DUID}`);

		// ── Phase 1: the previous playlist cycles kept → dropped ──
		await expect
			.poll(async () => new Set((await fetchPlaybacks(request, testServerBaseUrl)).map((p) => p.slot)).size, {
				message: 'both phase-1 videos must have played and been reported',
				timeout: Timeouts.firstElement + 30_000,
				intervals: [1000],
			})
			.toBe(2);

		const before = await readDisk(page, allFiles);
		expect(before.files[file.kept], 'kept v1 on disk').toEqual({ exists: true, bytes: assetSize('kept_v1.mp4') });
		expect(before.files[file.dropped], 'dropped on disk').toEqual({ exists: true, bytes: assetSize('dropped_v1.mp4') });
		expect(before.mediaInfo[file.kept]).toBe(contentUrl('kept_v1.mp4'));
		expect(before.mediaInfo[file.dropped]).toBe(contentUrl('dropped_v1.mp4'));

		// ── Publish the update: drops `dropped`, adds `added`, starts no earlier than the gate ──
		const { gateBeginMs } = await (
			await request.post(`${testServerBaseUrl}/unused-cleanup/phase/2`, { data: { gateSeconds: GATE_SECONDS } })
		).json();

		// The new playlist is downloaded and prepared once its added video is committed to disk.
		await expect
			.poll(
				async () => {
					const disk = await readDisk(page, allFiles);
					return disk.files[file.added].exists && disk.mediaInfo[file.added] === contentUrl('added_v1.mp4');
				},
				{ message: 'the update must be downloaded before its gate opens', timeout: 25_000, intervals: [500] },
			)
			.toBe(true);
		const preparedAt = Date.now();
		expect(
			gateBeginMs - preparedAt,
			'the previous playlist needs time for at least one more full cycle before the hand-over',
		).toBeGreaterThan(12_000);

		// ── Window: update prepared, previous playlist still on screen. `dropped` must survive it. ──
		const droppedMissingAt: number[] = [];
		while (Date.now() < gateBeginMs - 1500) {
			const disk = await readDisk(page, [file.dropped]);
			if (!disk.files[file.dropped].exists || disk.mediaInfo[file.dropped] !== contentUrl('dropped_v1.mp4')) {
				droppedMissingAt.push(Date.now() - preparedAt);
			}
			await page.waitForTimeout(300);
		}
		expect(
			droppedMissingAt,
			'the dropped video was removed (ms after the update was prepared) while the previous playlist still played it',
		).toEqual([]);

		// ── Hand-over: the new playlist starts with `added` ──
		await expect
			.poll(async () => playingSamples(await getSamples(page), file.added, 0, Date.now()).length, {
				message: 'the updated playlist never took over',
				timeout: 40_000,
				intervals: [250],
			})
			.toBeGreaterThan(0);
		const takeoverAt = Date.now();
		expect(takeoverAt, 'the updated playlist must not start before its gate').toBeGreaterThan(gateBeginMs - 1500);

		// A content update on the kept slot, landing right next to the cleanup.
		await request.post(`${testServerBaseUrl}/unused-cleanup/kept-version/2`);

		// ── Cleanup: file gone, mediaInfo entry gone, removal reported, nothing else touched ──
		await expect
			.poll(async () => (await readDisk(page, allFiles)).files[file.dropped].exists, {
				message: 'the dropped video must be removed once the updated playlist has taken over',
				timeout: 20_000,
				intervals: [500],
			})
			.toBe(false);
		await expect
			.poll(async () => (await fetchRecords(request, testServerBaseUrl)).filter((r) => r.name === 'media-deleted').length, {
				message: 'the removal must be reported',
				timeout: 20_000,
				intervals: [500],
			})
			.toBeGreaterThanOrEqual(1);
		const afterCleanup = await readDisk(page, allFiles);
		expect(Object.keys(afterCleanup.mediaInfo), 'mediaInfo must forget the removed file').not.toContain(file.dropped);
		expect(afterCleanup.files[file.kept].exists, 'kept video must survive the cleanup').toBe(true);
		expect(afterCleanup.files[file.added], 'added video must survive the cleanup').toEqual({
			exists: true,
			bytes: assetSize('added_v1.mp4'),
		});

		// ── The kept slot's new content arrives and is played ──
		await expect
			.poll(
				async () => (await fetchPlaybacks(request, testServerBaseUrl)).filter((p) => p.content === 'kept_v2.mp4').length,
				{ message: 'the kept slot must switch to its new content', timeout: 90_000, intervals: [1000] },
			)
			.toBeGreaterThanOrEqual(3);

		// ── Verdict over the whole run ──
		const playbacks = await fetchPlaybacks(request, testServerBaseUrl);
		const samples = await getSamples(page);
		const describe = (p: PlaybackReport) => `${p.content}@+${p.receivedAt - preparedAt}ms`;

		expect(
			playbacks.filter((p) => p.status !== 200).map(describe),
			'no playback may be reported as failed',
		).toEqual([]);

		// Every report against the screen: the video that was advancing just before the report
		// arrived must be exactly the content version the report names.
		const misreported: string[] = [];
		for (const p of playbacks) {
			const played = playingSamples(samples, file[p.slot], p.receivedAt - 3000, p.receivedAt);
			const wrong = played.filter((s) => Math.abs(s.duration - CONTENT[p.content].durationSec) > DURATION_TOLERANCE_SEC);
			if (played.length < 3 || wrong.length > 0) {
				misreported.push(
					`${describe(p)}: ${played.length} playing samples, on-screen durations ${JSON.stringify([
						...new Set(played.map((s) => s.duration.toFixed(2))),
					])}, expected ${CONTENT[p.content].durationSec}`,
				);
			}
		}
		expect(misreported, 'reports that do not match the video that was on screen').toEqual([]);

		// Each playlist reports only its own media, on its own side of the hand-over.
		const reportedAfter = (slot: Slot, t: number) => playbacks.filter((p) => p.slot === slot && p.receivedAt > t);
		// In the window the previous playlist must keep alternating kept → dropped: a dropped video
		// that silently fell out of the loop shows up as kept reports without dropped ones between.
		const inWindow = (slot: Slot) =>
			playbacks.filter((p) => p.slot === slot && p.receivedAt > preparedAt + 4000 && p.receivedAt < takeoverAt).length;
		expect(inWindow('dropped'), 'the previous playlist must keep playing the dropped video').toBeGreaterThanOrEqual(1);
		expect(
			inWindow('kept') - inWindow('dropped'),
			'the dropped video must stay in the previous playlist\'s rotation until the hand-over',
		).toBeLessThanOrEqual(1);
		expect(
			reportedAfter('dropped', takeoverAt + 4000).map(describe),
			'the dropped video must not play once the updated playlist has taken over',
		).toEqual([]);
		expect(
			playbacks.filter((p) => p.slot === 'added' && p.receivedAt < takeoverAt).map(describe),
			'the added video must not play before the hand-over',
		).toEqual([]);

		// The kept slot goes v1 → v2 once and never back.
		const keptVersions = playbacks.filter((p) => p.slot === 'kept').map((p) => p.content);
		expect(keptVersions.slice(keptVersions.indexOf('kept_v2.mp4')), 'kept slot must not fall back to old content').not.toContain(
			'kept_v1.mp4',
		);
		expect(keptVersions[0]).toBe('kept_v1.mp4');

		// The removal report names the dropped file and only that one.
		const deleted = (await fetchRecords(request, testServerBaseUrl)).filter((r) => r.name === 'media-deleted');
		expect(deleted.map((r) => String(r.url).split('/').pop())).toEqual([file.dropped]);

		// Final device state: bytes on disk, mediaInfo and the last reports all name the same content.
		const final = await readDisk(page, allFiles);
		expect(final.files[file.kept], 'kept v2 on disk').toEqual({ exists: true, bytes: assetSize('kept_v2.mp4') });
		expect(final.mediaInfo[file.kept]).toBe(contentUrl('kept_v2.mp4'));
		expect(final.mediaInfo[file.added]).toBe(contentUrl('added_v1.mp4'));
		expect(final.files[file.dropped].exists).toBe(false);
		expect(Object.keys(final.mediaInfo)).not.toContain(file.dropped);
	});
});
