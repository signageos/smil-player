import * as chai from 'chai';
import { Deferred } from '../../../src/components/playlist/tools/Deferred';

const expect = chai.expect;

describe('Deferred', () => {
	it('Should have isSettled false initially and true after resolve', () => {
		const d = new Deferred<void>();
		expect(d.isSettled).to.be.false;
		d.resolve();
		expect(d.isSettled).to.be.true;
	});

	it('Should be idempotent - second resolve is a no-op', () => {
		const d = new Deferred<number>();
		d.resolve(42);
		d.resolve(99);
		expect(d.isSettled).to.be.true;
		return d.promise.then((value) => {
			expect(value).to.equal(42);
		});
	});

	it('Should resolve promise with provided value', () => {
		const d = new Deferred<string>();
		d.resolve('hello');
		return d.promise.then((value) => {
			expect(value).to.equal('hello');
		});
	});

	it('Should deliver resolved value to multiple awaiters', () => {
		const d = new Deferred<number>();
		const p1 = d.promise.then((v) => v);
		const p2 = d.promise.then((v) => v);
		d.resolve(7);
		return Promise.all([p1, p2]).then(([v1, v2]) => {
			expect(v1).to.equal(7);
			expect(v2).to.equal(7);
		});
	});
});
