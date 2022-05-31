import * as chai from 'chai';
import { parseRFC5545Duration } from '../../../src/components/playlist/tools/rfc5545';

const expect = chai.expect;

describe('Playlist tools RFC 5545', function () {
	describe('parseRFC5545Duration', function () {
		// milliseconds representation
		const SECOND = 1e3;
		const MINUTE = 60 * SECOND;
		const HOUR = 60 * MINUTE;
		const DAY = 24 * HOUR;
		const WEEK = 7 * DAY;

		const testCases = [
			['P1D', DAY],
			['P1W', WEEK],
			['P1D1W', DAY + WEEK],
			['P1DT2H20M55S', DAY + 2 * HOUR + 20 * MINUTE + 55 * SECOND],
			['P2DT2H0M55S', 2 * DAY + 2 * HOUR + 55 * SECOND],
			['P1DT2H20M0S', DAY + 2 * HOUR + 20 * MINUTE],
			['P1DT2H20M', DAY + 2 * HOUR + 20 * MINUTE],
			['P1DT2H', DAY + 2 * HOUR],
			['PT3H', 3 * HOUR],
			['PT2H20M', 2 * HOUR + 20 * MINUTE],
		] as const;

		testCases.forEach(([str, ms]) =>
			it(`should parse ${str} as ${ms}`, function () {
				expect(parseRFC5545Duration(str)).equal(ms);
			}),
		);
	});
});
