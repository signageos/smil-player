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

import { noopLog } from '../../../src/logger';
import { expect } from 'chai';
import { FilesManager } from '../../../src/components/files/filesManager';
import { getFileName } from '../../../src/components/files/tools';
import { createFetchingStrategies } from '../../../src/components/files/fetchingStrategies/fetchingStrategies';
import { FileStructure } from '../../../src/enums/fileEnums';
import { SMILEnums } from '../../../src/enums/generalEnums';
import { ISos } from '../../../src/models/sosModels';

const MEDIA_INFO_PATH = `${FileStructure.smilMediaInfo}/${FileStructure.smilMediaInfoFileName}`;
const LAST_MODIFIED = 'Fri, 11 Sep 2026 13:12:32 GMT';
const OLD_SRC = 'https://cdn.example.com/2026/09/old.mp4';
const NEW_SRC = 'https://cdn.example.com/2026/09/new.mp4';
const SMIL_URL = 'https://cms.example.com/playlist.smil';

/** In-memory file system: `files` is the set of existing paths, mediaInfo is served from MEDIA_INFO_PATH. */
function makeFilesManager(files: Set<string>, mediaInfo: Record<string, string>) {
	files.add(MEDIA_INFO_PATH);
	const written: string[] = [];
	const deleted: string[] = [];
	const sos = {
		fileSystem: {
			exists: async ({ filePath }: { filePath: string }) => files.has(filePath),
			readFile: async () => JSON.stringify(mediaInfo),
			writeFile: async (_target: unknown, content: string) => {
				written.push(content);
			},
			listFiles: async ({ filePath }: { filePath: string }) =>
				[...files]
					.filter((f) => f.startsWith(`${filePath}/`) && !f.slice(filePath.length + 1).includes('/'))
					.map((f) => ({ filePath: f })),
			isDirectory: async () => false,
			deleteFile: async ({ filePath }: { filePath: string }) => {
				deleted.push(filePath);
				files.delete(filePath);
			},
			getFile: async ({ filePath }: { filePath: string }) =>
				files.has(filePath) ? { filePath, localUri: `file://${filePath}` } : null,
		},
	} as unknown as ISos;
	const fm = new FilesManager(sos, noopLog);
	(fm as any).makeXhrRequest = async (_method: string, url: string) => ({
		status: 200,
		url,
		headers: { get: (name: string) => (name === 'last-modified' ? LAST_MODIFIED : null) },
	});
	return { fm, written, deleted };
}

describe('components/files/filesManager - stale mediaInfo entries', () => {
	const strategy = createFetchingStrategies(noopLog).getStrategy(SMILEnums.lastModified);
	const newFile = () => ({ src: NEW_SRC, localFilePath: '' } as any);

	it('downloads a new file whose Last-Modified only matches an entry with no file on disk', async () => {
		const { fm } = makeFilesManager(new Set(), { [getFileName(OLD_SRC)]: LAST_MODIFIED });

		const detection = await (fm as any).detectUpdateOnly(newFile(), FileStructure.videos, 2000, [], [], strategy);

		expect(detection).to.not.equal(null);
		expect(detection.needsDownload).to.equal(true);
	});

	it('still treats a matching value as moved content when that file exists in the same folder', async () => {
		const files = new Set([`${FileStructure.videos}/${getFileName(OLD_SRC)}`]);
		const { fm } = makeFilesManager(files, { [getFileName(OLD_SRC)]: LAST_MODIFIED });

		const detection = await (fm as any).detectUpdateOnly(newFile(), FileStructure.videos, 2000, [], [], strategy);

		expect(detection).to.not.equal(null);
		expect(detection.needsDownload).to.equal(false);
	});

	it('does not treat the SMIL entry as a stored copy of media content', async () => {
		const smilKey = getFileName(SMIL_URL);
		const files = new Set([`${FileStructure.rootFolder}/${smilKey}`]);
		const { fm } = makeFilesManager(files, { [smilKey]: LAST_MODIFIED });

		const detection = await (fm as any).detectUpdateOnly(newFile(), FileStructure.videos, 2000, [], [], strategy);

		expect(detection.needsDownload).to.equal(true);
	});

	it('drops the mediaInfo entry of a file deleted as unused and keeps the others', async () => {
		const keepKey = getFileName(OLD_SRC);
		const goneKey = getFileName(NEW_SRC);
		const smilKey = getFileName(SMIL_URL);
		const files = new Set([
			`${FileStructure.videos}/${keepKey}`,
			`${FileStructure.videos}/${goneKey}`,
			`${FileStructure.rootFolder}/${smilKey}`,
		]);
		const { fm, written, deleted } = makeFilesManager(files, {
			[keepKey]: LAST_MODIFIED,
			[goneKey]: 'Fri, 11 Sep 2026 13:12:34 GMT',
			[smilKey]: 'Fri, 11 Sep 2026 14:00:00 GMT',
		});
		const smilObject = { video: [{ src: OLD_SRC }], audio: [], ref: [], img: [] } as any;

		await (fm as any).deleteUnusedFiles(smilObject, SMIL_URL);

		expect(deleted).to.deep.equal([`${FileStructure.videos}/${goneKey}`]);
		expect(written.length).to.equal(1);
		expect(JSON.parse(written[0])).to.deep.equal({
			[keepKey]: LAST_MODIFIED,
			[smilKey]: 'Fri, 11 Sep 2026 14:00:00 GMT',
		});
	});
});
