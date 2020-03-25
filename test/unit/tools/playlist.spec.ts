import * as chai from 'chai';
import {defaults as config} from '../../../src/config';
import {getRegionInfo} from "../../../src/components/playlist/tools";

const expect = chai.expect;

describe('Playlist tools component', () => {

	describe('Playlist tools component tests', () => {
		it('Should return default region for non-existing region name', () => {
			const testingRegionObject = {
				region: {},
			};
			const response = getRegionInfo(testingRegionObject, 'InvalidRegionName');
			expect(response).to.be.equal(config.constants.defaultRegion);
		});
	});
});
