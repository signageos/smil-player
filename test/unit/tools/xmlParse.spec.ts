import { promises as fsPromise } from 'fs';
import { XmlParser } from '../../../src/components/xmlParser/xmlParser';
import { parseNestedRegions } from '../../../src/components/xmlParser/tools';
import { mockSMILFileParsed234 } from '../../mocks/playlistMock/mock234';
import { mockSMILFileParsed99 } from '../../mocks/playlistMock/mock99';
import { mockSMILFileParsedRegionAlias } from '../../mocks/playlistMock/mockRegionAlias';
import { mockSMILFileTriggers } from '../../mocks/playlistMock/mockTriggers';
import { mockBrokenSmil } from '../../mocks/playlistMock/mockBrokenSmil';
import { triggerRfid } from '../../mocks/playlistMock/mockTriggerRfId';

import * as chai from 'chai';

const expect = chai.expect;
const xmlParser = new XmlParser();
describe('XmlParse tools component', () => {

	describe('XmlParse tools component tests', () => {
		it('Should parse whole xml file correctly file broken smil', async () => {
			const xmlFile: string = await fsPromise.readFile('test/mocks/xmlParserMock/broken.smil', 'utf8');
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
			const xmlFile: string = await fsPromise.readFile('test/mocks/xmlParserMock/triggers.smil', 'utf8');
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
			const xmlFile: string = await fsPromise.readFile('test/mocks/xmlParserMock/234.smil', 'utf8');
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
			const xmlFile: string = await fsPromise.readFile('test/mocks/xmlParserMock/regionAlias.smil', 'utf8');
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
			const xmlFile: string = await fsPromise.readFile('test/mocks/xmlParserMock/99.smil', 'utf8');
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

		it('Should parse nested regions correctly -  single region fixed values', async () => {
			let testingRegion: any = {
				regionName: "video",
				left: "10",
				top: "10",
				width: "1280",
				height: "720",
				"z-index": "1",
				backgroundColor: "#FFFFFF",
				mediaAlign: "topLeft",
				region: {
					regionName: "video1",
					left: "0",
					top: "0",
					width: "640",
					height: "720",
					"z-index": "1",
					backgroundColor: "transparent",
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
				regionName: "video",
				left: "10",
				top: "10",
				width: "1280",
				height: "720",
				"z-index": "1",
				backgroundColor: "#FFFFFF",
				mediaAlign: "topLeft",
				region: [{
					regionName: "video1",
					left: "0",
					top: "0",
					width: "640",
					height: "720",
					"z-index": "1",
					backgroundColor: "transparent",
				}, {
					regionName: "video2",
					left: "640",
					top: "0",
					width: "640",
					height: "720",
					"z-index": "1",
					backgroundColor: "transparent",
				}],
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
				regionName: "video",
				left: "10",
				top: "10",
				width: "1280",
				height: "720",
				"z-index": "1",
				backgroundColor: "#FFFFFF",
				mediaAlign: "topLeft",
				region: [{
					regionName: "video1",
					left: "10%",
					top: "10%",
					width: "50%",
					height: "100%",
					"z-index": "1",
					backgroundColor: "transparent",
				}, {
					regionName: "video2",
					left: "10%",
					top: "0%",
					width: "50%",
					height: "50%",
					"z-index": "1",
					backgroundColor: "transparent",
				}],
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
				regionName: "video",
				left: "10",
				top: "10",
				width: "1280",
				height: "720",
				"z-index": "1",
				backgroundColor: "#FFFFFF",
				mediaAlign: "topLeft",
				region: [{
					regionName: "video1",
					right: "50",
					bottom: "100",
					width: "640",
					height: "320",
					"z-index": "1",
					backgroundColor: "transparent",
				}, {
					regionName: "video2",
					right: "300",
					bottom: "100",
					width: "640",
					height: "720",
					"z-index": "1",
					backgroundColor: "transparent",
				}],
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
				regionName: "video",
				left: "10",
				top: "10",
				width: "1280",
				height: "720",
				"z-index": "1",
				backgroundColor: "#FFFFFF",
				mediaAlign: "topLeft",
				region: [{
					regionName: "video1",
					right: "10%",
					bottom: "10%",
					width: "50%",
					height: "50%",
					"z-index": "1",
					backgroundColor: "transparent",
				}, {
					regionName: "video2",
					right: "0%",
					bottom: "0%",
					width: "50%",
					height: "50%",
					"z-index": "1",
					backgroundColor: "transparent",
				}],
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
	});
});
