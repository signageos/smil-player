// Set up JSDOM before importing modules that use document
const { JSDOM } = require('jsdom');
if (typeof (global as any).document === 'undefined') {
	const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
	(global as any).window = dom.window;
	(global as any).document = dom.window.document;
	(global as any).navigator = dom.window.navigator;
}

import * as chai from 'chai';
import { fixVideoDimension } from '../../../src/components/playlist/tools/generalTools';
import { RegionAttributes } from '../../../src/models/xmlJsonModels';

const expect = chai.expect;

describe('fixVideoDimension', () => {
	// Override clientWidth/clientHeight for deterministic tests
	let originalClientWidth: number;
	let originalClientHeight: number;

	before(() => {
		originalClientWidth = document.documentElement.clientWidth;
		originalClientHeight = document.documentElement.clientHeight;
		Object.defineProperty(document.documentElement, 'clientWidth', { value: 1920, configurable: true });
		Object.defineProperty(document.documentElement, 'clientHeight', { value: 1080, configurable: true });
	});

	after(() => {
		Object.defineProperty(document.documentElement, 'clientWidth', { value: originalClientWidth, configurable: true });
		Object.defineProperty(document.documentElement, 'clientHeight', { value: originalClientHeight, configurable: true });
	});

	it('should convert percentage width and height to pixels', () => {
		const region = {
			width: '50%',
			height: '50%',
			top: '0',
			left: '0',
			regionName: 'test',
		} as unknown as RegionAttributes;

		const result = fixVideoDimension(region);
		expect(result.width).to.equal(960);
		expect(result.height).to.equal(540);
	});

	it('should convert percentage left and top to pixels', () => {
		const region = {
			width: '100%',
			height: '100%',
			top: '25%',
			left: '10%',
			regionName: 'test',
		} as unknown as RegionAttributes;

		const result = fixVideoDimension(region);
		expect(result.top).to.equal(270);
		expect(result.left).to.equal(192);
	});

	it('should convert percentage bottom to computed top and remove bottom', () => {
		const region = {
			width: '50%',
			height: '50%',
			bottom: '0%',
			left: '0',
			regionName: 'test',
		} as unknown as RegionAttributes;

		const result = fixVideoDimension(region);
		// bottom=0% → top = clientHeight - (clientHeight * 0/100 + height)
		// top = 1080 - (0 + 540) = 540
		expect(result.top).to.equal(540);
		expect(result).to.not.have.property('bottom');
	});

	it('should convert percentage right to computed left and remove right', () => {
		const region = {
			width: '50%',
			height: '50%',
			right: '0%',
			top: '0',
			regionName: 'test',
		} as unknown as RegionAttributes;

		const result = fixVideoDimension(region);
		// right=0% → left = clientWidth - (clientWidth * 0/100 + width)
		// left = 1920 - (0 + 960) = 960
		expect(result.left).to.equal(960);
		expect(result).to.not.have.property('right');
	});

	it('should convert pixel-based bottom to top and remove bottom', () => {
		const region = {
			width: '400',
			height: '300',
			bottom: '100',
			left: '0',
			regionName: 'test',
		} as unknown as RegionAttributes;

		const result = fixVideoDimension(region);
		// top = clientHeight - (bottom + height) = 1080 - (100 + 300) = 680
		expect(result.top).to.equal(680);
		expect(result).to.not.have.property('bottom');
	});

	it('should convert pixel-based right to left and remove right', () => {
		const region = {
			width: '400',
			height: '300',
			right: '200',
			top: '0',
			regionName: 'test',
		} as unknown as RegionAttributes;

		const result = fixVideoDimension(region);
		// left = clientWidth - (right + width) = 1920 - (200 + 400) = 1320
		expect(result.left).to.equal(1320);
		expect(result).to.not.have.property('right');
	});

	it('should not modify pixel-based width, height, top, left', () => {
		const region = {
			width: '800',
			height: '600',
			top: '100',
			left: '200',
			regionName: 'test',
		} as unknown as RegionAttributes;

		const result = fixVideoDimension(region);
		expect(result.width).to.equal('800');
		expect(result.height).to.equal('600');
		expect(result.top).to.equal('100');
		expect(result.left).to.equal('200');
	});

	it('should not mutate the original region object', () => {
		const region = {
			width: '50%',
			height: '50%',
			top: '0',
			left: '0',
			regionName: 'test',
		} as unknown as RegionAttributes;

		fixVideoDimension(region);
		expect(region.width).to.equal('50%');
		expect(region.height).to.equal('50%');
	});

	it('should handle full-screen percentage region (100%)', () => {
		const region = {
			width: '100%',
			height: '100%',
			top: '0%',
			left: '0%',
			regionName: 'test',
		} as unknown as RegionAttributes;

		const result = fixVideoDimension(region);
		expect(result.width).to.equal(1920);
		expect(result.height).to.equal(1080);
		expect(result.top).to.equal(0);
		expect(result.left).to.equal(0);
	});

	it('should handle bottom=0 with pixel height (common signage pattern)', () => {
		const region = {
			width: '1920',
			height: '360',
			bottom: '0',
			left: '0',
			regionName: 'ticker',
		} as unknown as RegionAttributes;

		const result = fixVideoDimension(region);
		// top = 1080 - (0 + 360) = 720
		expect(result.top).to.equal(720);
		expect(result).to.not.have.property('bottom');
	});
});
