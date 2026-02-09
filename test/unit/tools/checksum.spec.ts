import * as chai from 'chai';
import { checksumString } from '../../../src/components/files/tools/checksum';

const expect = chai.expect;

describe('checksumString', () => {
	it('Should return consistent hash for same input', () => {
		const hash1 = checksumString('https://example.com/video.mp4');
		const hash2 = checksumString('https://example.com/video.mp4');
		expect(hash1).to.equal(hash2);
	});

	it('Should produce different hashes for different inputs', () => {
		const hash1 = checksumString('https://example.com/video1.mp4');
		const hash2 = checksumString('https://example.com/video2.mp4');
		expect(hash1).to.not.equal(hash2);
	});

	it('Should truncate output to default length of 50', () => {
		const hash = checksumString('test-input');
		expect(hash).to.have.lengthOf(50);
	});

	it('Should truncate output to custom length', () => {
		const hash = checksumString('test-input', 8);
		expect(hash).to.have.lengthOf(8);
	});

	it('Should produce valid hex hash for empty string', () => {
		const hash = checksumString('');
		expect(hash).to.match(/^[0-9a-f]+$/);
		expect(hash).to.have.lengthOf(50);
	});
});
