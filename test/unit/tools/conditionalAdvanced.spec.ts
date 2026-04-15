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

	describe('edge cases — malformed input and TODO behaviour [3H]', () => {
		// `checkConditionalExprSafe` documents a safety guarantee in its
		// outer try/catch: any parse failure returns `false` rather than
		// throwing. Lock that in for inputs the SMIL author can plausibly
		// produce by accident.
		//
		// Note: not every malformed shape actually throws — e.g. trailing
		// extra brackets like `expr]]` are silently tolerated by the
		// split-string library and the inner expression is evaluated
		// normally. The cases below pick shapes that DO trip the parser:
		// unbalanced opening bracket, unclosed paren in a function call.

		it('returns false for an unbalanced leading bracket', () => {
			expect(checkConditionalExprSafe('[[adapi-weekday()=4')).to.be.equal(false);
		});

		it('returns false for an unclosed paren in a function call', () => {
			expect(
				checkConditionalExprSafe("adapi-compare(adapi-date(), '2030-01-01T00:00:00'&lt;0"),
			).to.be.equal(false);
		});

		it('returns false for an empty expression', () => {
			expect(checkConditionalExprSafe('')).to.be.equal(false);
		});

		it('returns false for a whitespace-only expression', () => {
			expect(checkConditionalExprSafe('   ')).to.be.equal(false);
		});

		// Locks in the limitation flagged by the TODO at
		// src/components/playlist/tools/conditionalTools.ts:397 —
		// compareValues only knows how to compare against zero;
		// a non-zero literal in a `>N` / `<N` comparator slot has no
		// effect. So `>0` and `>99` produce the same result on the same
		// input. If the TODO is implemented (i.e. the literal becomes
		// load-bearing), this assertion will fail and the implementer
		// will know to update it.
		it('treats >0 and >99 identically (TODO at conditionalTools.ts:397)', () => {
			const futureExpr = (cmp: string) =>
				`adapi-compare(adapi-date(), '2030-01-01T00:00:00')${cmp}`;

			// adapi-date() at mocked now is < 2030-01-01, so adapi-compare
			// returns -1; both >0 and >99 evaluate to false because the
			// comparator only checks the sign.
			expect(checkConditionalExprSafe(futureExpr('&gt;0'))).to.be.equal(false);
			expect(checkConditionalExprSafe(futureExpr('&gt;99'))).to.be.equal(false);

			// And both <0 / <99 evaluate to true symmetrically.
			expect(checkConditionalExprSafe(futureExpr('&lt;0'))).to.be.equal(true);
			expect(checkConditionalExprSafe(futureExpr('&lt;99'))).to.be.equal(true);
		});
	});
});
