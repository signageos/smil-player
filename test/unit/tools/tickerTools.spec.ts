import * as chai from 'chai';
import {
	computeTickerTextTop,
	isTextBehindLeftEdge,
	resolveSpaceBetweenTexts,
	resolveSpeedPxPerSec,
	resolveTickerFontSize,
} from '../../../src/components/playlist/tools/tickerTools';

const expect = chai.expect;

describe('tickerTools', () => {
	describe('resolveTickerFontSize', () => {
		it('uses an explicit integer font size (ignoring clientHeight)', () => {
			expect(resolveTickerFontSize('24', 100)).to.equal(24);
		});

		it('parses a trailing-unit font size ("30px" -> 30)', () => {
			expect(resolveTickerFontSize('30px', 100)).to.equal(30);
		});

		it('falls back to round(clientHeight * 0.6) when font size is undefined', () => {
			expect(resolveTickerFontSize(undefined, 100)).to.equal(60); // 100 * 0.6
		});

		it('falls back to round(clientHeight * 0.6) when font size is non-numeric ("auto")', () => {
			expect(resolveTickerFontSize('auto', 200)).to.equal(120); // 200 * 0.6
		});

		it('rounds the ratio fallback', () => {
			expect(resolveTickerFontSize('', 101)).to.equal(61); // round(101 * 0.6) = round(60.6)
		});
	});

	describe('resolveSpaceBetweenTexts', () => {
		it('uses an explicit integer indentation', () => {
			expect(resolveSpaceBetweenTexts('50')).to.equal(50);
		});

		it('defaults to 100 when indentation is undefined', () => {
			expect(resolveSpaceBetweenTexts(undefined)).to.equal(100);
		});

		it('defaults to 100 when indentation is non-numeric ("auto")', () => {
			expect(resolveSpaceBetweenTexts('auto')).to.equal(100);
		});
	});

	describe('resolveSpeedPxPerSec', () => {
		it('uses an explicit integer velocity', () => {
			expect(resolveSpeedPxPerSec('200')).to.equal(200);
		});

		it('defaults to 100 when velocity is undefined', () => {
			expect(resolveSpeedPxPerSec(undefined)).to.equal(100);
		});

		it('defaults to 100 when velocity is non-numeric ("fast")', () => {
			expect(resolveSpeedPxPerSec('fast')).to.equal(100);
		});
	});

	describe('computeTickerTextTop', () => {
		it('vertically centers the text within the wrapper', () => {
			expect(computeTickerTextTop({ clientHeight: 100, fontSize: 20 })).to.equal(40); // 100/2 - 20/2
		});

		it('rounds the centered position', () => {
			expect(computeTickerTextTop({ clientHeight: 101, fontSize: 20 })).to.equal(41); // round(50.5 - 10) = round(40.5)
		});
	});

	describe('isTextBehindLeftEdge', () => {
		it('is true once the text right edge passes the left boundary', () => {
			expect(isTextBehindLeftEdge({ left: -50, width: 10 })).to.equal(true); // -40 < 0
		});

		it('is false while any part of the text is still visible', () => {
			expect(isTextBehindLeftEdge({ left: -5, width: 10 })).to.equal(false); // 5 < 0 is false
		});

		it('treats the exact edge (left + width === 0) as not yet behind', () => {
			expect(isTextBehindLeftEdge({ left: -10, width: 10 })).to.equal(false); // 0 < 0 is false
		});
	});
});
