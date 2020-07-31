import { promises as fsPromise } from 'fs';
import { processSmil } from '../../../src/components/xmlParser/xmlParse';
import { mockSMILFileParsed234 } from '../../../src/components/playlist/mock/mock234';
import { mockSMILFileParsed99 } from '../../../src/components/playlist/mock/mock99';
import { mockSMILFileParsedRegionAlias } from '../../../src/components/playlist/mock/mockRegionAlias';

import * as chai from 'chai';

const expect = chai.expect;
describe('XmlParse tools component', () => {

	describe('XmlParse tools component tests', () => {
		it('Should parse whole xml file correctly file 234', async () => {
			const xmlFile: string = await fsPromise.readFile('src/components/xmlParser/mock/234.smil', 'utf8');
			const smilObject = await processSmil(xmlFile);
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
			const xmlFile: string = await fsPromise.readFile('src/components/xmlParser/mock/regionAlias.smil', 'utf8');
			const smilObject = await processSmil(xmlFile);
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
			const xmlFile: string = await fsPromise.readFile('src/components/xmlParser/mock/99.smil', 'utf8');
			const smilObject = await processSmil(xmlFile);
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
	});
});
