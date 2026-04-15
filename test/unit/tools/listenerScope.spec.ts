import * as chai from 'chai';
import { ListenerScope } from '../../../src/components/playlist/tools/listenerScope';

const expect = chai.expect;

/**
 * Unit coverage for `ListenerScope` — a tiny registry that wraps
 * addEventListener so every prior listener can be detached with one
 * removeAll() call. Spec-compatible since DOM Level 2 (no AbortSignal
 * dependency), so safe on older signage runtimes.
 */
describe('ListenerScope', () => {
	type AddArgs = [string, EventListenerOrEventListenerObject, (AddEventListenerOptions | boolean | undefined)?];
	type RemoveArgs = [string, EventListenerOrEventListenerObject, (AddEventListenerOptions | boolean | undefined)?];

	function makeStubTarget() {
		const adds: AddArgs[] = [];
		const removes: RemoveArgs[] = [];
		const stub = {
			adds,
			removes,
			addEventListener(
				type: string,
				listener: EventListenerOrEventListenerObject,
				options?: AddEventListenerOptions | boolean,
			) {
				adds.push([type, listener, options]);
			},
			removeEventListener(
				type: string,
				listener: EventListenerOrEventListenerObject,
				options?: AddEventListenerOptions | boolean,
			) {
				removes.push([type, listener, options]);
			},
		};
		return stub;
	}

	it('add forwards to the target and tracks the entry', () => {
		const scope = new ListenerScope();
		const target = makeStubTarget();
		const handler = () => {};

		scope.add(target as unknown as EventTarget, 'click', handler);

		expect(scope.size).to.equal(1);
		expect(target.adds).to.have.length(1);
		expect(target.adds[0][0]).to.equal('click');
		expect(target.adds[0][1]).to.equal(handler);
	});

	it('removeAll calls removeEventListener with the same listener reference and options', () => {
		const scope = new ListenerScope();
		const target = makeStubTarget();
		const handler = () => {};
		const opts = { capture: true };

		scope.add(target as unknown as EventTarget, 'keydown', handler, opts);
		scope.removeAll();

		expect(target.removes).to.have.length(1);
		expect(target.removes[0][0]).to.equal('keydown');
		expect(target.removes[0][1]).to.equal(handler);
		expect(target.removes[0][2]).to.equal(opts);
	});

	it('removeAll empties the registry and is a no-op on a second call', () => {
		const scope = new ListenerScope();
		const target = makeStubTarget();

		scope.add(target as unknown as EventTarget, 'click', () => {});
		scope.removeAll();
		expect(scope.size).to.equal(0);

		scope.removeAll();
		expect(scope.size).to.equal(0);
		expect(target.removes).to.have.length(1);
	});

	it('removeAll swallows errors from a misbehaving target and still clears entries', () => {
		const scope = new ListenerScope();
		const throwingTarget = {
			addEventListener: () => {},
			removeEventListener: () => {
				throw new Error('cross-origin / detached / etc.');
			},
		};

		scope.add(throwingTarget as unknown as EventTarget, 'click', () => {});

		expect(() => scope.removeAll()).to.not.throw();
		expect(scope.size).to.equal(0);
	});

	it('preserves insertion order across multiple targets', () => {
		const scope = new ListenerScope();
		const a = makeStubTarget();
		const b = makeStubTarget();
		const ha = () => {};
		const hb1 = () => {};
		const hb2 = () => {};

		scope.add(a as unknown as EventTarget, 'click', ha);
		scope.add(b as unknown as EventTarget, 'keydown', hb1);
		scope.add(b as unknown as EventTarget, 'touchstart', hb2);

		expect(scope.size).to.equal(3);

		scope.removeAll();

		expect(a.removes).to.have.length(1);
		expect(a.removes[0][0]).to.equal('click');
		expect(a.removes[0][1]).to.equal(ha);

		expect(b.removes).to.have.length(2);
		expect(b.removes[0][0]).to.equal('keydown');
		expect(b.removes[0][1]).to.equal(hb1);
		expect(b.removes[1][0]).to.equal('touchstart');
		expect(b.removes[1][1]).to.equal(hb2);
	});
});
