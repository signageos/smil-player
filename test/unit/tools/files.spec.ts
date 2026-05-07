import * as chai from 'chai';
import {
	convertRelativePathToAbsolute,
	copyQueryParameters,
	createCustomEndpointMessagePayload,
	createDownloadPath,
	createJsonStructureMediaInfo,
	createLocalFilePath,
	createPoPMessagePayload,
	createSourceReportObject,
	createVersionedUrl,
	generateSmilUrlVersion,
	getFileName,
	getPath,
	getProtocol,
	getSmilVersionUrl,
	isLocalFileWidget,
	isRelativePath,
	isWidgetUrl,
	mapFileType,
	shouldNotDownload,
	updateJsonObject,
} from '../../../src/components/files/tools';
import { FileStructure } from '../../../src/enums/fileEnums';
import { MergedDownloadList } from '../../../src/models/filesModels';

const expect = chai.expect;

describe('Files tools component', () => {
	describe('Files tools component getFileName tests', () => {
		const filesPaths = [
			`https://butikstv.test.com/play/smil/234.smil`,
			`http://butikstv.test.com/play/media/rendered/bilder/10826.png`,
			'localFile/inFolder/something//myfile.txt',
			'../file.png',
			'./../../../idontknow.mp3',
			'fileName.mp4',
			'https://butikstv.test.com/localFile/inFolder/something/my fi $ le.txt',
			`https://butikstv.test.com/play/smil/234.smil?some=var&xxx=yyy`,
			`filesystem:https://butikstv.tests.com/persistent/play/smil/234.smil?some=var&xxx=yyy`,
			'',
		];
		const fileNames = [
			'234_26f2f779.smil',
			'10826_94919fb2.png',
			'myfile.txt',
			'file.png',
			'idontknow.mp3',
			'fileName.mp4',
			'my-fi-le_1d33992a.txt',
			'234_79ca0eb1.smil',
			'234_03fd5246.smil',
			'',
		];

		filesPaths.forEach((filePath, i) => {
			it(`should return '${fileNames[i]}' for '${filePath}'`, () => {
				expect(getFileName(filePath)).to.be.equal(fileNames[i]);
			});
		});
	});

	describe('Files tools component getPath tests', () => {
		const filesPaths = [
			`https://butikstv.centrumkanalen.com/play/smil/234.smil`,
			`http://butikstv.centrumkanalen.com/play/media/rendered/bilder/10826.png`,
			'localFile/inFolder/something//myfile.txt',
			'../file.png',
			'./../../../idontknow.mp3',
			'fileName.mp4',
		];
		const parsedFilePaths = [
			'https://butikstv.centrumkanalen.com/play/smil',
			'http://butikstv.centrumkanalen.com/play/media/rendered/bilder',
			'localFile/inFolder/something/',
			'..',
			'./../../..',
			'.',
		];

		filesPaths.forEach((filePath, i) => {
			it(`should return '${parsedFilePaths[i]}' for '${filePath}'`, () => {
				expect(getPath(filePath)).to.be.equal(parsedFilePaths[i]);
			});
		});
	});

	describe('Files tools component createDownloadPath tests', () => {
		const validUrls = [
			'https://demo.signageos.io/smil/samples/assets/landscape2.jpg',
			'https://demo.signageos.io/smil/samples/assets/portrait2.mp4',
			'https://demo.signageos.io/smil/samples/assets/landscape1.wgt',
		];

		validUrls.forEach((url) => {
			it(`should return valid path for '${url}'`, () => {
				const response = createDownloadPath(url);
				const responseNumber: number = parseInt(response.split('?__smil_version=')[1]);
				expect(responseNumber).to.be.lessThan(1000000);
				expect(responseNumber).to.be.greaterThan(0);
			});
		});
	});

	describe('Files tools component getProtocol tests', () => {
		const urls = [
			'https://www.rmp-streaming.com/media/bbb-360p.mp4',
			'http://www.rmp-streaming.com/media/bbb-360p.mp4',
			'rtsp://184.72.239.149/vod/mp4:BigBuckBunny_175k.mov',
			'RTMP://184.72.239.149/vod/mp4:BigBuckBunny_175k.mov',
			'UDP://184.72.239.149/vod/mp4:BigBuckBunny_175k.mov',
			'rtp://184.72.239.149/vod/mp4:BigBuckBunny_175k.mov',
			'HLS://184.72.239.149/vod/mp4:BigBuckBunny_175k.mov',
			'internal://pc',
			'internal://dvi',
			'internal://dp',
			'internal://hdmi1',
		];

		const protocols = [
			'http',
			'http',
			'rtsp',
			'rtmp',
			'udp',
			'rtp',
			'hls',
			'internal',
			'internal',
			'internal',
			'internal',
		];

		urls.forEach((url, i) => {
			it(`should return '${protocols[i]}' for '${url}'`, () => {
				expect(getProtocol(url)).to.be.equal(protocols[i]);
			});
		});
	});

	describe('isRelativePath', () => {
		const data = [
			['/root/path', true],
			['root/path', true],
			['http://example.com/root/path', false],
			['https://localhost/root/path', false],
			['https://10.0.0.1/root/path', false],
			['https://10.0.0.1', false],
		] as const;

		data.forEach(([filePath, expected]) => {
			it(`should return ${expected} only on ${filePath} paths`, () => {
				expect(isRelativePath(filePath)).to.be.equal(expected);
			});
		});
	});

	describe('generateSmilUrlVersion', () => {
		const data = [
			['11111_1', 1, '11111_1'],
			['11111_15', 15, '11111_15'],
		] as const;

		data.forEach(([smilUrlVersion, playlistVersion, result]) => {
			it(`should return ${result} for smilUrlVersion: ${smilUrlVersion} and playlistVersion:${playlistVersion}`, () => {
				expect(generateSmilUrlVersion(playlistVersion, smilUrlVersion)).to.be.equal(result);
			});
		});

		const anotherData = [
			['11111_0', 1, '1'],
			['11111_10', 15, '15'],
			['', 9, '9'],
		] as const;

		anotherData.forEach(([smilUrlVersion, playlistVersion, endChars]) => {
			it(`should end with ${endChars} for smilUrlVersion: ${smilUrlVersion} and playlistVersion:${playlistVersion}`, () => {
				const result = generateSmilUrlVersion(playlistVersion, smilUrlVersion);
				expect(result).to.have.string(endChars);
			});
		});
	});

	describe('shouldNotDownload', () => {
		it('should return true for widgets path with non-widget file', () => {
			const file = { src: 'https://example.com/video.mp4' } as MergedDownloadList;
			expect(shouldNotDownload(FileStructure.widgets, file)).to.be.equal(true);
		});

		it('should return false for widgets path with widget file', () => {
			const file = { src: 'https://example.com/widget.wgt' } as MergedDownloadList;
			expect(shouldNotDownload(FileStructure.widgets, file)).to.be.equal(false);
		});

		it('should return true for videos path with stream file', () => {
			const file = { src: 'rtsp://example.com/stream', isStream: 'true' } as unknown as MergedDownloadList;
			expect(shouldNotDownload(FileStructure.videos, file)).to.be.equal(true);
		});

		it('should return false for videos path with regular video', () => {
			const file = { src: 'https://example.com/video.mp4' } as MergedDownloadList;
			expect(shouldNotDownload(FileStructure.videos, file)).to.be.equal(false);
		});

		it('should return false for images path', () => {
			const file = { src: 'https://example.com/image.png' } as MergedDownloadList;
			expect(shouldNotDownload(FileStructure.images, file)).to.be.equal(false);
		});
	});

	describe('isWidgetUrl', () => {
		it('should return true for .wgt files', () => {
			expect(isWidgetUrl('https://example.com/widget.wgt')).to.be.equal(true);
		});

		it('should return true for .zip files', () => {
			expect(isWidgetUrl('https://example.com/widget.zip')).to.be.equal(true);
		});

		it('should return true for .apk files', () => {
			expect(isWidgetUrl('https://example.com/app.apk')).to.be.equal(true);
		});

		it('should return true for .ipk files', () => {
			expect(isWidgetUrl('https://example.com/app.ipk')).to.be.equal(true);
		});

		it('should return false for .mp4 files', () => {
			expect(isWidgetUrl('https://example.com/video.mp4')).to.be.equal(false);
		});

		it('should return false for .png files', () => {
			expect(isWidgetUrl('https://example.com/image.png')).to.be.equal(false);
		});

		it('should return false for .html files', () => {
			expect(isWidgetUrl('https://example.com/page.html')).to.be.equal(false);
		});
	});

	describe('isLocalFileWidget', () => {
		it('should return true for paths containing widget full path', () => {
			expect(isLocalFileWidget('internal/smil/widgets/mywidget.wgt')).to.be.equal(true);
		});

		it('should return false for non-widget paths', () => {
			expect(isLocalFileWidget('internal/smil/videos/video.mp4')).to.be.equal(false);
		});
	});

	describe('copyQueryParameters', () => {
		it('should copy query parameters from one URL to another', () => {
			const result = copyQueryParameters(
				'https://example.com/file?token=abc&key=123',
				'https://other.com/file.mp4',
			);
			expect(result).to.include('token=abc');
			expect(result).to.include('key=123');
			expect(result).to.include('https://other.com/file.mp4?');
		});

		it('should merge query parameters when target already has params', () => {
			const result = copyQueryParameters(
				'https://example.com/file?token=abc',
				'https://other.com/file.mp4?existing=yes',
			);
			expect(result).to.include('token=abc');
			expect(result).to.include('existing=yes');
		});

		it('should return URL without ? when no query parameters exist', () => {
			const result = copyQueryParameters(
				'https://example.com/file',
				'https://other.com/file.mp4',
			);
			expect(result).to.be.equal('https://other.com/file.mp4');
		});
	});

	describe('convertRelativePathToAbsolute', () => {
		it('should convert relative path to absolute using SMIL URL base', () => {
			const result = convertRelativePathToAbsolute(
				'assets/loading.mp4',
				'https://example.com/smil/content.smil',
			);
			expect(result).to.be.equal('https://example.com/smil/assets/loading.mp4');
		});

		it('should return absolute URLs unchanged', () => {
			const result = convertRelativePathToAbsolute(
				'https://cdn.example.com/video.mp4',
				'https://example.com/smil/content.smil',
			);
			expect(result).to.be.equal('https://cdn.example.com/video.mp4');
		});

		it('should handle relative paths with subdirectories', () => {
			const result = convertRelativePathToAbsolute(
				'media/videos/clip.mp4',
				'https://example.com/smil/content.smil',
			);
			expect(result).to.be.equal('https://example.com/smil/media/videos/clip.mp4');
		});
	});

	describe('getSmilVersionUrl', () => {
		it('should return null for null input', () => {
			expect(getSmilVersionUrl(null)).to.be.equal(null);
		});

		it('should return null for undefined input', () => {
			expect(getSmilVersionUrl(undefined as unknown as string)).to.be.equal(null);
		});

		it('should return null for URL without __smil_version', () => {
			expect(getSmilVersionUrl('https://example.com/file.mp4')).to.be.equal(null);
		});

		it('should return version string for URL with __smil_version', () => {
			expect(getSmilVersionUrl('https://example.com/file.mp4?__smil_version=12345_1')).to.be.equal('12345_1');
		});

		it('should return version string when other params are present', () => {
			expect(getSmilVersionUrl('https://example.com/file.mp4?foo=bar&__smil_version=999_5')).to.be.equal('999_5');
		});
	});

	describe('createLocalFilePath', () => {
		it('should combine local path and file name from src', () => {
			const result = createLocalFilePath('smil/videos', 'https://example.com/video.mp4');
			expect(result).to.be.equal(`smil/videos/${getFileName('https://example.com/video.mp4')}`);
		});

		it('should handle relative src paths', () => {
			const result = createLocalFilePath('smil/images', 'image.png');
			expect(result).to.be.equal('smil/images/image.png');
		});
	});

	describe('mapFileType', () => {
		it('should return image for smil/images path', () => {
			expect(mapFileType('smil/images')).to.be.equal('image');
		});

		it('should return video for smil/videos path', () => {
			expect(mapFileType('smil/videos')).to.be.equal('video');
		});

		it('should return ref for smil/widgets path', () => {
			expect(mapFileType('smil/widgets')).to.be.equal('ref');
		});

		it('should return audio for smil/audios path', () => {
			expect(mapFileType('smil/audios')).to.be.equal('audio');
		});

		it('should return smil for smil path', () => {
			expect(mapFileType('smil')).to.be.equal('smil');
		});

		it('should return unknown for unrecognized path', () => {
			expect(mapFileType('smil/something')).to.be.equal('unknown');
		});
	});

	describe('createSourceReportObject', () => {
		it('should create correct source report object', () => {
			const result = createSourceReportObject('/local/path/file.mp4', 'https://example.com/file.mp4', 'internal');
			expect(result).to.eql({
				filePath: {
					path: '/local/path/file.mp4',
					storage: 'internal',
				},
				uri: 'https://example.com/file.mp4',
				localUri: '/local/path/file.mp4',
			});
		});

		it('should default storage type to empty string', () => {
			const result = createSourceReportObject('/local/path/file.mp4', 'https://example.com/file.mp4');
			expect(result.filePath.storage).to.be.equal('');
		});
	});

	describe('updateJsonObject', () => {
		it('should update existing attribute', () => {
			const obj: any = { key1: 'value1' };
			updateJsonObject(obj, 'key1', 'newValue');
			expect(obj.key1).to.be.equal('newValue');
		});

		it('should add new attribute', () => {
			const obj: any = {};
			updateJsonObject(obj, 'newKey', 42);
			expect(obj.newKey).to.be.equal(42);
		});
	});

	describe('createJsonStructureMediaInfo', () => {
		it('should create media info object from file list', () => {
			const fileList = [
				{ src: 'https://example.com/video.mp4', lastModified: 1234567890 },
				{ src: 'https://example.com/image.png', lastModified: 9876543210 },
			] as MergedDownloadList[];
			const result = createJsonStructureMediaInfo(fileList);
			expect(result[getFileName('https://example.com/video.mp4')]).to.be.equal(1234567890);
			expect(result[getFileName('https://example.com/image.png')]).to.be.equal(9876543210);
		});

		it('should use default last modified when not specified', () => {
			const fileList = [
				{ src: 'https://example.com/video.mp4' },
			] as MergedDownloadList[];
			const result = createJsonStructureMediaInfo(fileList);
			const key = getFileName('https://example.com/video.mp4');
			expect(result[key]).to.be.a('number');
		});
	});

	describe('createPoPMessagePayload', () => {
		it('should create basic payload with name and playback success', () => {
			const value = { src: 'test', popName: 'testMedia' } as MergedDownloadList;
			const result = createPoPMessagePayload(value, null);
			expect(result.name).to.be.equal('testMedia');
			expect(result.playbackSuccess).to.be.equal(true);
		});

		it('should include error message when present', () => {
			const value = { src: 'test', popName: 'testMedia' } as MergedDownloadList;
			const result = createPoPMessagePayload(value, 'Download failed');
			expect(result.playbackSuccess).to.be.equal(false);
			expect(result.errorMessage).to.be.equal('Download failed');
		});

		it('should not include playbackSuccess for download events', () => {
			const value = { src: 'test', popName: 'testMedia' } as MergedDownloadList;
			const result = createPoPMessagePayload(value, null, 'download');
			expect(result).to.not.have.property('playbackSuccess');
		});

		it('should include customId when popCustomId is set', () => {
			const value = { src: 'test', popName: 'testMedia', popCustomId: 'custom-123' } as MergedDownloadList;
			const result = createPoPMessagePayload(value, null);
			expect(result.customId).to.be.equal('custom-123');
		});

		it('should include type when popType is set', () => {
			const value = { src: 'test', popName: 'testMedia', popType: 'video' } as unknown as MergedDownloadList;
			const result = createPoPMessagePayload(value, null);
			expect(result.type).to.be.equal('video');
		});

		it('should include tags when popTags is set', () => {
			const value = {
				src: 'test',
				popName: 'testMedia',
				popTags: 'tag1,tag2',
				useInReportUrl: 'reportUrl',
			} as MergedDownloadList;
			const result = createPoPMessagePayload(value, null);
			expect(result.tags).to.be.an('array');
			expect(result.tags![0]).to.be.equal('tag1');
			expect(result.tags![1]).to.be.equal('tag2');
			expect(result.tags![2]).to.be.equal('reportUrl');
			// last element is ISO date string
			expect(result.tags![3]).to.be.a('string');
		});

		it('should include fileName when popFileName is set', () => {
			const value = { src: 'test', popName: 'testMedia', popFileName: 'myfile.mp4' } as MergedDownloadList;
			const result = createPoPMessagePayload(value, null);
			expect(result.fileName).to.be.equal('myfile.mp4');
		});
	});

	describe('createCustomEndpointMessagePayload', () => {
		it('should add recordedAt timestamp', () => {
			const message = { name: 'testMedia', playbackSuccess: true };
			const result = createCustomEndpointMessagePayload(message);
			expect(result.recordedAt).to.be.a('string');
			expect(result.name).to.be.equal('testMedia');
		});

		it('should remove last item from tags', () => {
			const message = { name: 'testMedia', tags: ['tag1', 'tag2', 'toRemove'] };
			const result = createCustomEndpointMessagePayload(message);
			expect(result.tags).to.eql(['tag1', 'tag2']);
		});

		it('should not include tags when not in message', () => {
			const message = { name: 'testMedia' };
			const result = createCustomEndpointMessagePayload(message);
			expect(result).to.not.have.property('tags');
		});
	});

	describe('createVersionedUrl', () => {
		it('should add __smil_version query param', () => {
			const result = createVersionedUrl('https://example.com/file.mp4', 5);
			expect(result).to.include('https://example.com/file.mp4?');
			expect(result).to.include('__smil_version=');
			// version string should end with _5 (playlistVersion)
			const version = result.split('__smil_version=')[1];
			expect(version).to.match(/_5$/);
		});

		it('should strip version for external widgets (isWidget=true, non-local URL)', () => {
			const result = createVersionedUrl('https://external-site.com/widget/index.html', 1, null, true);
			expect(result).to.equal('https://external-site.com/widget/index.html');
			expect(result).to.not.include('__smil_version');
		});

		it('should keep version for local file widgets', () => {
			const result = createVersionedUrl('internal/smil/widgets/mywidget.wgt', 2, null, true);
			expect(result).to.include('__smil_version=');
		});

		it('should preserve existing query params', () => {
			const result = createVersionedUrl('https://example.com/file.mp4?token=abc', 3);
			expect(result).to.include('token=abc');
			expect(result).to.include('__smil_version=');
		});

		it('should reuse smilUrlVersion when playlistVersion matches', () => {
			const result = createVersionedUrl('https://example.com/file.mp4', 7, '54321_7');
			expect(result).to.include('__smil_version=54321_7');
		});

		it('should generate new version when playlistVersion does not match smilUrlVersion', () => {
			const result = createVersionedUrl('https://example.com/file.mp4', 8, '54321_7');
			const version = result.split('__smil_version=')[1];
			expect(version).to.match(/_8$/);
			expect(version).to.not.equal('54321_7');
		});
	});
});
