import * as chai from 'chai';
import * as playlist from '../../../src/tools/playlist';
const expect = chai.expect;

describe('Playlist tools component', () => {

	describe('Playlist tools component tests', () => {
		it('Should return default region for non-existing region name', () => {
			const testingRegionObject = {
				region: {},
			};
			const defaultRegion = {
				regionName: 'default',
				left: 0,
				top: 0,
				width: 1280,
				height: 720,
			};
			const response = playlist.getRegionInfo(testingRegionObject, 'InvalidRegionName');
			expect(response).to.be.equal(defaultRegion);
		});
	});
});
