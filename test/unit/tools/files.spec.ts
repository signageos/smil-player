import * as chai from 'chai';
import { getFileName } from "../../../src/components/files/tools";

const expect = chai.expect;

describe('Files tools component', () => {

	describe('Files tools component getFileName tests', () => {
		it('Should return correct file name for vairous strings', () => {
			const filesPaths = [
				`https://butikstv.centrumkanalen.com/play/smil/234.smil`,
				`http://butikstv.centrumkanalen.com/play/media/rendered/bilder/10826.png`,
				'localFile/inFolder/something//myfile.txt',
				'../file.png',
				'./../../../idontknow.mp3',
				'fileName.mp4',
			];
			const fileNames = [
				'234.smil',
				'10826.png',
				'myfile.txt',
				'file.png',
				'idontknow.mp3',
				'fileName.mp4',
			];

			for (let i = 0; i < filesPaths.length; i += 1) {
				const response = getFileName(filesPaths[i]);
				expect(response).to.be.equal(fileNames[i]);
			}
		});

	});
});
