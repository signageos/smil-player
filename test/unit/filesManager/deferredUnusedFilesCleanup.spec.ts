// Provide browser globals needed by @signageos/front-applet module at import time
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { JSDOM } = require('jsdom');
if (typeof (global as any).window === 'undefined') {
	const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
	(global as any).window = dom.window;
	(global as any).document = dom.window.document;
	(global as any).navigator = dom.window.navigator;
	(global as any).HTMLElement = dom.window.HTMLElement;
}

import { noopLog } from '@signageos/smil-logger';
import { expect } from 'chai';
import { FilesManager } from '../../../src/components/files/filesManager';
import { getFileName } from '../../../src/components/files/tools';
import { FileStructure } from '../../../src/enums/fileEnums';
import { ISos } from '../../../src/models/sosModels';

const MEDIA_INFO_PATH = `${FileStructure.smilMediaInfo}/${FileStructure.smilMediaInfoFileName}`;
const KEPT_SRC = 'https://cdn.example.com/kept.mp4';
const DROPPED_SRC = 'https://cdn.example.com/dropped.mp4';
const NEWER_SRC = 'https://cdn.example.com/newer.mp4';
const SMIL_URL = 'https://cms.example.com/playlist.smil';
const KEPT_KEY = getFileName(KEPT_SRC);
const DROPPED_KEY = getFileName(DROPPED_SRC);
const NEWER_KEY = getFileName(NEWER_SRC);
const SMIL_KEY = getFileName(SMIL_URL);
const KEPT_PATH = `${FileStructure.videos}/${KEPT_KEY}`;
const DROPPED_PATH = `${FileStructure.videos}/${DROPPED_KEY}`;
const NEWER_PATH = `${FileStructure.videos}/${NEWER_KEY}`;

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

/** A promise the test resolves by hand, to hold one file-system call open. */
function gate() {
	let open: () => void = () => undefined;
	const closed = new Promise<void>((resolve) => (open = resolve));
	return { closed, open };
}

const smilWith = (...videoSrcs: string[]) => ({ video: videoSrcs.map((src) => ({ src })), audio: [], ref: [], img: [] } as any);

/**
 * In-memory file system whose mediaInfo file is really read back after a write.
 * `hold.write` / `hold.delete` keep the NEXT such call pending until the test opens the gate;
 * `fail.list` makes every listFiles reject.
 */
function makeFilesManager(extraFiles: string[] = [], mediaInfo: Record<string, string> = { [KEPT_KEY]: 'old', [DROPPED_KEY]: 'x' }) {
	const files = new Set([MEDIA_INFO_PATH, KEPT_PATH, DROPPED_PATH, ...extraFiles]);
	const directories = new Set<string>();
	const store = { mediaInfo: JSON.stringify(mediaInfo) };
	const hold: { write?: Promise<void>; delete?: Promise<void> } = {};
	const fail = { list: false };
	const sos = {
		fileSystem: {
			exists: async ({ filePath }: { filePath: string }) => files.has(filePath),
			readFile: async () => store.mediaInfo,
			writeFile: async (_target: unknown, content: string) => {
				const held = hold.write;
				hold.write = undefined;
				await held;
				store.mediaInfo = content;
				files.add(MEDIA_INFO_PATH);
			},
			listFiles: async ({ filePath }: { filePath: string }) => {
				if (fail.list) {
					throw new Error('listFiles failed');
				}
				return [...files]
					.filter((f) => f.startsWith(`${filePath}/`) && !f.slice(filePath.length + 1).includes('/'))
					.map((f) => ({ filePath: f }));
			},
			isDirectory: async ({ filePath }: { filePath: string }) => directories.has(filePath),
			deleteFile: async ({ filePath }: { filePath: string }) => {
				const held = hold.delete;
				hold.delete = undefined;
				await held;
				files.delete(filePath);
			},
			getFile: async ({ filePath }: { filePath: string }) => (files.has(filePath) ? { filePath, localUri: `file://${filePath}` } : null),
		},
	} as unknown as ISos;
	const fm = new FilesManager(sos, noopLog);
	const setup = { widgets: [], smilObject: smilWith(KEPT_SRC), smilUrl: SMIL_URL };
	const readMediaInfo = () => JSON.parse(store.mediaInfo);
	return { fm, files, directories, store, hold, fail, setup, readMediaInfo };
}

describe('components/files/filesManager - deferred unused files cleanup', () => {
	describe('when the cleanup runs', () => {
		it('deletes inline by default', async () => {
			const { fm, files, setup } = makeFilesManager();
			await fm.currentFilesSetup(setup);
			expect(files.has(DROPPED_PATH)).to.equal(false);
		});

		it('keeps dropped files until the deferred cleanup is run, and runs it once', async () => {
			const { fm, files, setup, readMediaInfo } = makeFilesManager();
			await fm.currentFilesSetup({ ...setup, deferUnusedFilesCleanup: true });
			expect(files.has(DROPPED_PATH)).to.equal(true);
			expect(readMediaInfo()).to.have.property(DROPPED_KEY);

			fm.runPendingUnusedFilesCleanup();
			await fm.settleUnusedFilesCleanup();
			expect(files.has(DROPPED_PATH)).to.equal(false);
			expect(readMediaInfo()).to.deep.equal({ [KEPT_KEY]: 'old' });

			files.add(DROPPED_PATH);
			fm.runPendingUnusedFilesCleanup();
			await fm.settleUnusedFilesCleanup();
			expect(files.has(DROPPED_PATH)).to.equal(true);
		});

		it('does nothing when no cleanup was deferred', async () => {
			const { fm, files } = makeFilesManager();
			fm.runPendingUnusedFilesCleanup();
			await fm.settleUnusedFilesCleanup();
			expect(files.has(DROPPED_PATH)).to.equal(true);
		});

		it('starts the cleanup without making the caller wait for it', async () => {
			const { fm, files, hold, setup } = makeFilesManager();
			const deleting = gate();
			hold.delete = deleting.closed;
			await fm.currentFilesSetup({ ...setup, deferUnusedFilesCleanup: true });

			fm.runPendingUnusedFilesCleanup(); // returns although the delete is still held open
			await tick();
			expect(files.has(DROPPED_PATH)).to.equal(true);

			deleting.open();
			await fm.settleUnusedFilesCleanup();
			expect(files.has(DROPPED_PATH)).to.equal(false);
		});
	});

	describe('a newer content update arriving before the hand-over', () => {
		it('settle drops a cleanup that has not started, so it can never delete the newer download', async () => {
			const { fm, files, setup } = makeFilesManager();
			await fm.currentFilesSetup({ ...setup, deferUnusedFilesCleanup: true });

			await fm.settleUnusedFilesCleanup(); // the newer update starts
			files.add(NEWER_PATH); // ...and downloads a file the older SMIL never referenced
			fm.runPendingUnusedFilesCleanup(); // the older playlist's hand-over fires late
			await fm.settleUnusedFilesCleanup();

			expect(files.has(NEWER_PATH)).to.equal(true);
			expect(files.has(DROPPED_PATH)).to.equal(true);
		});

		it('settle waits for a cleanup that is already running', async () => {
			const { fm, files, hold, setup } = makeFilesManager();
			const deleting = gate();
			hold.delete = deleting.closed;
			await fm.currentFilesSetup({ ...setup, deferUnusedFilesCleanup: true });
			fm.runPendingUnusedFilesCleanup();

			let settled = false;
			const settling = fm.settleUnusedFilesCleanup().then(() => (settled = true));
			await tick();
			expect(settled, 'settle resolved while the cleanup was still deleting').to.equal(false);

			deleting.open();
			await settling;
			expect(files.has(DROPPED_PATH)).to.equal(false);
		});

		it('a newer deferred cleanup replaces the older one', async () => {
			const { fm, files, setup } = makeFilesManager([NEWER_PATH]);
			// older update keeps only `kept`; the newer one keeps `kept` and `newer`
			await fm.currentFilesSetup({ ...setup, deferUnusedFilesCleanup: true });
			await fm.currentFilesSetup({ ...setup, smilObject: smilWith(KEPT_SRC, NEWER_SRC), deferUnusedFilesCleanup: true });

			fm.runPendingUnusedFilesCleanup();
			await fm.settleUnusedFilesCleanup();

			expect(files.has(NEWER_PATH), 'deleted by the cleanup of the older update').to.equal(true);
			expect(files.has(DROPPED_PATH)).to.equal(false);
		});
	});

	describe('a cleanup that fails', () => {
		it('is contained: nothing throws, settle resolves, and a later cleanup still runs', async () => {
			const { fm, files, fail, setup } = makeFilesManager();
			await fm.currentFilesSetup({ ...setup, deferUnusedFilesCleanup: true });

			fail.list = true;
			expect(() => fm.runPendingUnusedFilesCleanup()).to.not.throw();
			await fm.settleUnusedFilesCleanup();
			expect(files.has(DROPPED_PATH)).to.equal(true);

			fail.list = false;
			await fm.currentFilesSetup({ ...setup, deferUnusedFilesCleanup: true });
			fm.runPendingUnusedFilesCleanup();
			await fm.settleUnusedFilesCleanup();
			expect(files.has(DROPPED_PATH)).to.equal(false);
		});
	});

	describe('what the deferred cleanup removes', () => {
		const droppedImage = `${FileStructure.images}/${getFileName('https://cdn.example.com/dropped.jpg')}`;
		const droppedAudio = `${FileStructure.audios}/${getFileName('https://cdn.example.com/dropped.mp3')}`;
		const droppedWidget = `${FileStructure.widgets}/${getFileName('https://cdn.example.com/dropped.wgt')}`;
		const smilFile = `${FileStructure.rootFolder}/${SMIL_KEY}`;
		const storedCopy = `${FileStructure.storageVideos}/${DROPPED_KEY}`;
		const storageInfo = `${FileStructure.storage}/${FileStructure.storageInfoFileName}`;
		const offlineReport = `${FileStructure.offlineReports}/offlineReports0.csv`;
		const extractedWidget = `${FileStructure.extracted}/${getFileName('https://cdn.example.com/dropped.wgt')}`;

		it('removes dropped images, audio and widgets and forgets them in mediaInfo', async () => {
			const keys = [droppedImage, droppedAudio, droppedWidget].map((p) => p.split('/').pop()!);
			const { fm, files, setup, readMediaInfo } = makeFilesManager([droppedImage, droppedAudio, droppedWidget], {
				[KEPT_KEY]: 'old',
				[keys[0]]: 'a',
				[keys[1]]: 'b',
				[keys[2]]: 'c',
			});
			await fm.currentFilesSetup({ ...setup, deferUnusedFilesCleanup: true });
			fm.runPendingUnusedFilesCleanup();
			await fm.settleUnusedFilesCleanup();

			expect([droppedImage, droppedAudio, droppedWidget].filter((p) => files.has(p))).to.deep.equal([]);
			expect(readMediaInfo()).to.deep.equal({ [KEPT_KEY]: 'old' });
		});

		it('never removes the SMIL file, mediaInfo, offline reports, the storage folder or directories', async () => {
			const { fm, files, directories, setup, readMediaInfo } = makeFilesManager(
				[smilFile, storedCopy, storageInfo, offlineReport, extractedWidget],
				{ [KEPT_KEY]: 'old', [DROPPED_KEY]: 'x', [SMIL_KEY]: 'smil-value' },
			);
			directories.add(extractedWidget);
			await fm.currentFilesSetup({ ...setup, deferUnusedFilesCleanup: true });
			fm.runPendingUnusedFilesCleanup();
			await fm.settleUnusedFilesCleanup();

			expect(
				[MEDIA_INFO_PATH, KEPT_PATH, smilFile, storedCopy, storageInfo, offlineReport, extractedWidget].filter((p) => !files.has(p)),
				'files that must survive the cleanup',
			).to.deep.equal([]);
			expect(files.has(DROPPED_PATH)).to.equal(false);
			expect(readMediaInfo()).to.deep.equal({ [KEPT_KEY]: 'old', [SMIL_KEY]: 'smil-value' });
		});
	});

	describe('mediaInfo is never left with a lost update', () => {
		it('pruning cannot revert a value committed by a concurrent writer', async () => {
			const { fm, setup, readMediaInfo } = makeFilesManager();
			const committing = gate();
			// a commit that has read mediaInfo and is still migrating its file when the cleanup starts
			const commit = (fm as any).withMediaInfoLock(async () => {
				const mediaInfo = await fm.getOrCreateMediaInfoFile([]);
				await committing.closed;
				mediaInfo[KEPT_KEY] = 'new';
				await fm.writeMediaInfoFile(mediaInfo);
			});

			await fm.currentFilesSetup({ ...setup, deferUnusedFilesCleanup: true });
			fm.runPendingUnusedFilesCleanup();
			await tick();
			committing.open();
			await commit;
			await fm.settleUnusedFilesCleanup();

			expect(readMediaInfo()).to.deep.equal({ [KEPT_KEY]: 'new' });
		});

		it('the update checker\'s batch commit and the cleanup cannot overwrite each other', async () => {
			const { fm, hold, setup, readMediaInfo } = makeFilesManager();
			const writing = gate();
			hold.write = writing.closed; // the batch commit has read mediaInfo and its write is in flight
			fm.startBatch();
			fm.collectUpdate(KEPT_KEY, 'new');
			const commit = fm.commitBatch([{ src: KEPT_SRC, localFilePath: KEPT_PATH } as any]);
			await tick();

			await fm.currentFilesSetup({ ...setup, deferUnusedFilesCleanup: true });
			fm.runPendingUnusedFilesCleanup();
			await tick();
			writing.open();
			await commit;
			await fm.settleUnusedFilesCleanup();

			expect(readMediaInfo(), 'kept must carry the committed value and dropped must stay pruned').to.deep.equal({
				[KEPT_KEY]: 'new',
			});
		});

		it('recording a download cannot be overwritten by a writer that read mediaInfo earlier', async () => {
			const { fm, readMediaInfo } = makeFilesManager();
			const pruning = gate();
			// e.g. the cleanup's prune: has read mediaInfo, writes it back a moment later
			const writer = (fm as any).withMediaInfoLock(async () => {
				const mediaInfo = await fm.getOrCreateMediaInfoFile([]);
				await pruning.closed;
				delete mediaInfo[DROPPED_KEY];
				await fm.writeMediaInfoFile(mediaInfo);
			});

			const recorded = fm.updateMediaInfoAfterDownloads([{ src: SMIL_URL } as any], new Map([[SMIL_KEY, 'new-smil-value']]));
			await tick();
			pruning.open();
			await writer;
			await recorded;

			expect(readMediaInfo()).to.deep.equal({ [KEPT_KEY]: 'old', [SMIL_KEY]: 'new-smil-value' });
		});

		it('recording a download creates mediaInfo when none is stored yet', async () => {
			const { fm, files, readMediaInfo } = makeFilesManager();
			files.delete(MEDIA_INFO_PATH);

			await fm.updateMediaInfoAfterDownloads([{ src: SMIL_URL } as any], new Map([[SMIL_KEY, 'first-value']]));

			expect(readMediaInfo()).to.deep.equal({ [SMIL_KEY]: 'first-value' });
		});

		it('a writer that fails does not block the writers after it', async () => {
			const { fm, setup, readMediaInfo } = makeFilesManager();
			const failed = (fm as any).withMediaInfoLock(async () => {
				throw new Error('commit failed');
			});
			await fm.currentFilesSetup({ ...setup, deferUnusedFilesCleanup: true });
			fm.runPendingUnusedFilesCleanup();

			let error: Error | undefined;
			await failed.catch((err: Error) => (error = err));
			await fm.settleUnusedFilesCleanup();

			expect(error?.message, 'the failure must still reach its own caller').to.equal('commit failed');
			expect(readMediaInfo()).to.deep.equal({ [KEPT_KEY]: 'old' });
		});
	});
});
