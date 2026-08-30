import { promises as fsPromise } from 'fs';
import * as path from 'path';
import { XmlParser } from '../../../src/components/xmlParser/xmlParser';
import { parseNestedRegions, containsElement, extractRegionInfo, extractTransitionsInfo, mergeLoggerWithConfigReportUrl } from '../../../src/components/xmlParser/tools';
import { smilLogging } from '../../../src/enums/fileEnums';
import { mockSMILFileParsed234 } from '../../mocks/playlistMock/mock234';
import { mockSMILFileParsed99 } from '../../mocks/playlistMock/mock99';
import { mockSMILFileParsedRegionAlias } from '../../mocks/playlistMock/mockRegionAlias';
import { mockSMILFileTriggers } from '../../mocks/playlistMock/mockTriggers';
import { mockBrokenSmil } from '../../mocks/playlistMock/mockBrokenSmil';
import { triggerRfid } from '../../mocks/playlistMock/mockTriggerRfId';

import * as chai from 'chai';

const expect = chai.expect;
const xmlParser = new XmlParser();
const FIXTURES = path.join(__dirname, '../../mocks/xmlParserMock');

describe('XmlParse tools component', () => {
	describe('XmlParse tools component tests', () => {
		it('Should parse whole xml file correctly file broken smil', async () => {
			const xmlFile: string = await fsPromise.readFile(path.join(FIXTURES, 'broken.smil'), 'utf8');
			const smilObject = await xmlParser.processSmilXml(xmlFile);
			// checking file arrays for download
			expect(smilObject.video.length).to.be.eql(2);
			expect(smilObject.audio.length).to.be.eql(0);
			expect(smilObject.ref.length).to.be.eql(0);
			expect(smilObject.img.length).to.be.eql(0);
			expect(smilObject.intro.length).to.be.eql(1);
			//checking playlist
			expect(smilObject.playlist).to.be.eql(mockBrokenSmil.playlist);
			//checking regions object
			expect(smilObject.region).to.be.eql(mockBrokenSmil.region);
			// checking whole smil object
			expect(smilObject).to.be.eql(mockBrokenSmil);
		});

		it('Should parse whole xml file correctly file triggers', async () => {
			const xmlFile: string = await fsPromise.readFile(path.join(FIXTURES, 'triggers.smil'), 'utf8');
			const smilObject = await xmlParser.processSmilXml(xmlFile);
			// checking file arrays for download
			expect(smilObject.video.length).to.be.eql(4);
			expect(smilObject.audio.length).to.be.eql(0);
			expect(smilObject.ref.length).to.be.eql(0);
			expect(smilObject.img.length).to.be.eql(1);
			expect(smilObject.intro.length).to.be.eql(1);
			//checking playlist
			expect(smilObject.playlist).to.be.eql(mockSMILFileTriggers.playlist);
			//checking regions object
			expect(smilObject.region).to.be.eql(mockSMILFileTriggers.region);
			// checking whole smil object
			expect(smilObject).to.be.eql(mockSMILFileTriggers);
			// trigger rfid pairing
			expect(smilObject.triggerSensorInfo).to.be.eql(triggerRfid);
		});

		it('Should parse whole xml file correctly file 234', async () => {
			const xmlFile: string = await fsPromise.readFile(path.join(FIXTURES, '234.smil'), 'utf8');
			const smilObject = await xmlParser.processSmilXml(xmlFile);
			// checking file arrays for download
			expect(smilObject.video.length).to.be.eql(1);
			expect(smilObject.audio.length).to.be.eql(1);
			expect(smilObject.ref.length).to.be.eql(1);
			expect(smilObject.img.length).to.be.eql(14);
			expect(smilObject.intro.length).to.be.eql(1);
			//checking playlist
			expect(smilObject.playlist).to.be.eql(mockSMILFileParsed234.playlist);
			//checking regions object
			expect(smilObject.region).to.be.eql(mockSMILFileParsed234.region);
			// checking whole smil object
			expect(smilObject).to.be.eql(mockSMILFileParsed234);
		});

		it('Should parse whole xml file correctly file regionAlias', async () => {
			const xmlFile: string = await fsPromise.readFile(path.join(FIXTURES, 'regionAlias.smil'), 'utf8');
			const smilObject = await xmlParser.processSmilXml(xmlFile);
			// checking file arrays for download
			expect(smilObject.video.length).to.be.eql(1);
			expect(smilObject.audio.length).to.be.eql(1);
			expect(smilObject.ref.length).to.be.eql(1);
			expect(smilObject.img.length).to.be.eql(14);
			expect(smilObject.intro.length).to.be.eql(1);
			//checking playlist
			expect(smilObject.playlist).to.be.eql(mockSMILFileParsedRegionAlias.playlist);
			//checking regions object
			expect(smilObject.region).to.be.eql(mockSMILFileParsedRegionAlias.region);
			// checking whole smil object
			expect(smilObject).to.be.eql(mockSMILFileParsedRegionAlias);
		});

		it('Should parse whole xml file correctly file 99', async () => {
			const xmlFile: string = await fsPromise.readFile(path.join(FIXTURES, '99.smil'), 'utf8');
			const smilObject = await xmlParser.processSmilXml(xmlFile);
			// checking file arrays for download
			expect(smilObject.video.length).to.be.eql(4);
			expect(smilObject.audio.length).to.be.eql(0);
			expect(smilObject.ref.length).to.be.eql(3);
			expect(smilObject.img.length).to.be.eql(3);
			expect(smilObject.intro.length).to.be.eql(1);
			//checking playlist
			expect(smilObject.playlist).to.be.eql(mockSMILFileParsed99.playlist);
			//checking regions object
			expect(smilObject.region).to.be.eql(mockSMILFileParsed99.region);
			// checking whole smil object
			expect(smilObject).to.be.eql(mockSMILFileParsed99);
		});

		it('Should parse reportFileLimit from meta tag', async () => {
			const xmlFile: string = await fsPromise.readFile('test/mocks/xmlParserMock/reportFileLimit.smil', 'utf8');
			const smilObject: any = await xmlParser.processSmilXml(xmlFile);
			expect(smilObject.logger.reportFileLimit).to.be.eql(50);
			expect(smilObject.logger.enabled).to.be.eql(true);
			expect(smilObject.logger.endpoint).to.be.eql('https://example.com/report');
			expect(smilObject.logger.type).to.be.eql(['manual']);
		});

		it('Should default reportFileLimit to 100 when not specified', async () => {
			const xmlFile: string = await fsPromise.readFile('test/mocks/xmlParserMock/triggers.smil', 'utf8');
			const smilObject: any = await xmlParser.processSmilXml(xmlFile);
			expect(smilObject.logger.reportFileLimit).to.be.eql(100);
		});

		it('Should parse events allowlist from meta tag, trimming and dropping unknown names', async () => {
			const xmlFile: string = await fsPromise.readFile('test/mocks/xmlParserMock/reportEvents.smil', 'utf8');
			const smilObject: any = await xmlParser.processSmilXml(xmlFile);
			expect(smilObject.logger.events).to.be.eql(['media-playback', 'media-copied']);
		});

		it('Should accept the opt-in media-deleted and media-skipped event names', async () => {
			const xmlFile: string = await fsPromise.readFile('test/mocks/xmlParserMock/reportEventsOptIn.smil', 'utf8');
			const smilObject: any = await xmlParser.processSmilXml(xmlFile);
			expect(smilObject.logger.events).to.be.eql(['media-deleted', 'media-skipped', 'media-moved']);
		});

		it('Should leave events undefined when the attribute is absent', async () => {
			const xmlFile: string = await fsPromise.readFile('test/mocks/xmlParserMock/reportFileLimit.smil', 'utf8');
			const smilObject: any = await xmlParser.processSmilXml(xmlFile);
			expect(smilObject.logger.events).to.be.eql(undefined);
		});

		it('Should treat an empty events attribute as absent', async () => {
			const xmlFile: string = await fsPromise.readFile('test/mocks/xmlParserMock/reportEventsEmpty.smil', 'utf8');
			const smilObject: any = await xmlParser.processSmilXml(xmlFile);
			expect(smilObject.logger.events).to.be.eql(undefined);
		});

		it('Should parse skipPlaybackOnHttpStatus from meta tag independently of skipContentOnHttpStatus', async () => {
			const xmlFile: string = await fsPromise.readFile('test/mocks/xmlParserMock/playCheckGate.smil', 'utf8');
			const smilObject: any = await xmlParser.processSmilXml(xmlFile);
			expect(smilObject.skipPlaybackOnHttpStatus).to.be.eql([403, 404, 410]);
			expect(smilObject.skipContentOnHttpStatus).to.be.eql([404]);
		});

		it('Should default skipPlaybackOnHttpStatus to empty array when not specified', async () => {
			const xmlFile: string = await fsPromise.readFile('test/mocks/xmlParserMock/triggers.smil', 'utf8');
			const smilObject: any = await xmlParser.processSmilXml(xmlFile);
			expect(smilObject.skipPlaybackOnHttpStatus).to.be.eql([]);
		});

		describe('HTTP status list meta parsing robustness', () => {
			const buildSmilWithMeta = (metaAttrs: string): string => `
				<smil>
					<head>
						<meta http-equiv="Refresh" content="90" ${metaAttrs}/>
						<layout>
							<root-layout width="1920" height="1080"/>
							<region regionName="video" left="0" top="0" width="1920" height="1080"/>
						</layout>
					</head>
					<body>
						<par>
							<seq repeatCount="indefinite">
								<img src="http://example.com/image.png" dur="5s" region="video"/>
							</seq>
						</par>
					</body>
				</smil>`;

			it('Should drop non-numeric entries so a malformed list parses as empty (gate warn-once can fire)', async () => {
				const wrongSeparator: any = await xmlParser.processSmilXml(
					buildSmilWithMeta('skipPlaybackOnHttpStatus="404;500"'),
				);
				expect(wrongSeparator.skipPlaybackOnHttpStatus).to.be.eql([]);

				const nonNumeric: any = await xmlParser.processSmilXml(buildSmilWithMeta('skipPlaybackOnHttpStatus="abc"'));
				expect(nonNumeric.skipPlaybackOnHttpStatus).to.be.eql([]);
			});

			it('Should drop empty segments so status 0 never enters the list', async () => {
				const smilObject: any = await xmlParser.processSmilXml(
					buildSmilWithMeta('skipPlaybackOnHttpStatus="404,,410"'),
				);
				expect(smilObject.skipPlaybackOnHttpStatus).to.be.eql([404, 410]);
			});

			it('Should keep parsing lists with spaces after commas', async () => {
				const smilObject: any = await xmlParser.processSmilXml(
					buildSmilWithMeta('skipPlaybackOnHttpStatus="404, 500"'),
				);
				expect(smilObject.skipPlaybackOnHttpStatus).to.be.eql([404, 500]);
			});

			it('Should not crash SMIL parsing when the value coerces to a boolean (parseBooleans)', async () => {
				// xml2js attrValueProcessors: [parseBooleans] turns "true"/"false" into booleans - .split would throw
				const smilObject: any = await xmlParser.processSmilXml(
					buildSmilWithMeta(
						'skipPlaybackOnHttpStatus="true" skipContentOnHttpStatus="true" updateContentOnHttpStatus="true"',
					),
				);
				expect(smilObject.skipPlaybackOnHttpStatus).to.be.eql([]);
				expect(smilObject.skipContentOnHttpStatus).to.be.eql([]);
				expect(smilObject.updateContentOnHttpStatus).to.be.eql([]);
			});

			it('Should harden skipContentOnHttpStatus and updateContentOnHttpStatus the same way', async () => {
				const smilObject: any = await xmlParser.processSmilXml(
					buildSmilWithMeta('skipContentOnHttpStatus="404;500" updateContentOnHttpStatus="404,,abc,410"'),
				);
				expect(smilObject.skipContentOnHttpStatus).to.be.eql([]);
				expect(smilObject.updateContentOnHttpStatus).to.be.eql([404, 410]);
			});
		});

		it('Should parse playCheckUrl attribute onto the media object only where present', async () => {
			const xmlFile: string = await fsPromise.readFile('test/mocks/xmlParserMock/playCheckGate.smil', 'utf8');
			const smilObject: any = await xmlParser.processSmilXml(xmlFile);
			expect(smilObject.video[0].playCheckUrl).to.be.eql('http://example.com/play-check/video');
			expect(smilObject.img[0].playCheckUrl).to.be.eql(undefined);
		});

		it('Should parse nested regions correctly -  single region fixed values', async () => {
			let testingRegion: any = {
				regionName: 'video',
				left: '10',
				top: '10',
				width: '1280',
				height: '720',
				'z-index': '1',
				backgroundColor: '#FFFFFF',
				mediaAlign: 'topLeft',
				region: {
					regionName: 'video1',
					left: '0',
					top: '0',
					width: '640',
					height: '720',
					'z-index': '1',
					backgroundColor: 'transparent',
				},
			};

			testingRegion = parseNestedRegions(testingRegion);

			// first region
			expect(testingRegion.region[0].top).to.be.eql(10);
			expect(testingRegion.region[0].left).to.be.eql(10);
			expect(testingRegion.region[0].width).to.be.eql(640);
			expect(testingRegion.region[0].height).to.be.eql(720);
		});

		it('Should parse nested regions correctly - multiple regions fixed values', async () => {
			let testingRegion: any = {
				regionName: 'video',
				left: '10',
				top: '10',
				width: '1280',
				height: '720',
				'z-index': '1',
				backgroundColor: '#FFFFFF',
				mediaAlign: 'topLeft',
				region: [
					{
						regionName: 'video1',
						left: '0',
						top: '0',
						width: '640',
						height: '720',
						'z-index': '1',
						backgroundColor: 'transparent',
					},
					{
						regionName: 'video2',
						left: '640',
						top: '0',
						width: '640',
						height: '720',
						'z-index': '1',
						backgroundColor: 'transparent',
					},
				],
			};

			testingRegion = parseNestedRegions(testingRegion);

			// first region
			expect(testingRegion.region[0].top).to.be.eql(10);
			expect(testingRegion.region[0].left).to.be.eql(10);
			expect(testingRegion.region[0].width).to.be.eql(640);
			expect(testingRegion.region[0].height).to.be.eql(720);

			// second region
			expect(testingRegion.region[1].top).to.be.eql(10);
			expect(testingRegion.region[1].left).to.be.eql(650);
			expect(testingRegion.region[1].width).to.be.eql(640);
			expect(testingRegion.region[1].height).to.be.eql(720);
		});

		it('Should parse nested regions correctly - multiple regions percentage values', async () => {
			let testingRegion: any = {
				regionName: 'video',
				left: '10',
				top: '10',
				width: '1280',
				height: '720',
				'z-index': '1',
				backgroundColor: '#FFFFFF',
				mediaAlign: 'topLeft',
				region: [
					{
						regionName: 'video1',
						left: '10%',
						top: '10%',
						width: '50%',
						height: '100%',
						'z-index': '1',
						backgroundColor: 'transparent',
					},
					{
						regionName: 'video2',
						left: '10%',
						top: '0%',
						width: '50%',
						height: '50%',
						'z-index': '1',
						backgroundColor: 'transparent',
					},
				],
			};

			testingRegion = parseNestedRegions(testingRegion);

			// first region
			expect(testingRegion.region[0].top).to.be.eql(82);
			expect(testingRegion.region[0].left).to.be.eql(138);
			expect(testingRegion.region[0].width).to.be.eql(640);
			expect(testingRegion.region[0].height).to.be.eql(720);

			// second region
			expect(testingRegion.region[1].top).to.be.eql(10);
			expect(testingRegion.region[1].left).to.be.eql(138);
			expect(testingRegion.region[1].width).to.be.eql(640);
			expect(testingRegion.region[1].height).to.be.eql(360);
		});

		it('Should parse nested regions correctly - multiple regions bottom, right fixed values', async () => {
			let testingRegion: any = {
				regionName: 'video',
				left: '10',
				top: '10',
				width: '1280',
				height: '720',
				'z-index': '1',
				backgroundColor: '#FFFFFF',
				mediaAlign: 'topLeft',
				region: [
					{
						regionName: 'video1',
						right: '50',
						bottom: '100',
						width: '640',
						height: '320',
						'z-index': '1',
						backgroundColor: 'transparent',
					},
					{
						regionName: 'video2',
						right: '300',
						bottom: '100',
						width: '640',
						height: '720',
						'z-index': '1',
						backgroundColor: 'transparent',
					},
				],
			};

			testingRegion = parseNestedRegions(testingRegion);

			// first region
			expect(testingRegion.region[0].top).to.be.eql(310);
			expect(testingRegion.region[0].left).to.be.eql(590);
			expect(testingRegion.region[0].width).to.be.eql(640);
			expect(testingRegion.region[0].height).to.be.eql(320);

			// second region
			expect(testingRegion.region[1].top).to.be.eql(10);
			expect(testingRegion.region[1].left).to.be.eql(340);
			expect(testingRegion.region[1].width).to.be.eql(640);
			expect(testingRegion.region[1].height).to.be.eql(720);
		});

		it('Should parse nested regions correctly - multiple regions bottom, right percentage values', async () => {
			let testingRegion: any = {
				regionName: 'video',
				left: '10',
				top: '10',
				width: '1280',
				height: '720',
				'z-index': '1',
				backgroundColor: '#FFFFFF',
				mediaAlign: 'topLeft',
				region: [
					{
						regionName: 'video1',
						right: '10%',
						bottom: '10%',
						width: '50%',
						height: '50%',
						'z-index': '1',
						backgroundColor: 'transparent',
					},
					{
						regionName: 'video2',
						right: '0%',
						bottom: '0%',
						width: '50%',
						height: '50%',
						'z-index': '1',
						backgroundColor: 'transparent',
					},
				],
			};

			testingRegion = parseNestedRegions(testingRegion);

			// first region
			expect(testingRegion.region[0].top).to.be.eql(298);
			expect(testingRegion.region[0].left).to.be.eql(522);
			expect(testingRegion.region[0].width).to.be.eql(640);
			expect(testingRegion.region[0].height).to.be.eql(360);

			// second region
			expect(testingRegion.region[1].top).to.be.eql(370);
			expect(testingRegion.region[1].left).to.be.eql(650);
			expect(testingRegion.region[1].width).to.be.eql(640);
			expect(testingRegion.region[1].height).to.be.eql(360);
		});

		describe('mergeLoggerWithConfigReportUrl', () => {
			const configReportUrl = 'https://config.example.com/report';

			it('Should keep meta logging types and override endpoint with config reportUrl', () => {
				const merged = mergeLoggerWithConfigReportUrl(
					{
						enabled: true,
						type: [smilLogging.proofOfPlay, smilLogging.standard],
						endpoint: 'https://meta.example.com/report',
						reportFileLimit: 50,
					},
					configReportUrl,
				);
				expect(merged.type).to.be.eql([smilLogging.proofOfPlay, smilLogging.standard]);
				expect(merged.endpoint).to.be.eql(configReportUrl);
				expect(merged.enabled).to.be.eql(true);
				expect(merged.reportFileLimit).to.be.eql(50);
			});

			it('Should add proofOfPlay type when meta requests only standard (reportUrl implies PoP)', () => {
				const merged = mergeLoggerWithConfigReportUrl(
					{
						enabled: true,
						type: [smilLogging.standard],
						reportFileLimit: 100,
					},
					configReportUrl,
				);
				expect(merged.type).to.be.eql([smilLogging.standard, smilLogging.proofOfPlay]);
				expect(merged.endpoint).to.be.eql(configReportUrl);
			});

			it('Should force enabled when config reportUrl is set, matching config-only precedence', () => {
				const merged = mergeLoggerWithConfigReportUrl(
					{
						enabled: false,
						type: [smilLogging.proofOfPlay],
						reportFileLimit: 100,
					},
					configReportUrl,
				);
				expect(merged.enabled).to.be.eql(true);
			});

			it('Should default type to proofOfPlay when meta logger has no type', () => {
				const merged = mergeLoggerWithConfigReportUrl(
					{
						enabled: true,
						reportFileLimit: 100,
					},
					configReportUrl,
				);
				expect(merged.type).to.be.eql([smilLogging.proofOfPlay]);
			});

			it('Should keep the meta events allowlist when merging with config reportUrl', () => {
				const merged = mergeLoggerWithConfigReportUrl(
					{
						enabled: true,
						type: [smilLogging.proofOfPlay],
						reportFileLimit: 100,
						events: ['media-playback', 'media-copied'],
					},
					configReportUrl,
				);
				expect(merged.events).to.be.eql(['media-playback', 'media-copied']);
			});
		});
	});

	describe('containsElement', () => {
		it('Should return true when element with matching src exists', () => {
			const arr: any[] = [
				{ src: 'https://example.com/video1.mp4' },
				{ src: 'https://example.com/video2.mp4' },
			];
			expect(containsElement(arr, 'https://example.com/video1.mp4')).to.equal(true);
		});

		it('Should return false when no match', () => {
			const arr: any[] = [
				{ src: 'https://example.com/video1.mp4' },
			];
			expect(containsElement(arr, 'https://example.com/notfound.mp4')).to.equal(false);
		});

		it('Should return false for empty array', () => {
			expect(containsElement([], 'https://example.com/video.mp4')).to.equal(false);
		});
	});

	describe('extractRegionInfo', () => {
		it('Should extract single region with regionName', () => {
			const xmlObject: any = {
				region: {
					regionName: 'video',
					left: 0,
					top: 0,
					width: 1920,
					height: 1080,
				},
			};
			const result = extractRegionInfo(xmlObject);
			expect(result.region).to.have.property('video');
			expect(result.region.video.regionName).to.equal('video');
		});

		it('Should extract multiple regions (array) with regionName', () => {
			const xmlObject: any = {
				region: [
					{ regionName: 'video', left: 0, top: 0, width: 960, height: 1080 },
					{ regionName: 'widget', left: 960, top: 0, width: 960, height: 1080 },
				],
			};
			const result = extractRegionInfo(xmlObject);
			expect(result.region).to.have.property('video');
			expect(result.region).to.have.property('widget');
		});

		it('Should extract region using xml:id alias instead of regionName', () => {
			const xmlObject: any = {
				region: {
					'xml:id': 'aliasRegion',
					left: 0,
					top: 0,
					width: 1920,
					height: 1080,
				},
			};
			const result = extractRegionInfo(xmlObject);
			expect(result.region).to.have.property('aliasRegion');
		});

		it('Should extract rootLayout with default top, left, and regionName', () => {
			const xmlObject: any = {
				'root-layout': {
					width: '1920',
					height: '1080',
					backgroundColor: '#000000',
				},
			};
			const result = extractRegionInfo(xmlObject);
			expect(result.rootLayout).to.not.equal(undefined);
			expect(result.rootLayout!.top).to.equal('0');
			expect(result.rootLayout!.left).to.equal('0');
			expect(result.rootLayout!.regionName).to.equal('rootLayout');
		});
	});

	describe('extractTransitionsInfo', () => {
		it('Should extract single transition with transitionName', () => {
			const xmlObject: any = {
				transition: {
					transitionName: 'fadeIn',
					type: 'fade',
					subtype: 'crossfade',
					dur: '1s',
				},
			};
			const result = extractTransitionsInfo(xmlObject);
			expect(result.transition).to.have.property('fadeIn');
			expect(result.transition.fadeIn.type).to.equal('fade');
		});

		it('Should extract multiple transitions (array)', () => {
			const xmlObject: any = {
				transition: [
					{ transitionName: 'fadeIn', type: 'fade', subtype: 'crossfade', dur: '1s' },
					{ transitionName: 'wipeLeft', type: 'wipe', subtype: 'leftToRight', dur: '2s' },
				],
			};
			const result = extractTransitionsInfo(xmlObject);
			expect(result.transition).to.have.property('fadeIn');
			expect(result.transition).to.have.property('wipeLeft');
			expect(result.transition.wipeLeft.dur).to.equal('2s');
		});

		it('Should extract transition using xml:id alias', () => {
			const xmlObject: any = {
				transition: {
					'xml:id': 'aliasTrans',
					type: 'fade',
					subtype: 'crossfade',
					dur: '1s',
				},
			};
			const result = extractTransitionsInfo(xmlObject);
			expect(result.transition).to.have.property('aliasTrans');
		});
	});
});
