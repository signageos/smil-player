import * as chai from 'chai';
import { createDownloadPath, getFileName, getPath, isValidLocalPath } from '../../../src/components/files/tools';

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

		it('Should validate given path', () => {
			const validFilesPaths = [
				'bucketname/filename.ext',
				'bucket.name/filename.ext',
				'bucket.name/dir1/filename.ext',
				'bucket.name/dir2/filename.ext',
				'bucket.name/2015-01-17/15.00_description.ext',
				'valid.bucket.name._-0123456789/filename.ext',
				'filename',
				'filename.mp4',
				'test/file/name/testing.mp3',
				'test/file/name/testing',
			];

			for (let i = 0; i < validFilesPaths.length; i += 1) {
				const response = isValidLocalPath(validFilesPaths[i]);
				expect(response).to.be.equal(true);
			}

			const invalidFilesPaths = [
				'/bucket.name/dir/filename',
				'/bucket.name/dir/filename/',
				'.bucket.name/dir/filename.ext',
				'bucket*name/filename.ext',
				'adapi:blankScreen',
				'bucket*name/fi<>lename.ext',
				'bucket*name/fil::ename.ext',
				'adapi:blankScreen/mp4.mp4',
				'adapi:blankScreen/mp4',
				'C:\\dir1\\blah.txt',
			];

			for (let i = 0; i < invalidFilesPaths.length; i += 1) {
				const response = isValidLocalPath(invalidFilesPaths[i]);
				expect(response).to.be.equal(false);
			}
		});

		it('Should return valid path', () => {
			const validUrls = [
				'https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/samples/assets/landscape2.jpg',
				'https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/samples/assets/portrait2.mp4',
				'https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/samples/assets/landscape1.wgt',
			];

			for (let i = 0; i < validUrls.length; i += 1) {
				const response = createDownloadPath(validUrls[i]);
				const responseNumber: number = parseInt(response.split('?v=')[1]);
				expect(responseNumber).to.be.lessThan(1000000);
				expect(responseNumber > 0).to.be.equal(true);
			}
		});

	});
});
