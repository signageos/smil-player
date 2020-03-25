import * as chai from 'chai';
import * as playlist from '../../../src/components/playlist/playlist';
import { defaults as config } from '../../../src/config';
const expect = chai.expect;

describe('Playlist tools component', () => {

	describe('Playlist tools component tests', () => {
		it('Should return default region for non-existing region name', () => {
			const testingRegionObject = {
				region: {},
			};
			const response = playlist.getRegionInfo(testingRegionObject, 'InvalidRegionName');
			expect(response).to.be.equal(config.constants.defaultRegion);
		});
	});
});
