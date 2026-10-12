import * as chai from 'chai';
import { formatMessage } from '../../../src/logger/formatMessage';

const expect = chai.expect;

describe('formatMessage', () => {
	it('substitutes %s %d %X in order', () => {
		expect(formatMessage('a=%s b=%d c=%X', ['x', '42', 255])).to.equal('a=x b=42 c=ff');
	});

	it('renders %O objects as JSON', () => {
		expect(formatMessage('o=%O', [{ k: 1 }])).to.equal('o={"k":1}');
	});

	it('renders an Error passed to %O with name, message and stack', () => {
		const err = new Error('boom');
		const out = formatMessage('failed: %O', [err]);
		expect(out).to.contain('Error: boom');
		expect(out).to.contain('formatMessage.spec');
	});

	it('falls back to String() for circular %O', () => {
		const o: any = {};
		o.self = o;
		expect(formatMessage('o=%O', [o])).to.equal('o=[object Object]');
	});

	it('leaves a specifier in place when the arg is missing', () => {
		expect(formatMessage('a=%s b=%s', ['x'])).to.equal('a=x b=%s');
	});

	it('appends leftover args space-separated', () => {
		expect(formatMessage('a=%s', ['x', 'extra', { k: 2 }])).to.equal('a=x extra {"k":2}');
	});

	it('truncates to maxLength with an ellipsis', () => {
		const out = formatMessage('%s', ['y'.repeat(50)], 10);
		expect(out).to.have.length(10);
		expect(out.slice(-1)).to.equal('…');
	});

	it('never throws on a getter that throws', () => {
		const evil = {
			get x() {
				throw new Error('no');
			},
		};
		expect(() => formatMessage('%O', [evil])).not.to.throw();
	});
});
