import * as chai from 'chai';
import { extractAttributesByPrefix } from '../../../src/components/playlist/tools/htmlTools';

const expect = chai.expect;

describe('htmlTools', () => {
	describe('extractAttributesByPrefix', () => {
		it('should extract keys matching the prefix', () => {
			const obj = {
				'data-name': 'Alice',
				'data-age': 30,
				'other-key': 'value',
				'name': 'Bob',
			};
			const result = extractAttributesByPrefix(obj, 'data-');
			expect(result).to.eql({ 'data-name': 'Alice', 'data-age': 30 });
		});

		it('should return empty object when no keys match', () => {
			const obj = { foo: 1, bar: 2 };
			const result = extractAttributesByPrefix(obj, 'baz-');
			expect(result).to.eql({});
		});

		it('should return empty object for empty input', () => {
			const result = extractAttributesByPrefix({}, 'any-');
			expect(result).to.eql({});
		});

		it('should match prefix exactly (not partial key overlap)', () => {
			const obj = {
				'prefix-match': 1,
				'prefixed': 2,
				'pre': 3,
			};
			const result = extractAttributesByPrefix(obj, 'prefix-');
			expect(result).to.eql({ 'prefix-match': 1 });
		});
	});
});
