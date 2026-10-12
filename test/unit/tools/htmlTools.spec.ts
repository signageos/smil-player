import * as chai from 'chai';
import {
	computeBillboardColumns,
	createHtmlTools,
	extractAttributesByPrefix,
} from '../../../src/components/playlist/tools/htmlTools';
import { noopLog } from '../../../src/logger';

const expect = chai.expect;

describe('htmlTools', () => {
	it('createHtmlTools exposes the logging functions', () => {
		const t = createHtmlTools(noopLog);
		expect(t.createHtmlElement).to.be.a('function');
		expect(t.changeZIndex).to.be.a('function');
		expect(t.createDomElement).to.be.a('function');
		expect(t.resetBodyContent).to.be.a('function');
		expect(t.setTransitionCss).to.be.a('function');
	});

	describe('computeBillboardColumns', () => {
		it('returns one column descriptor per requested column', () => {
			expect(computeBillboardColumns(1920, 4)).to.have.lengthOf(4);
		});

		it('computes strip width = regionWidth/columnCount + 2 and i·stripWidth offsets for a known input', () => {
			// 1920 / 4 = 480px strip; +2px overlap hides the seams between strips; offset = i * 480.
			// background-position uses -offset, margin-left uses +offset (same magnitude).
			expect(computeBillboardColumns(1920, 4)).to.eql([
				{ width: 482, offset: 0 },
				{ width: 482, offset: 480 },
				{ width: 482, offset: 960 },
				{ width: 482, offset: 1440 },
			]);
		});

		it('keeps fractional widths/offsets exact (no rounding) for a non-divisible region', () => {
			const strip = 1000 / 3;
			const columns = computeBillboardColumns(1000, 3);
			expect(columns).to.have.lengthOf(3);
			columns.forEach((col, i) => {
				expect(col.width).to.equal(strip + 2);
				expect(col.offset).to.equal(i * strip);
			});
		});
	});

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
