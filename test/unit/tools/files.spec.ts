import * as chai from 'chai';
import {
	createDownloadPath,
	generateSmilUrlVersion,
	getFileName,
	getPath,
	getProtocol,
	isRelativePath,
} from '../../../src/components/files/tools';

const expect = chai.expect;

describe('Files tools component', () => {
	describe('Files tools component getFileName tests', () => {
		it('Should return correct file name for vairous strings', () => {
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

			for (let i = 0; i < filesPaths.length; i += 1) {
				const response = getFileName(filesPaths[i]);
				expect(response).to.be.equal(fileNames[i]);
			}
		});

		it('Should return correct path for vairous strings', () => {
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

			for (let i = 0; i < filesPaths.length; i += 1) {
				const response = getPath(filesPaths[i]);
				expect(response).to.be.equal(parsedFilePaths[i]);
			}
		});

		it('Should return valid path', () => {
			const validUrls = [
				'https://demo.signageos.io/smil/samples/assets/landscape2.jpg',
				'https://demo.signageos.io/smil/samples/assets/portrait2.mp4',
				'https://demo.signageos.io/smil/samples/assets/landscape1.wgt',
			];

			for (let i = 0; i < validUrls.length; i += 1) {
				const response = createDownloadPath(validUrls[i]);
				const responseNumber: number = parseInt(response.split('?__smil_version=')[1]);
				expect(responseNumber).to.be.lessThan(1000000);
				expect(responseNumber > 0).to.be.equal(true);
			}
		});

		it('Should return valid protocol', () => {
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

			const protocol = [
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

			for (let i = 0; i < urls.length; i += 1) {
				const response = getProtocol(urls[i]);
				expect(response).equal(protocol[i]);
			}
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
				expect(isRelativePath(filePath)).equal(expected);
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
				expect(generateSmilUrlVersion(playlistVersion, smilUrlVersion)).equal(result);
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
				expect(result.endsWith(endChars)).equal(true);
			});
		});
	});
});
