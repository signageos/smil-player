import * as chai from 'chai';
import moment from 'moment';
import MockDate from 'mockdate';

import { checkConditionalExprSafe } from '../../../src/components/playlist/tools/conditionalTools';

const expect = chai.expect;

describe('Playlist tools checkConditionalExprSafe', () => {
	beforeEach(() => {
		MockDate.set(new Date('2021-04-22T12:00:00'));
	});

	afterEach(() => {
		MockDate.reset();
	});

	describe('Playlist tools component checkConditionalExprSafe advanced conditions', () => {
		it('Should return correct response', () => {
			let dayOfWeek = moment().isoWeekday() % 7;
			let testExpression = `[ adapi-weekday()&gt;=${dayOfWeek} or adapi-weekday()&gt;${dayOfWeek} ] and [ adapi-weekday()&gt;=${dayOfWeek} and adapi-weekday()&lt;=${dayOfWeek} ]`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			testExpression = `[ adapi-weekday()&gt;=${dayOfWeek} and adapi-weekday()&gt;${dayOfWeek} ] or [ adapi-weekday()&gt;=${dayOfWeek} and adapi-weekday()&lt;=${dayOfWeek} ]`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			testExpression = `[ adapi-weekday()&gt;=${dayOfWeek} and adapi-weekday()&gt;${dayOfWeek} ] and [ adapi-weekday()&gt;=${dayOfWeek} and adapi-weekday()&lt;=${dayOfWeek} ]`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);
		});
	});

	describe('nested bracket conditions with weekdays', () => {
		it('Should return correct response', () => {
			let dayOfWeek = moment().isoWeekday() % 7;
			let testExpression = `[[[ adapi-weekday()&gt;=${dayOfWeek} or adapi-weekday()&gt;${dayOfWeek} ] and [ adapi-weekday()&gt;=${dayOfWeek} and adapi-weekday()&lt;=${dayOfWeek} ]]
			and [ adapi-weekday()&gt;=${dayOfWeek} or adapi-weekday()&lt;${dayOfWeek}]] and adapi-weekday()&gt;=${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			testExpression = `[[[ adapi-weekday()&gt;=${dayOfWeek} or adapi-weekday()&gt;${dayOfWeek} ] and [ adapi-weekday()&gt;=${dayOfWeek} and adapi-weekday()&lt;=${dayOfWeek} ]]
			and [ adapi-weekday()&gt;${dayOfWeek} or adapi-weekday()&lt;${dayOfWeek}]] and adapi-weekday()&gt;=${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			testExpression = `adapi-weekday()&gt;=${dayOfWeek} and [[[ adapi-weekday()&gt;=${dayOfWeek} or adapi-weekday()&gt;${dayOfWeek} ] and [ adapi-weekday()&gt;=${dayOfWeek} and adapi-weekday()&lt;=${dayOfWeek} ]]
			and [ adapi-weekday()&gt;${dayOfWeek} or adapi-weekday()&lt;${dayOfWeek}]]`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			testExpression = `[[[ adapi-weekday()&gt;=${dayOfWeek} OR adapi-weekday()&gt;${dayOfWeek} ] AND [ adapi-weekday()&gt;=${dayOfWeek} AND adapi-weekday()&lt;=${dayOfWeek} ]]
			AND [ adapi-weekday()&gt;=${dayOfWeek} OR adapi-weekday()&lt;${dayOfWeek}]] AND adapi-weekday()&gt;=${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);
		});
	});

	describe('bracket conditions with time comparisons', () => {
		it('Should return correct response', () => {
			let dayTime = moment().subtract(1, 'hour').format('HH:mm:ss');
			let testExpression = `[adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))&lt;=0] AND [adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))&lt;=0]`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			testExpression = `[adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))&lt;=0] OR [adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))&lt;=0]`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			testExpression = `[adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))&gt;=0] AND [adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))&lt;=0]`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);
		});
	});

	describe('bracket conditions with date comparisons', () => {
		it('Should return correct response', () => {
			let testExpression =
				"[adapi-compare(adapi-date(), '2030-01-01T00:00:00')&gt;0 OR adapi-compare(adapi-date(), '2030-01-01T00:00:00')&lt;0]";
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			testExpression =
				"[adapi-compare(adapi-date(), '2030-01-01T00:00:00')&gt;0 AND adapi-compare(adapi-date(), '2030-01-01T00:00:00')&lt;0]";
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			testExpression =
				"adapi-compare(adapi-date(), '2030-01-01T00:00:00')&gt;0 AND [adapi-compare(adapi-date(), '2030-01-01T00:00:00')&gt;0 OR adapi-compare(adapi-date(), '2030-01-01T00:00:00')&lt;0]";
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);
		});
	});
});
