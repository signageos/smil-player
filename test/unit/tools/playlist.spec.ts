import * as chai from 'chai';
import isNil = require('lodash/isNil');
import { getRegionInfo, sleep, runEndlessLoop, disableLoop } from "../../../src/components/playlist/tools";
import { mockSMILFileParsed234 } from '../../../src/components/playlist/mock/mock234';

const expect = chai.expect;

describe('Playlist tools component', () => {

	describe('Playlist tools component getRegionInfo tests', () => {
		it('Should return default region for non-existing region name', () => {

			let expectedRegion: any = mockSMILFileParsed234.rootLayout;
			expectedRegion = {
				...expectedRegion,
				...(!isNil(expectedRegion.top) && { top: parseInt(expectedRegion.top)}),
				...(!isNil(expectedRegion.left) && { left: parseInt(expectedRegion.left)}),
				width: parseInt(expectedRegion.width),
				height: parseInt(expectedRegion.height),
			};

			const response = getRegionInfo(mockSMILFileParsed234, 'InvalidRegionName');
			expect(response).to.eql(expectedRegion);
		});

		it('Should return correct region for existing region name', () => {

			let expectedRegion: any = mockSMILFileParsed234.region.video;
			expectedRegion = {
				...expectedRegion,
				...(!isNil(expectedRegion.top) && { top: parseInt(expectedRegion.top)}),
				...(!isNil(expectedRegion.left) && { left: parseInt(expectedRegion.left)}),
				width: parseInt(expectedRegion.width),
				height: parseInt(expectedRegion.height),
			};

			const response = getRegionInfo(mockSMILFileParsed234, 'video');
			expect(response).to.eql(expectedRegion);
		});
	});

	describe('Playlist tools component sleep tests', () => {
		it('Should return wait specified amount of time', async () => {
			const interval = 1000;
			const start = Date.now();
			await sleep(interval);
			const end = Date.now();
			const timeWaited = end - start;
			expect(Math.abs(interval - timeWaited)).to.be.lessThan(50);
		});
	});

	describe('Playlist tools component runEndlessLoop, disableLoop tests', () => {
		it('Should stop endless loop after given amount of time', async () => {
			const interval = 1000;
			const start = Date.now();
			await runEndlessLoop( async () => {
				await sleep(interval);
				disableLoop(true);
			});
			const end = Date.now();
			const timeWaited = end - start;
			expect(Math.abs(interval - timeWaited)).to.be.lessThan(50);
		});
	});
});
