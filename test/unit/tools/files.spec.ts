import * as chai from 'chai';
import {
	createDownloadPath,
	generateSmilUrlVersion,
	getCanonicalFileName,
	getFileName,
	getPath,
	getProtocol,
	isRelativePath,
	pruneShadowedMediaInfoKeys,
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

		it('Should append extension from fallback URL when primary URL pathname lacks one', () => {
			// Location-header strategy case: SMIL src points to an API endpoint whose
			// pathname is "/content" (no extension). HEAD returns a Location header
			// pointing at a CDN URL whose pathname ends in ".mp4". The on-disk filename
			// must inherit ".mp4" or LG's video element cannot determine the codec.
			const result = getFileName(
				'https://hygh.signage-cdn.com/tymetable/api/v1/dooh/signageos/content?screen=X&id=1',
				'https://hygh.signage-cdn.com/content/1c67c064_fullhd.mp4?id=abc&media=foo',
			);
			expect(result).to.match(/^content_[a-f0-9]{8}\.mp4$/);
		});

		it('Should leave result unchanged when primary URL already has an extension (fallback ignored)', () => {
			const withoutFallback = getFileName('https://cdn.example.com/videos/myvideo.mp4');
			const withFallback = getFileName(
				'https://cdn.example.com/videos/myvideo.mp4',
				'https://other.cdn/different.png',
			);
			expect(withFallback).to.be.equal(withoutFallback);
		});

		it('Should ignore fallback that is not a parseable URL (e.g., Last-Modified date string)', () => {
			// The last-modified strategy returns a date string as its updateValue.
			// If a caller mistakenly passes it as the fallback, the URL host check
			// must reject it so we never derive an extension from a non-URL.
			const withoutFallback = getFileName('https://hygh.example.com/api/v1/content');
			const withDateFallback = getFileName(
				'https://hygh.example.com/api/v1/content',
				'Wed, 21 Oct 2025 07:28:00 GMT',
			);
			expect(withDateFallback).to.be.equal(withoutFallback);
		});

		it('Should return extensionless name when neither primary nor fallback has an extension', () => {
			const result = getFileName(
				'https://hygh.example.com/api/v1/content',
				'https://other.cdn/also-no-ext',
			);
			expect(result).to.not.match(/\.[a-zA-Z0-9]+$/);
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

	describe('getCanonicalFileName', () => {
		// Extensionless location-header URL — the Hygh-style API endpoint that
		// resolves to an .mp4 via the HTTP Location header.
		const extensionlessSrc = 'https://hygh.signage-cdn.com/api/v1/dooh/content?screen=X&id=1';

		it('Should prefer the extensionful sibling over a stale bare key', () => {
			// This is the production bug: a device that ran a pre-`b9420bf` build
			// has a bare key holding a stale Location URL. The current build writes
			// the fresh URL under the extensionful key. The lookup must resolve to
			// the extensionful key, never the shadowing bare key.
			const baseKey = getFileName(extensionlessSrc);
			const mediaInfoObject = {
				[baseKey]: 'https://cdn/content/x.mp4?id=STALE',
				[`${baseKey}.mp4`]: 'https://cdn/content/x.mp4?id=FRESH',
			};
			expect(getCanonicalFileName(extensionlessSrc, mediaInfoObject)).to.equal(`${baseKey}.mp4`);
		});

		it('Should resolve the extensionful key when only that key exists', () => {
			const baseKey = getFileName(extensionlessSrc);
			const mediaInfoObject = { [`${baseKey}.mp4`]: 'https://cdn/content/x.mp4?id=FRESH' };
			expect(getCanonicalFileName(extensionlessSrc, mediaInfoObject)).to.equal(`${baseKey}.mp4`);
		});

		it('Should fall back to the bare key when no extensionful sibling exists yet', () => {
			const baseKey = getFileName(extensionlessSrc);
			expect(getCanonicalFileName(extensionlessSrc, { [baseKey]: 'x' })).to.equal(baseKey);
			expect(getCanonicalFileName(extensionlessSrc, {})).to.equal(baseKey);
		});

		it('Should fast-path a URL that already carries its own extension', () => {
			const src = 'https://cdn.example.com/videos/myvideo.mp4';
			const baseKey = getFileName(src);
			expect(getCanonicalFileName(src, { [baseKey]: 'x' })).to.equal(baseKey);
		});
	});

	describe('pruneShadowedMediaInfoKeys', () => {
		it('Should delete a bare key shadowed by an extensionful sibling', () => {
			const mediaInfoObject = {
				content_aaaaaaaa: 'stale',
				'content_aaaaaaaa.mp4': 'fresh',
			};
			const removed = pruneShadowedMediaInfoKeys(mediaInfoObject);
			expect(removed).to.deep.equal(['content_aaaaaaaa']);
			expect(mediaInfoObject).to.deep.equal({ 'content_aaaaaaaa.mp4': 'fresh' });
		});

		it('Should keep bare keys that have no extensionful sibling', () => {
			const mediaInfoObject = { content_bbbbbbbb: 'value' };
			expect(pruneShadowedMediaInfoKeys(mediaInfoObject)).to.deep.equal([]);
			expect(mediaInfoObject).to.deep.equal({ content_bbbbbbbb: 'value' });
		});

		it('Should keep extensionful keys untouched', () => {
			const mediaInfoObject = { 'video_cccccccc.mp4': 'value', 'img_dddddddd.png': 'value' };
			expect(pruneShadowedMediaInfoKeys(mediaInfoObject)).to.deep.equal([]);
			expect(mediaInfoObject).to.deep.equal({ 'video_cccccccc.mp4': 'value', 'img_dddddddd.png': 'value' });
		});

		it('Should clean the full customer scenario: every bare key shadowed by a sibling', () => {
			// Pre-rollout corrupted state: 5 slots, each bare key holds the SAME
			// stale Location URL (the pre-`085c9ab` shared-latestRemoteValue bug),
			// and the current build has since written fresh extensionful siblings.
			const stale = 'https://cdn/content/shared.mp4?id=019e2b22-632e-7c51-bc37-2886a1a5c577';
			const mediaInfoObject: Record<string, string> = {};
			for (let i = 0; i < 5; i += 1) {
				mediaInfoObject[`content_0000000${i}`] = stale;
				mediaInfoObject[`content_0000000${i}.mp4`] = `https://cdn/content/shared.mp4?id=fresh-${i}`;
			}
			const removed = pruneShadowedMediaInfoKeys(mediaInfoObject);
			expect(removed).to.have.lengthOf(5);
			expect(Object.keys(mediaInfoObject).every((key) => key.endsWith('.mp4'))).to.equal(true);
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
