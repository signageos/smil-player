import * as chai from 'chai';
import MockDate from 'mockdate';
import { SMILScheduleEnum } from '../../../src/enums/scheduleEnums';
import { createScheduleTools } from '../../../src/components/playlist/tools/scheduleTools';
import { Log, noopLog } from '../../../src/logger';
import { PlaylistElement } from '../../../src/models/playlistModels';

const expect = chai.expect;
const { setDefaultAwait, setDefaultAwaitWallclock, setDefaultAwaitConditional, setElementDuration } =
	createScheduleTools(noopLog);

describe('createScheduleTools', () => {
	it('two instances log to their own Log', () => {
		const seen: string[] = [];
		const mk = (ns: string) =>
			new Log(
				{
					write: (e) => {
						seen.push(e.namespace);
					},
				},
				ns,
			);
		const a = createScheduleTools(mk('a'));
		const b = createScheduleTools(mk('b'));
		a.setElementDuration('indefinite');
		b.setElementDuration('indefinite');
		expect(seen).to.include('a');
		expect(seen).to.include('b');
		expect(seen.filter((n) => n === 'a').length).to.equal(seen.filter((n) => n === 'b').length);
	});
});

describe('scheduleTools direct function tests', () => {
	afterEach(() => {
		MockDate.reset();
	});

	describe('setDefaultAwaitWallclock', () => {
		it('should return playImmediately for active wallclock (current time inside window)', () => {
			MockDate.set('2025-06-15T10:00:00Z');
			const element: PlaylistElement = {
				begin: 'wallclock(2025-01-01T00:00)',
				end: 'wallclock(2025-12-31T23:59)',
			};
			expect(setDefaultAwaitWallclock(element)).to.equal(SMILScheduleEnum.playImmediately);
		});

		it('should return defaultAwait for future wallclock (not yet playable)', () => {
			MockDate.set('2025-06-15T10:00:00Z');
			const element: PlaylistElement = {
				begin: 'wallclock(2030-01-01T00:00)',
				end: 'wallclock(2030-12-31T23:59)',
			};
			expect(setDefaultAwaitWallclock(element)).to.equal(SMILScheduleEnum.defaultAwait);
		});

		it('should return defaultAwait for expired wallclock (permanently past)', () => {
			MockDate.set('2025-06-15T10:00:00Z');
			const element: PlaylistElement = {
				begin: 'wallclock(2020-01-01T00:00)',
				end: 'wallclock(2020-06-01T00:00)',
				repeatCount: '1',
			};
			expect(setDefaultAwaitWallclock(element)).to.equal(SMILScheduleEnum.defaultAwait);
		});

		it('should return playImmediately for recurring wallclock in active window', () => {
			MockDate.set('2025-06-15T10:00:00Z');
			const element: PlaylistElement = {
				begin: 'wallclock(R/2025-06-15T09:00/P1D)',
				end: 'wallclock(R/2025-06-15T18:00/P1D)',
			};
			expect(setDefaultAwaitWallclock(element)).to.equal(SMILScheduleEnum.playImmediately);
		});

		it('should return defaultAwait for recurring wallclock outside active window', () => {
			MockDate.set('2025-06-15T20:00:00Z');
			const element: PlaylistElement = {
				begin: 'wallclock(R/2025-06-15T09:00/P1D)',
				end: 'wallclock(R/2025-06-15T18:00/P1D)',
			};
			expect(setDefaultAwaitWallclock(element)).to.equal(SMILScheduleEnum.defaultAwait);
		});

		it('should return playImmediately for wallclock with no end (uses future default)', () => {
			MockDate.set('2025-06-15T10:00:00Z');
			const element: PlaylistElement = {
				begin: 'wallclock(2020-01-01T00:00)',
			};
			expect(setDefaultAwaitWallclock(element)).to.equal(SMILScheduleEnum.playImmediately);
		});
	});

	describe('setDefaultAwaitConditional', () => {
		it('should return playImmediately for active conditional (date before future date)', () => {
			MockDate.set('2025-06-15T10:00:00Z');
			const element: PlaylistElement = {
				expr: "adapi-compare(adapi-date(),'2030-01-01T00:00:00')<0",
			};
			expect(setDefaultAwaitConditional(element, 'player1', 'id1')).to.equal(
				SMILScheduleEnum.playImmediately,
			);
		});

		it('should return defaultAwait for expired conditional (date after past date)', () => {
			MockDate.set('2025-06-15T10:00:00Z');
			const element: PlaylistElement = {
				expr: "adapi-compare(adapi-date(),'2010-01-01T00:00:00')<0",
			};
			expect(setDefaultAwaitConditional(element, 'player1', 'id1')).to.equal(
				SMILScheduleEnum.defaultAwait,
			);
		});

		it('should return playImmediately for matching playerName conditional', () => {
			const element: PlaylistElement = {
				expr: "adapi-compare(smil-playerName(),'myPlayer')=0",
			};
			expect(setDefaultAwaitConditional(element, 'myPlayer', 'id1')).to.equal(
				SMILScheduleEnum.playImmediately,
			);
		});

		it('should return defaultAwait for non-matching playerName conditional', () => {
			const element: PlaylistElement = {
				expr: "adapi-compare(smil-playerName(),'otherPlayer')=0",
			};
			expect(setDefaultAwaitConditional(element, 'myPlayer', 'id1')).to.equal(
				SMILScheduleEnum.defaultAwait,
			);
		});

		it('should return playImmediately for matching playerId conditional', () => {
			const element: PlaylistElement = {
				expr: "adapi-compare(smil-playerId(),'device-123')=0",
			};
			expect(setDefaultAwaitConditional(element, 'player1', 'device-123')).to.equal(
				SMILScheduleEnum.playImmediately,
			);
		});
	});

	describe('setElementDuration', () => {
		it('returns infiniteDuration for literal "indefinite"', () => {
			expect(setElementDuration('indefinite')).to.equal(SMILScheduleEnum.infiniteDuration);
		});

		it('returns defaultDuration when dur is undefined', () => {
			expect(setElementDuration(undefined)).to.equal(SMILScheduleEnum.defaultDuration);
		});

		it('parses a plain numeric duration in seconds', () => {
			expect(setElementDuration('5s')).to.equal(5000);
		});

		it('parses a decimal duration', () => {
			expect(setElementDuration('5.5s')).to.equal(5500);
		});

		it('accepts the European comma as a decimal separator', () => {
			// Some SMIL authoring tools emit "5,5s" instead of "5.5s".
			expect(setElementDuration('5,5s')).to.equal(5500);
		});

		it('parses "0s" as a literal zero-millisecond duration', () => {
			// Zero is a valid parsed value, distinct from defaultDuration.
			// Callers that treat 0 as "unspecified" must handle that upstream.
			expect(setElementDuration('0s')).to.equal(0);
		});

		it('falls back to defaultDuration for non-numeric input', () => {
			expect(setElementDuration('abc')).to.equal(SMILScheduleEnum.defaultDuration);
		});

		it('strips a leading minus sign, so "-5s" parses as 5000ms', () => {
			// Locks in current behaviour: the sanitizer's character class
			// /[^0-9.]/g strips the `-`, so a negative duration collapses
			// to its absolute value. SMIL has no concept of negative
			// duration, so this degrades gracefully rather than throwing.
			expect(setElementDuration('-5s')).to.equal(5000);
		});
	});
});

describe('setDefaultAwait with skipContentMark runtime flag', () => {
	// A skip-marked element must never count as a playable candidate — without
	// this, a marked element with no begin/expr would return playImmediately
	// from the no-begin-no-expr early exit and regress seq scheduling.

	it('marked element without begin/expr is not a playable candidate', () => {
		expect(setDefaultAwait([{ skipContentMark: true } as any])).to.equal(SMILScheduleEnum.defaultAwait);
	});

	it('unmarked sibling after a marked element keeps the array playable', () => {
		expect(setDefaultAwait([{ skipContentMark: true } as any, {}])).to.equal(SMILScheduleEnum.playImmediately);
	});
});
