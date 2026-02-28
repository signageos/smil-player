import * as chai from 'chai';
import MockDate from 'mockdate';
import { PlaylistTraverser } from '../../../src/components/playlist/playlistProcessor/playlistTraverser';
import { PriorityObject } from '../../../src/models/priorityModels';
import { SMILScheduleEnum } from '../../../src/enums/scheduleEnums';

const expect = chai.expect;

// Wallclock constants for tests
const WALLCLOCK_NEVER_PLAY_BEGIN = 'wallclock(2020-01-01T10:00:00)';
const WALLCLOCK_NEVER_PLAY_END = 'wallclock(2020-01-01T11:00:00)';
const WALLCLOCK_ACTIVE_BEGIN = 'wallclock(R/2025-06-15T10:00:00/P1D)';
const WALLCLOCK_ACTIVE_END = 'wallclock(R/2025-06-15T18:00:00/P1D)';
const WALLCLOCK_FUTURE_BEGIN = 'wallclock(R/2025-06-15T14:00:00/P1D)';
const WALLCLOCK_FUTURE_END = 'wallclock(R/2025-06-15T18:00:00/P1D)';
const CONDITIONAL_EXPR = "adapi-compare(smil-playerName(), 'testPlayer')";

function makeRegionInfo() {
	return { regionName: 'main', left: 0, top: 0, width: 100, height: 100 };
}

function makeVideo(src = 'test.mp4') {
	return { src, regionInfo: makeRegionInfo() };
}

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

	// ===== Group A: excl/priorityClass dispatched from processPlaylist =====

	describe('processPlaylist - excl dispatch', () => {
		it('should process excl elements via processPlaylist', async () => {
			const engine = createMockEngine();
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				excl: [
					{ video: makeVideo('first.mp4') },
					{ video: makeVideo('second.mp4') },
				],
			} as any;

			await traverser.processPlaylist(playlist, 0, 'seq', 0);

			expect(engine.actions.playElement.calls.length).to.equal(2);
		});

		it('should default parent to seq when parent is empty string', async () => {
			const engine = createMockEngine();
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				excl: [{ video: makeVideo() }],
			} as any;

			await traverser.processPlaylist(playlist, 0, '', 0);

			// playElement parent arg (index 3) should be 'seq'
			expect(engine.actions.playElement.calls[0][3]).to.equal('seq');
		});
	});

	describe('processPlaylist - priorityClass dispatch', () => {
		it('should call storePriorityBounds when processing priorityClass', async () => {
			const engine = createMockEngine();
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				priorityClass: [
					{ higher: 'stop', lower: 'defer', peer: 'stop', video: makeVideo() },
				],
			} as any;

			await traverser.processPlaylist(playlist, 0, 'seq', 0);

			expect(engine.actions.storePriorityBounds.calls.length).to.equal(1);
		});

		it('should default parent to seq when parent is empty string', async () => {
			const engine = createMockEngine();
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				priorityClass: [
					{ higher: 'stop', lower: 'defer', peer: 'stop', video: makeVideo() },
				],
			} as any;

			await traverser.processPlaylist(playlist, 0, '', 0);

			expect(engine.actions.playElement.calls[0][3]).to.equal('seq');
		});
	});

	// ===== Group B: par tag — Array form =====

	describe('processPlaylist - par array', () => {
		it('should process par array elements sequentially with seq parent', async () => {
			const callOrder: string[] = [];
			const playElementStub = stub().callsFake((value: any) => {
				callOrder.push(value.src);
				return undefined;
			});

			const engine = createMockEngine({
				config: { defaultRepeatCount: '1' },
				actions: { playElement: playElementStub },
			});
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				par: [
					{ video: makeVideo('first.mp4') },
					{ video: makeVideo('second.mp4') },
				],
			} as any;

			await traverser.processPlaylist(playlist, 0, 'seq-parent', 0);

			expect(callOrder).to.deep.equal(['first.mp4', 'second.mp4']);
		});

		it('should process par array elements via Promise.all with non-seq parent', async () => {
			const engine = createMockEngine({ config: { defaultRepeatCount: '1' } });
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				par: [
					{ video: makeVideo('first.mp4') },
					{ video: makeVideo('second.mp4') },
				],
			} as any;

			await traverser.processPlaylist(playlist, 0, 'par-parent', 0);

			expect(engine.actions.playElement.calls.length).to.equal(2);
		});

		it('should propagate ExprTag from array elements', async () => {
			const engine = createMockEngine({
				config: { playerName: 'testPlayer', defaultRepeatCount: '1' },
			});
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				par: [
					{ expr: CONDITIONAL_EXPR, video: makeVideo('first.mp4') },
					{ video: makeVideo('second.mp4') },
				],
			} as any;

			await traverser.processPlaylist(playlist, 0, 'par-parent', 0);

			// Both elements are played — expr is propagated but doesn't block at array level
			expect(engine.actions.playElement.calls.length).to.equal(2);
		});
	});

	// ===== Group C: par tag — repeatCount variants, no wallclock =====

	describe('processPlaylist - par repeatCount (no wallclock)', () => {
		it('should call runEndlessLoop for repeatCount=indefinite with endTime=0', async () => {
			const engine = createMockEngine({ config: { defaultRepeatCount: '1' } });
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				par: { repeatCount: 'indefinite', video: makeVideo() },
			} as any;

			await traverser.processPlaylist(playlist, 0, '', 0);

			expect(engine.control.runEndlessLoop.calls.length).to.equal(1);
		});

		it('should call runEndlessLoop when defaultRepeatCount=indefinite with endTime=0', async () => {
			const engine = createMockEngine({ config: { defaultRepeatCount: 'indefinite' } });
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				par: { video: makeVideo() },
			} as any;

			await traverser.processPlaylist(playlist, 0, '', 0);

			expect(engine.control.runEndlessLoop.calls.length).to.equal(1);
		});

		it('should call playElement N times for repeatCount=3', async () => {
			const engine = createMockEngine({ config: { defaultRepeatCount: '1' } });
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				par: { repeatCount: '3', video: makeVideo() },
			} as any;

			await traverser.processPlaylist(playlist, 0, '', 0);

			expect(engine.actions.playElement.calls.length).to.equal(3);
		});

		it('should call playElement once when defaultRepeatCount=1', async () => {
			const engine = createMockEngine({ config: { defaultRepeatCount: '1' } });
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				par: { video: makeVideo() },
			} as any;

			await traverser.processPlaylist(playlist, 0, '', 0);

			expect(engine.actions.playElement.calls.length).to.equal(1);
		});

		it('should use default promise when no repeatCount matches', async () => {
			const engine = createMockEngine({ config: { defaultRepeatCount: '2' } });
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				par: { video: makeVideo() },
			} as any;

			await traverser.processPlaylist(playlist, 0, '', 0);

			expect(engine.actions.playElement.calls.length).to.equal(1);
		});

		it('should not play element when conditional is expired (non-wallclock par)', async () => {
			const engine = createMockEngine({
				config: { playerName: 'otherPlayer', defaultRepeatCount: '1' },
			});
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				par: { expr: CONDITIONAL_EXPR, video: makeVideo('skip.mp4') },
			} as any;

			await traverser.processPlaylist(playlist, 0, '', 0);

			expect(engine.actions.playElement.calls.length).to.equal(0);
		});
	});

	// ===== Group D: par tag — wallclock =====

	describe('processPlaylist - par wallclock', () => {
		beforeEach(() => {
			MockDate.set(new Date('2025-06-15T12:00:00'));
		});

		afterEach(() => {
			MockDate.reset();
		});

		it('should skip neverPlay wallclock and return allExpired', async () => {
			const engine = createMockEngine({ config: { defaultRepeatCount: '1' } });
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				par: {
					begin: WALLCLOCK_NEVER_PLAY_BEGIN,
					end: WALLCLOCK_NEVER_PLAY_END,
					video: makeVideo(),
				},
			} as any;

			const result = await traverser.processPlaylist(playlist, 0, '', 0);

			expect(engine.actions.playElement.calls.length).to.equal(0);
			expect(result).to.equal(SMILScheduleEnum.allExpired);
		});

		it('should not play element when wallclock active but conditional expired (par)', async () => {
			const engine = createMockEngine({
				config: { playerName: 'otherPlayer', defaultRepeatCount: '1' },
			});
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				par: {
					begin: WALLCLOCK_ACTIVE_BEGIN,
					end: WALLCLOCK_ACTIVE_END,
					expr: CONDITIONAL_EXPR,
					video: makeVideo('skip.mp4'),
				},
			} as any;

			await traverser.processPlaylist(playlist, 0, '', 0);

			expect(engine.actions.playElement.calls.length).to.equal(0);
		});

		it('should play element once with active wallclock and repeatCount=1', async () => {
			const engine = createMockEngine({ config: { defaultRepeatCount: '1' } });
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				par: {
					begin: WALLCLOCK_ACTIVE_BEGIN,
					end: WALLCLOCK_ACTIVE_END,
					repeatCount: '1',
					video: makeVideo(),
				},
			} as any;

			await traverser.processPlaylist(playlist, 0, '', 0);

			expect(engine.actions.playElement.calls.length).to.equal(1);
		});

		it('should play element once with active wallclock and defaultRepeatCount=1', async () => {
			const engine = createMockEngine({ config: { defaultRepeatCount: '1' } });
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				par: {
					begin: WALLCLOCK_ACTIVE_BEGIN,
					end: WALLCLOCK_ACTIVE_END,
					video: makeVideo(),
				},
			} as any;

			await traverser.processPlaylist(playlist, 0, '', 0);

			expect(engine.actions.playElement.calls.length).to.equal(1);
		});

		it('should enter while loop for active wallclock with repeatCount=indefinite', async () => {
			const engine = createMockEngine({
				config: { defaultRepeatCount: '1' },
				control: { getCancelFunction: () => true },
			});
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				par: {
					begin: WALLCLOCK_ACTIVE_BEGIN,
					end: WALLCLOCK_ACTIVE_END,
					repeatCount: 'indefinite',
					video: makeVideo(),
				},
			} as any;

			await traverser.processPlaylist(playlist, 0, '', 0);

			expect(engine.actions.playElement.calls.length).to.equal(1);
		});

		it('should use default promise for active wallclock with no repeatCount match', async () => {
			const engine = createMockEngine({ config: { defaultRepeatCount: '2' } });
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				par: {
					begin: WALLCLOCK_ACTIVE_BEGIN,
					end: WALLCLOCK_ACTIVE_END,
					video: makeVideo(),
				},
			} as any;

			await traverser.processPlaylist(playlist, 0, '', 0);

			expect(engine.actions.playElement.calls.length).to.equal(1);
		});

		it('should propagate ExprTag with active wallclock when expr matches', async () => {
			const engine = createMockEngine({
				config: { playerName: 'testPlayer', defaultRepeatCount: '1' },
			});
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				par: {
					begin: WALLCLOCK_ACTIVE_BEGIN,
					end: WALLCLOCK_ACTIVE_END,
					expr: CONDITIONAL_EXPR,
					video: makeVideo(),
				},
			} as any;

			await traverser.processPlaylist(playlist, 0, '', 0);

			expect(engine.actions.playElement.calls.length).to.equal(1);
		});
	});

	// ===== Group E: seq tag — repeatCount variants, no wallclock =====

	describe('processPlaylist - seq repeatCount (no wallclock)', () => {
		it('should call playElement N times for repeatCount=2', async () => {
			const engine = createMockEngine({ config: { defaultRepeatCount: '1' } });
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				seq: { repeatCount: '2', video: makeVideo() },
			} as any;

			await traverser.processPlaylist(playlist, 0, 'par', 0);

			expect(engine.actions.playElement.calls.length).to.equal(2);
		});

		it('should push promises with par parent for repeatCount=2', async () => {
			const engine = createMockEngine({ config: { defaultRepeatCount: '1' } });
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				seq: { repeatCount: '2', video: makeVideo() },
			} as any;

			await traverser.processPlaylist(playlist, 0, 'par-parent', 0);

			// Still called twice — promises pushed and awaited at end
			expect(engine.actions.playElement.calls.length).to.equal(2);
		});

		it('should call playElement once with defaultRepeatCount=1', async () => {
			const engine = createMockEngine({ config: { defaultRepeatCount: '1' } });
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				seq: { video: makeVideo() },
			} as any;

			await traverser.processPlaylist(playlist, 0, 'par', 0);

			expect(engine.actions.playElement.calls.length).to.equal(1);
		});

		it('should call runEndlessLoop for repeatCount=indefinite with endTime=0', async () => {
			const engine = createMockEngine({ config: { defaultRepeatCount: '1' } });
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				seq: { repeatCount: 'indefinite', video: makeVideo() },
			} as any;

			await traverser.processPlaylist(playlist, 0, 'par', 0);

			expect(engine.control.runEndlessLoop.calls.length).to.equal(1);
		});

		it('should call runEndlessLoop with defaultRepeatCount=indefinite and endTime=0', async () => {
			const engine = createMockEngine({ config: { defaultRepeatCount: 'indefinite' } });
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				seq: { video: makeVideo() },
			} as any;

			await traverser.processPlaylist(playlist, 0, 'par', 0);

			expect(engine.control.runEndlessLoop.calls.length).to.equal(1);
		});

		it('should use default promise when no repeatCount matches', async () => {
			const engine = createMockEngine({ config: { defaultRepeatCount: '2' } });
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				seq: { video: makeVideo() },
			} as any;

			await traverser.processPlaylist(playlist, 0, 'par', 0);

			expect(engine.actions.playElement.calls.length).to.equal(1);
		});

		it('should skip element with expired conditional and play the next', async () => {
			const engine = createMockEngine({
				config: { playerName: 'otherPlayer', defaultRepeatCount: '1' },
			});
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				seq: [
					{ expr: CONDITIONAL_EXPR, video: makeVideo('skip.mp4') },
					{ video: makeVideo('play.mp4') },
				],
			} as any;

			await traverser.processPlaylist(playlist, 0, 'par', 0);

			expect(engine.actions.playElement.calls.length).to.equal(1);
			expect(engine.actions.playElement.calls[0][0].src).to.equal('play.mp4');
		});

		it('should sleep defaultAwait when conditional expired on last seq element', async () => {
			const engine = createMockEngine({
				config: { playerName: 'otherPlayer', defaultRepeatCount: '1' },
			});
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				seq: [
					{ expr: CONDITIONAL_EXPR, video: makeVideo('skip.mp4') },
				],
			} as any;

			await traverser.processPlaylist(playlist, 0, 'par', 0);

			expect(engine.actions.playElement.calls.length).to.equal(0);
			expect(engine.control.sleep.calls.some((c: any[]) => c[0] === 200)).to.be.true;
		});
	});

	// ===== Group F: seq tag — wallclock =====

	describe('processPlaylist - seq wallclock', () => {
		beforeEach(() => {
			MockDate.set(new Date('2025-06-15T12:00:00'));
		});

		afterEach(() => {
			MockDate.reset();
		});

		it('should skip neverPlay wallclock element and return allExpired', async () => {
			const engine = createMockEngine({ config: { defaultRepeatCount: '1' } });
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				seq: {
					begin: WALLCLOCK_NEVER_PLAY_BEGIN,
					end: WALLCLOCK_NEVER_PLAY_END,
					video: makeVideo(),
				},
			} as any;

			const result = await traverser.processPlaylist(playlist, 0, 'par', 0);

			expect(engine.actions.playElement.calls.length).to.equal(0);
			expect(result).to.equal(SMILScheduleEnum.allExpired);
		});

		it('should sleep defaultAwait on last element when all wallclocks expired but repeat daily', async () => {
			const engine = createMockEngine({ config: { defaultRepeatCount: '1' } });
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				seq: [
					{
						begin: WALLCLOCK_NEVER_PLAY_BEGIN,
						end: WALLCLOCK_NEVER_PLAY_END,
						video: makeVideo('never.mp4'),
					},
					{
						begin: 'wallclock(R/2025-06-15T06:00:00/P1D)',
						end: 'wallclock(R/2025-06-15T09:00:00/P1D)',
						video: makeVideo('expired.mp4'),
					},
				],
			} as any;

			await traverser.processPlaylist(playlist, 0, 'par', 0);

			// sleep(200) called for defaultAwait on last element
			expect(engine.control.sleep.calls.some((c: any[]) => c[0] === 200)).to.be.true;
		});

		it('should skip element when wallclock active but conditional expired', async () => {
			const engine = createMockEngine({
				config: { playerName: 'otherPlayer', defaultRepeatCount: '1' },
			});
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				seq: [
					{
						begin: WALLCLOCK_ACTIVE_BEGIN,
						end: WALLCLOCK_ACTIVE_END,
						expr: CONDITIONAL_EXPR,
						video: makeVideo('skip.mp4'),
					},
					{ video: makeVideo('play.mp4') },
				],
			} as any;

			await traverser.processPlaylist(playlist, 0, 'par', 0);

			// First element skipped (conditional expired), second plays
			expect(engine.actions.playElement.calls.length).to.equal(1);
			expect(engine.actions.playElement.calls[0][0].src).to.equal('play.mp4');
		});

		it('should play element with active wallclock and repeatCount=2', async () => {
			const engine = createMockEngine({ config: { defaultRepeatCount: '1' } });
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				seq: {
					begin: WALLCLOCK_ACTIVE_BEGIN,
					end: WALLCLOCK_ACTIVE_END,
					repeatCount: '2',
					video: makeVideo(),
				},
			} as any;

			await traverser.processPlaylist(playlist, 0, 'par', 0);

			expect(engine.actions.playElement.calls.length).to.equal(2);
		});

		it('should skip future element in multi-element seq with definite repeatCount', async () => {
			const engine = createMockEngine({ config: { defaultRepeatCount: '1' } });
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				seq: [
					{
						begin: WALLCLOCK_ACTIVE_BEGIN,
						end: WALLCLOCK_ACTIVE_END,
						repeatCount: '1',
						video: makeVideo('current.mp4'),
					},
					{
						begin: WALLCLOCK_FUTURE_BEGIN,
						end: WALLCLOCK_FUTURE_END,
						repeatCount: '1',
						video: makeVideo('future.mp4'),
					},
				],
			} as any;

			await traverser.processPlaylist(playlist, 0, 'par', 0);

			// Only the active element plays — future element skipped (timeToStart > 0, length > 1)
			expect(engine.actions.playElement.calls.length).to.equal(1);
			expect(engine.actions.playElement.calls[0][0].src).to.equal('current.mp4');
		});

		it('should enter while loop for single indefinite wallclock element', async () => {
			const engine = createMockEngine({
				config: { defaultRepeatCount: '1' },
				control: { getCancelFunction: () => true },
			});
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				seq: {
					begin: WALLCLOCK_ACTIVE_BEGIN,
					end: WALLCLOCK_ACTIVE_END,
					repeatCount: 'indefinite',
					video: makeVideo(),
				},
			} as any;

			await traverser.processPlaylist(playlist, 0, 'par', 0);

			// Enters while loop, getCancelFunction breaks after 1 iteration
			expect(engine.actions.playElement.calls.length).to.equal(1);
		});

		it('should override indefinite to definite for multiple wallclock elements', async () => {
			const engine = createMockEngine({ config: { defaultRepeatCount: 'indefinite' } });
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				seq: [
					{
						begin: WALLCLOCK_ACTIVE_BEGIN,
						end: WALLCLOCK_ACTIVE_END,
						repeatCount: 'indefinite',
						video: makeVideo('first.mp4'),
					},
					{
						begin: WALLCLOCK_ACTIVE_BEGIN,
						end: WALLCLOCK_ACTIVE_END,
						repeatCount: 'indefinite',
						video: makeVideo('second.mp4'),
					},
				],
			} as any;

			await traverser.processPlaylist(playlist, 0, 'par', 0);

			// Both played once (indefinite overridden to definite for multi-element seq)
			expect(engine.actions.playElement.calls.length).to.equal(2);
		});

		it('should use default promise for active wallclock with no repeatCount match', async () => {
			const engine = createMockEngine({ config: { defaultRepeatCount: '2' } });
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				seq: {
					begin: WALLCLOCK_ACTIVE_BEGIN,
					end: WALLCLOCK_ACTIVE_END,
					video: makeVideo(),
				},
			} as any;

			await traverser.processPlaylist(playlist, 0, 'par', 0);

			expect(engine.actions.playElement.calls.length).to.equal(1);
		});
	});

	// ===== Group G: seq tag — playMode =====

	describe('processPlaylist - seq playMode', () => {
		it('should call coordinatePlayModeSync for playMode=one with sync enabled', async () => {
			const engine = createMockEngine({
				config: { shouldSync: true, defaultRepeatCount: '1' },
			});
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				seq: {
					playMode: 'one',
					video1: { ...makeVideo('v1.mp4'), syncIndex: 0 },
					video2: { ...makeVideo('v2.mp4'), syncIndex: 1 },
				},
			} as any;

			await traverser.processPlaylist(playlist, 0, 'par', 0);

			expect(engine.actions.coordinatePlayModeSync.calls.length).to.equal(1);
			// First arg is regionName
			expect(engine.actions.coordinatePlayModeSync.calls[0][0]).to.equal('main');
		});

		it('should NOT call coordinatePlayModeSync for playMode=random without sync', async () => {
			const engine = createMockEngine({
				config: { shouldSync: false, defaultRepeatCount: '1' },
			});
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				seq: {
					playMode: 'random',
					video1: { ...makeVideo('v1.mp4'), syncIndex: 0 },
					video2: { ...makeVideo('v2.mp4'), syncIndex: 1 },
				},
			} as any;

			await traverser.processPlaylist(playlist, 0, 'par', 0);

			expect(engine.actions.coordinatePlayModeSync.calls.length).to.equal(0);
			// Elements still played (shuffled order)
			expect(engine.actions.playElement.calls.length).to.be.greaterThan(0);
		});

		it('should update randomPlaylist.previousIndex from coordinatePlayModeSync result', async () => {
			const engine = createMockEngine({
				config: { shouldSync: true, defaultRepeatCount: '1' },
				actions: { coordinatePlayModeSync: stub().resolves(1) },
			});
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				seq: {
					playMode: 'one',
					video1: { ...makeVideo('v1.mp4'), syncIndex: 0 },
					video2: { ...makeVideo('v2.mp4'), syncIndex: 1 },
				},
			} as any;

			await traverser.processPlaylist(playlist, 0, 'par', 0);

			// randomPlaylist should have an entry with updated previousIndex
			const keys = Object.keys(engine.control.randomPlaylist);
			expect(keys.length).to.be.greaterThan(0);
			// After coordinatePlayModeSync returns 1, getNextElementToPlay increments it
			const entry = engine.control.randomPlaylist[keys[0]];
			expect(entry.previousIndex).to.be.a('number');
		});
	});

	// ===== Group H: allExpired return value =====

	describe('processPlaylist - allExpired return', () => {
		beforeEach(() => {
			MockDate.set(new Date('2025-06-15T12:00:00'));
		});

		afterEach(() => {
			MockDate.reset();
		});

		it('should return allExpired when all wallclock elements are neverPlay', async () => {
			const engine = createMockEngine({ config: { defaultRepeatCount: '1' } });
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				par1: {
					begin: WALLCLOCK_NEVER_PLAY_BEGIN,
					end: WALLCLOCK_NEVER_PLAY_END,
					video: makeVideo('first.mp4'),
				},
				par2: {
					begin: WALLCLOCK_NEVER_PLAY_BEGIN,
					end: WALLCLOCK_NEVER_PLAY_END,
					video: makeVideo('second.mp4'),
				},
			} as any;

			const result = await traverser.processPlaylist(playlist, 0, '', 0);

			expect(result).to.equal(SMILScheduleEnum.allExpired);
			expect(engine.actions.playElement.calls.length).to.equal(0);
		});

		it('should NOT return allExpired when mix of neverPlay and active', async () => {
			const engine = createMockEngine({ config: { defaultRepeatCount: '1' } });
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				par1: {
					begin: WALLCLOCK_NEVER_PLAY_BEGIN,
					end: WALLCLOCK_NEVER_PLAY_END,
					video: makeVideo('never.mp4'),
				},
				par2: {
					begin: WALLCLOCK_ACTIVE_BEGIN,
					end: WALLCLOCK_ACTIVE_END,
					video: makeVideo('active.mp4'),
				},
			} as any;

			const result = await traverser.processPlaylist(playlist, 0, '', 0);

			expect(result).to.not.equal(SMILScheduleEnum.allExpired);
			expect(engine.actions.playElement.calls.length).to.equal(1);
		});
	});

	// ===== Group I: Private helper edge cases =====

	describe('processPlaylist - private helper edge cases', () => {
		beforeEach(() => {
			MockDate.set(new Date('2025-06-15T12:00:00'));
		});

		afterEach(() => {
			MockDate.reset();
		});

		it('should call waitTimeoutOrFileUpdate when timeToStart > 0', async () => {
			const engine = createMockEngine({ config: { defaultRepeatCount: '2' } });
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				par: {
					begin: WALLCLOCK_FUTURE_BEGIN,
					end: WALLCLOCK_FUTURE_END,
					video: makeVideo(),
				},
			} as any;

			await traverser.processPlaylist(playlist, 0, '', 0);

			expect(engine.control.waitTimeoutOrFileUpdate.calls.length).to.equal(1);
			// timeToStart should be positive (future schedule)
			expect(engine.control.waitTimeoutOrFileUpdate.calls[0][0]).to.be.greaterThan(0);
			// File not updated (returns false) so element plays
			expect(engine.actions.playElement.calls.length).to.equal(1);
		});

		it('should skip element when waitTimeoutOrFileUpdate returns true (file updated)', async () => {
			const engine = createMockEngine({
				config: { defaultRepeatCount: '2' },
				control: { waitTimeoutOrFileUpdate: stub().resolves(true) },
			});
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				par: {
					begin: WALLCLOCK_FUTURE_BEGIN,
					end: WALLCLOCK_FUTURE_END,
					video: makeVideo(),
				},
			} as any;

			await traverser.processPlaylist(playlist, 0, '', 0);

			// File was updated during wait — element not played
			expect(engine.actions.playElement.calls.length).to.equal(0);
		});

		it('should not execute repeat loop when version < playlistVersion', async () => {
			const engine = createMockEngine({
				config: { defaultRepeatCount: '1' },
				control: { getPlaylistVersion: () => 1 },
			});
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				par: { repeatCount: '1', video: makeVideo() },
			} as any;

			// version=0 < playlistVersion=1 → loop condition fails
			await traverser.processPlaylist(playlist, 0, '', 0);

			expect(engine.actions.playElement.calls.length).to.equal(0);
		});

		it('should process single iteration for indefinite with endTime between 1-1000', async () => {
			const engine = createMockEngine({ config: { defaultRepeatCount: 'indefinite' } });
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				par: { video: makeVideo() },
			} as any;

			await traverser.processPlaylist(playlist, 0, '', 500);

			expect(engine.actions.playElement.calls.length).to.equal(1);
			// runEndlessLoop should NOT be called (endTime is 500, not 0)
			expect(engine.control.runEndlessLoop.calls.length).to.equal(0);
		});

		it('should break while loop when getCancelFunction returns true', async () => {
			const endTimeValue = Date.now() + 100000;
			const engine = createMockEngine({
				config: { defaultRepeatCount: 'indefinite' },
				control: { getCancelFunction: () => true },
			});
			const traverser = new PlaylistTraverser(engine);
			const playlist = {
				par: { video: makeVideo() },
			} as any;

			await traverser.processPlaylist(playlist, 0, '', endTimeValue);

			// While loop enters once, getCancelFunction breaks it
			expect(engine.actions.playElement.calls.length).to.equal(1);
		});
	});
});
