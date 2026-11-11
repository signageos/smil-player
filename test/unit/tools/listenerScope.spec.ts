import { noopLog } from '@signageos/smil-logger';
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
		const scope = new ListenerScope(noopLog);
		const target = makeStubTarget();
		const handler = () => {/* noop */};

		scope.add({ target: target as unknown as EventTarget, type: 'click', listener: handler });

		expect(scope.size).to.equal(1);
		expect(target.adds).to.have.length(1);
		expect(target.adds[0][0]).to.equal('click');
		expect(target.adds[0][1]).to.equal(handler);
	});

	it('removeAll calls removeEventListener with the same listener reference and options', () => {
		const scope = new ListenerScope(noopLog);
		const target = makeStubTarget();
		const handler = () => {/* noop */};
		const opts = { capture: true };

		scope.add({ target: target as unknown as EventTarget, type: 'keydown', listener: handler, options: opts });
		scope.removeAll();

		expect(target.removes).to.have.length(1);
		expect(target.removes[0][0]).to.equal('keydown');
		expect(target.removes[0][1]).to.equal(handler);
		expect(target.removes[0][2]).to.equal(opts);
	});

	it('removeAll empties the registry and is a no-op on a second call', () => {
		const scope = new ListenerScope(noopLog);
		const target = makeStubTarget();

		scope.add({ target: target as unknown as EventTarget, type: 'click', listener: () => {/* noop */} });
		scope.removeAll();
		expect(scope.size).to.equal(0);

		scope.removeAll();
		expect(scope.size).to.equal(0);
		expect(target.removes).to.have.length(1);
	});

	it('removeAll swallows errors from a misbehaving target and still clears entries', () => {
		const scope = new ListenerScope(noopLog);
		const throwingTarget = {
			addEventListener: () => {/* noop */},
			removeEventListener: () => {
				throw new Error('cross-origin / detached / etc.');
			},
		};

		scope.add({ target: throwingTarget as unknown as EventTarget, type: 'click', listener: () => {/* noop */} });

		expect(() => scope.removeAll()).to.not.throw();
		expect(scope.size).to.equal(0);
	});

	it('preserves insertion order across multiple targets', () => {
		const scope = new ListenerScope(noopLog);
		const a = makeStubTarget();
		const b = makeStubTarget();
		const ha = () => {/* noop */};
		const hb1 = () => {/* noop */};
		const hb2 = () => {/* noop */};

		scope.add({ target: a as unknown as EventTarget, type: 'click', listener: ha });
		scope.add({ target: b as unknown as EventTarget, type: 'keydown', listener: hb1 });
		scope.add({ target: b as unknown as EventTarget, type: 'touchstart', listener: hb2 });

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
