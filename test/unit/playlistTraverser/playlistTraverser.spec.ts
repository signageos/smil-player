import * as chai from 'chai';
import { PlaylistTraverser } from '../../../src/components/playlist/playlistProcessor/playlistTraverser';
import { PriorityObject } from '../../../src/models/priorityModels';

const expect = chai.expect;

function stub() {
	const calls: any[][] = [];
	let resolveValue: any = undefined;
	const fn: any = (...args: any[]) => {
		calls.push(args);
		if (typeof resolveValue === 'function') {
			return resolveValue(calls.length - 1, args);
		}
		return Promise.resolve(resolveValue);
	};
	fn.calls = calls;
	fn.callCount = () => calls.length;
	fn.calledOnce = () => calls.length === 1;
	fn.calledWith = (...expected: any[]) => calls.some((c) => expected.every((e, i) => c[i] === e));
	fn.firstCall = () => calls[0];
	fn.secondCall = () => calls[1];
	fn.resolves = (val: any) => { resolveValue = val; return fn; };
	fn.callsFake = (fakeFn: Function) => { resolveValue = (_idx: number, args: any[]) => fakeFn(...args); return fn; };
	fn.returns = (val: any) => { resolveValue = val; fn._syncReturn = true; const wrapper: any = (...args: any[]) => { calls.push(args); return val; }; Object.assign(wrapper, fn); wrapper.calls = calls; return wrapper; };
	return fn;
}

function createMockConfig(overrides: Record<string, any> = {}): any {
	return {
		playerName: 'testPlayer',
		playerId: 'testId',
		defaultRepeatCount: 'indefinite',
		shouldSync: false,
		...overrides,
	};
}

function createMockActions(overrides: Record<string, any> = {}): any {
	return {
		playElement: stub().resolves(undefined),
		priorityBehaviour: stub().resolves({ currentIndex: 0, previousPlayingIndex: 0 }),
		storePriorityBounds: stub().resolves(undefined),
		coordinatePlayModeSync: stub().resolves(0),
		processDynamicPlaylist: stub().resolves(undefined),
		...overrides,
	};
}

function createMockControl(overrides: Record<string, any> = {}): any {
	return {
		randomPlaylist: {},
		dynamicPlaylist: {},
		sleep: stub().resolves(undefined),
		waitTimeoutOrFileUpdate: stub().resolves(false),
		runEndlessLoop: stub().resolves(undefined),
		getPlaylistVersion: (() => 0),
		getCancelFunction: (() => false),
		...overrides,
	};
}

function createMockEngine(overrides?: { config?: Record<string, any>; actions?: Record<string, any>; control?: Record<string, any> }): any {
	return {
		config: createMockConfig(overrides?.config),
		actions: createMockActions(overrides?.actions),
		control: createMockControl(overrides?.control),
	};
}

describe('PlaylistTraverser', () => {
	describe('processPlaylist - media elements', () => {
		it('should call playElement for a single video element', async () => {
			const engine = createMockEngine();
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				video: {
					src: 'test.mp4',
					regionInfo: { regionName: 'main', left: 0, top: 0, width: 100, height: 100 },
				},
			} as any;

			await traverser.processPlaylist(playlist, 0, '', 0);

			expect(engine.actions.playElement.calls.length).to.equal(1);
			expect(engine.actions.playElement.calls[0][0].src).to.equal('test.mp4');
			expect(engine.actions.playElement.calls[0][2]).to.equal('video'); // key
		});

		it('should process multiple elements in sequence', async () => {
			const engine = createMockEngine();
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				'video1': {
					src: 'first.mp4',
					regionInfo: { regionName: 'main', left: 0, top: 0, width: 100, height: 100 },
				},
				'img1': {
					src: 'second.jpg',
					regionInfo: { regionName: 'main', left: 0, top: 0, width: 100, height: 100 },
				},
			} as any;

			await traverser.processPlaylist(playlist, 0, '', 0);

			expect(engine.actions.playElement.calls.length).to.equal(2);
			expect(engine.actions.playElement.calls[0][0].src).to.equal('first.mp4');
			expect(engine.actions.playElement.calls[1][0].src).to.equal('second.jpg');
		});

		it('should skip non-object values (e.g. repeatCount attributes)', async () => {
			const engine = createMockEngine();
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				repeatCount: 'indefinite',
				video: {
					src: 'test.mp4',
					regionInfo: { regionName: 'main', left: 0, top: 0, width: 100, height: 100 },
				},
			} as any;

			await traverser.processPlaylist(playlist, 0, '', 0);

			expect(engine.actions.playElement.calls.length).to.equal(1);
		});

		it('should skip elements without regionInfo', async () => {
			const engine = createMockEngine();
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				video: {
					src: 'test.mp4',
				},
			} as any;

			await traverser.processPlaylist(playlist, 0, '', 0);

			expect(engine.actions.playElement.calls.length).to.equal(0);
		});

		it('should retry when playElement returns RETRY', async () => {
			let callIdx = 0;
			const playElementStub = stub().callsFake(() => {
				callIdx++;
				return callIdx === 1 ? 'RETRY' : undefined;
			});

			const engine = createMockEngine({ actions: { playElement: playElementStub } });
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				video: {
					src: 'test.mp4',
					regionInfo: { regionName: 'main', left: 0, top: 0, width: 100, height: 100 },
				},
			} as any;

			await traverser.processPlaylist(playlist, 0, '', 0);

			expect(playElementStub.calls.length).to.equal(2);
			expect(engine.control.sleep.calledWith(100)).to.be.true;
		});

		it('should stop retrying after MAX_RETRIES', async () => {
			const playElementStub = stub().resolves('RETRY');
			const engine = createMockEngine({ actions: { playElement: playElementStub } });
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				video: {
					src: 'test.mp4',
					regionInfo: { regionName: 'main', left: 0, top: 0, width: 100, height: 100 },
				},
			} as any;

			await traverser.processPlaylist(playlist, 0, '', 0);

			// retryCount goes 0..9 = 10 iterations total
			expect(playElementStub.calls.length).to.equal(10);
		});

		it('should pass priorityCoord when priorityObject has priorityLevel', async () => {
			const engine = createMockEngine();
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				video: {
					src: 'test.mp4',
					regionInfo: { regionName: 'main', left: 0, top: 0, width: 100, height: 100 },
				},
			} as any;

			const priorityObject = { priorityLevel: 2 } as PriorityObject;
			await traverser.processPlaylist(playlist, 1, '', 0, priorityObject);

			const args = engine.actions.playElement.calls[0];
			expect(args[8]).to.deep.equal({ version: 1, priority: 2 });
		});

		it('should not pass priorityCoord when priorityObject has no priorityLevel', async () => {
			const engine = createMockEngine();
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				video: {
					src: 'test.mp4',
					regionInfo: { regionName: 'main', left: 0, top: 0, width: 100, height: 100 },
				},
			} as any;

			await traverser.processPlaylist(playlist, 1, '', 0, {} as PriorityObject);

			const args = engine.actions.playElement.calls[0];
			expect(args[8]).to.be.undefined;
		});

		it('should mark isLast correctly for the last element', async () => {
			const engine = createMockEngine();
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				'video1': {
					src: 'first.mp4',
					regionInfo: { regionName: 'main', left: 0, top: 0, width: 100, height: 100 },
				},
				'video2': {
					src: 'second.mp4',
					regionInfo: { regionName: 'main', left: 0, top: 0, width: 100, height: 100 },
				},
			} as any;

			await traverser.processPlaylist(playlist, 0, '', 0);

			// First call: isLast = false (arg index 7)
			expect(engine.actions.playElement.calls[0][7]).to.be.false;
			// Second call: isLast = true
			expect(engine.actions.playElement.calls[1][7]).to.be.true;
		});
	});

	describe('processPlaylist - seq tag', () => {
		it('should process seq elements sequentially', async () => {
			const callOrder: string[] = [];
			const playElementStub = stub().callsFake((value: any) => {
				callOrder.push(value.src);
				return undefined;
			});

			const engine = createMockEngine({ config: { defaultRepeatCount: '1' }, actions: { playElement: playElementStub } });
			const traverser = new PlaylistTraverser(engine);

			const playlist = {
				seq: [
					{
						video: {
							src: 'first.mp4',
							regionInfo: { regionName: 'main', left: 0, top: 0, width: 100, height: 100 },
						},
					},
					{
						img: {
							src: 'second.jpg',
							regionInfo: { regionName: 'main', left: 0, top: 0, width: 100, height: 100 },
						},
					},
				],
			} as any;

			await traverser.processPlaylist(playlist, 0, 'par', 0);

			expect(callOrder).to.deep.equal(['first.mp4', 'second.jpg']);
		});

		it('should handle seq tag with single non-array value', async () => {
			const engine = createMockEngine({ config: { defaultRepeatCount: '1' } });
			const traverser = new PlaylistTraverser(engine);

			const playlist = {
				seq: {
					video: {
						src: 'test.mp4',
						regionInfo: { regionName: 'main', left: 0, top: 0, width: 100, height: 100 },
					},
				},
			} as any;

			await traverser.processPlaylist(playlist, 0, 'par', 0);

			expect(engine.actions.playElement.calls.length).to.equal(1);
		});
	});

	describe('processPlaylist - par tag', () => {
		it('should process par elements', async () => {
			const engine = createMockEngine({ config: { defaultRepeatCount: '1' } });
			const traverser = new PlaylistTraverser(engine);

			const playlist = {
				par: {
					video: {
						src: 'test.mp4',
						regionInfo: { regionName: 'region1', left: 0, top: 0, width: 100, height: 100 },
					},
					img: {
						src: 'test.jpg',
						regionInfo: { regionName: 'region2', left: 0, top: 0, width: 100, height: 100 },
					},
				},
			} as any;

			await traverser.processPlaylist(playlist, 0, '', 0);

			expect(engine.actions.playElement.calls.length).to.equal(2);
		});
	});

	describe('processPlaylist - dynamic content', () => {
		it('should call processDynamicPlaylist when sync is enabled', async () => {
			const engine = createMockEngine({ config: { shouldSync: true } });
			const traverser = new PlaylistTraverser(engine);

			const playlist = {
				'emitDynamic': {
					data: 'test-playlist',
				},
			} as any;

			await traverser.processPlaylist(playlist, 0, '', 0);

			expect(engine.actions.processDynamicPlaylist.calls.length).to.equal(1);
		});

		it('should sleep when dynamic content detected but sync is off', async () => {
			const engine = createMockEngine({ config: { shouldSync: false } });
			const traverser = new PlaylistTraverser(engine);

			const playlist = {
				'emitDynamic': {
					data: 'test-playlist',
				},
			} as any;

			await traverser.processPlaylist(playlist, 0, '', 0);

			expect(engine.control.sleep.calledWith(1000)).to.be.true;
			expect(engine.actions.processDynamicPlaylist.calls.length).to.equal(0);
		});
	});

	describe('processPriorityTag', () => {
		it('should create promises for each priority class element', async () => {
			const engine = createMockEngine();
			const traverser = new PlaylistTraverser(engine);

			const value = [
				{
					higher: 'stop',
					lower: 'defer',
					peer: 'stop',
					video: {
						src: 'high.mp4',
						regionInfo: { regionName: 'main', left: 0, top: 0, width: 100, height: 100 },
					},
				},
				{
					higher: 'stop',
					lower: 'defer',
					peer: 'stop',
					video: {
						src: 'low.mp4',
						regionInfo: { regionName: 'main', left: 0, top: 0, width: 100, height: 100 },
					},
				},
			] as any;

			const promises = await traverser.processPriorityTag(value, 0, 'seq', 0, '');
			await Promise.all(promises);

			// Both priority class elements should trigger storePriorityBounds
			expect(engine.actions.storePriorityBounds.calls.length).to.equal(2);
		});

		it('should process each priority class element as a separate playlist', async () => {
			const engine = createMockEngine();
			const traverser = new PlaylistTraverser(engine);

			const value = [
				{
					higher: 'stop',
					lower: 'defer',
					peer: 'stop',
					video: {
						src: 'high.mp4',
						regionInfo: { regionName: 'main', left: 0, top: 0, width: 100, height: 100 },
					},
				},
			] as any;

			const promises = await traverser.processPriorityTag(value, 0, 'seq', 0, '');
			await Promise.all(promises);

			// The video element should be played
			expect(engine.actions.playElement.calls.length).to.equal(1);
			expect(engine.actions.playElement.calls[0][0].src).to.equal('high.mp4');
		});
	});

	describe('processExclTag', () => {
		it('should create promises for each excl element', async () => {
			const engine = createMockEngine();
			const traverser = new PlaylistTraverser(engine);

			const value = [
				{
					video: {
						src: 'first.mp4',
						regionInfo: { regionName: 'main', left: 0, top: 0, width: 100, height: 100 },
					},
				},
				{
					video: {
						src: 'second.mp4',
						regionInfo: { regionName: 'main', left: 0, top: 0, width: 100, height: 100 },
					},
				},
			] as any;

			const promises = await traverser.processExclTag(value, 0, 'seq', 0, '');
			await Promise.all(promises);

			// Both elements should trigger playElement (via processPlaylist)
			expect(engine.actions.playElement.calls.length).to.equal(2);
		});

		it('should wrap non-array value in array', async () => {
			const engine = createMockEngine();
			const traverser = new PlaylistTraverser(engine);

			const value = {
				video: {
					src: 'test.mp4',
					regionInfo: { regionName: 'main', left: 0, top: 0, width: 100, height: 100 },
				},
			} as any;

			const promises = await traverser.processExclTag(value, 0, 'seq', 0, '');
			await Promise.all(promises);

			expect(engine.actions.playElement.calls.length).to.equal(1);
		});
	});
});
