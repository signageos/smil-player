import * as chai from 'chai';
import { FilesManager } from '../../../src/components/files/filesManager';
import { getFileName } from '../../../src/components/files/tools';
import { DEFAULT_LAST_MODIFIED } from '../../../src/enums/fileEnums';
import { FetchStrategy } from '../../../src/components/files/fetchingStrategies/fetchingStrategies';
import { SMILEnums } from '../../../src/enums/generalEnums';

const expect = chai.expect;

function createSosMock(fileExistsResult: boolean): any {
	return {
		fileSystem: {
			exists: async () => fileExistsResult,
		},
	};
}

function createFetchStrategy(returnValue: string | null): FetchStrategy {
	const strategy: FetchStrategy = async () => returnValue;
	strategy.strategyType = SMILEnums.lastModified;
	return strategy;
}

const TEST_SRC = 'https://example.com/media/video.mp4';
const LOCAL_FILE_PATH = 'smil/videos';
const TEST_MEDIA = { src: TEST_SRC } as any;

describe('shouldUpdateLocalFile (last-modified strategy)', () => {
	it('should return shouldUpdate: false when server is unreachable (null)', async () => {
		const filesManager = new FilesManager(createSosMock(true));
		const fetchStrategy = createFetchStrategy(null);
		const mediaInfoObject = { [getFileName(TEST_SRC)]: 'Mon, 01 Jan 2024 00:00:00 GMT' };

		const result = await filesManager.shouldUpdateLocalFile(
			LOCAL_FILE_PATH, TEST_MEDIA, mediaInfoObject, 5000, [], [], fetchStrategy,
		);

		expect(result).to.deep.equal({ shouldUpdate: false });
	});

	it('should return shouldUpdate: true when file does not exist locally', async () => {
		const filesManager = new FilesManager(createSosMock(false));
		const serverDate = 'Mon, 01 Jan 2024 00:00:00 GMT';
		const fetchStrategy = createFetchStrategy(serverDate);
		const mediaInfoObject = { [getFileName(TEST_SRC)]: serverDate };

		const result = await filesManager.shouldUpdateLocalFile(
			LOCAL_FILE_PATH, TEST_MEDIA, mediaInfoObject, 5000, [], [], fetchStrategy,
		);

		expect(result).to.deep.equal({ shouldUpdate: true, value: serverDate });
	});

	it('should return shouldUpdate: true when no stored value exists (first tracked download)', async () => {
		const filesManager = new FilesManager(createSosMock(true));
		const serverDate = 'Mon, 01 Jan 2024 00:00:00 GMT';
		const fetchStrategy = createFetchStrategy(serverDate);
		// stored value is null (key missing from mediaInfoObject)
		const mediaInfoObject: any = { [getFileName(TEST_SRC)]: null };

		const result = await filesManager.shouldUpdateLocalFile(
			LOCAL_FILE_PATH, TEST_MEDIA, mediaInfoObject, 5000, [], [], fetchStrategy,
		);

		expect(result).to.deep.equal({ shouldUpdate: true, value: serverDate });
	});

	it('should return shouldUpdate: false when Last-Modified is unchanged', async () => {
		const filesManager = new FilesManager(createSosMock(true));
		const serverDate = 'Mon, 01 Jan 2024 00:00:00 GMT';
		const fetchStrategy = createFetchStrategy(serverDate);
		const mediaInfoObject = { [getFileName(TEST_SRC)]: serverDate };

		const result = await filesManager.shouldUpdateLocalFile(
			LOCAL_FILE_PATH, TEST_MEDIA, mediaInfoObject, 5000, [], [], fetchStrategy,
		);

		expect(result).to.deep.equal({ shouldUpdate: false });
	});

	it('should return shouldUpdate: true when Last-Modified is newer', async () => {
		const filesManager = new FilesManager(createSosMock(true));
		const newerDate = 'Tue, 02 Jan 2024 00:00:00 GMT';
		const fetchStrategy = createFetchStrategy(newerDate);
		const mediaInfoObject = { [getFileName(TEST_SRC)]: 'Mon, 01 Jan 2024 00:00:00 GMT' };

		const result = await filesManager.shouldUpdateLocalFile(
			LOCAL_FILE_PATH, TEST_MEDIA, mediaInfoObject, 5000, [], [], fetchStrategy,
		);

		expect(result).to.deep.equal({ shouldUpdate: true, value: newerDate });
	});

	it('should return shouldUpdate: true when Last-Modified is older (rollback)', async () => {
		const filesManager = new FilesManager(createSosMock(true));
		const olderDate = 'Sun, 31 Dec 2023 00:00:00 GMT';
		const fetchStrategy = createFetchStrategy(olderDate);
		const mediaInfoObject = { [getFileName(TEST_SRC)]: 'Mon, 01 Jan 2024 00:00:00 GMT' };

		const result = await filesManager.shouldUpdateLocalFile(
			LOCAL_FILE_PATH, TEST_MEDIA, mediaInfoObject, 5000, [], [], fetchStrategy,
		);

		expect(result).to.deep.equal({ shouldUpdate: true, value: olderDate });
	});

	it('should return shouldUpdate: false when server has no header (DEFAULT_LAST_MODIFIED fallback)', async () => {
		const filesManager = new FilesManager(createSosMock(true));
		const fetchStrategy = createFetchStrategy(DEFAULT_LAST_MODIFIED);
		const mediaInfoObject = { [getFileName(TEST_SRC)]: 'Mon, 01 Jan 2024 00:00:00 GMT' };

		const result = await filesManager.shouldUpdateLocalFile(
			LOCAL_FILE_PATH, TEST_MEDIA, mediaInfoObject, 5000, [], [], fetchStrategy,
		);

		expect(result).to.deep.equal({ shouldUpdate: false });
	});
});
