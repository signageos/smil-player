import * as chai from 'chai';
import {
	getResyncTargetForState,
	getPriorityBounds,
	getWrappedSyncIndex,
	getNextEffectiveSyncIndex,
	isWraparoundScenario,
	hasPriorityChanged,
	shouldSkipForResync,
	processElementState,
	ProcessAction,
	ProcessElementStateContext,
} from '../../../src/components/playlist/playlistProcessor/smilElementDecisions';
import { VirtualElementState } from '../../../src/models/syncModels';

const expect = chai.expect;

function makeVirtualElementState(overrides: Partial<VirtualElementState> = {}): VirtualElementState {
	return {
		state: 'prepared',
		regionName: 'main',
		syncIndex: 1,
		timestamp: Date.now(),
		...overrides,
	};
}

function makeProcessContext(overrides: Partial<ProcessElementStateContext> = {}): ProcessElementStateContext {
	return {
		maxSyncIndexPerRegion: undefined,
		slaveEffectiveMax: undefined,
		slaveEffectiveMin: undefined,
		syncingInAction: false,
		playModeSyncRanges: undefined,
		slaveMaxSyncIndex: undefined,
		slaveMinSyncIndex: undefined,
		globalMaxSyncIndex: undefined,
		...overrides,
	};
}

describe('smilElementDecisions', () => {
	describe('getResyncTargetForState', () => {
		it('should return undefined when resyncTargets is undefined', () => {
			expect(getResyncTargetForState('prepared', undefined)).to.be.undefined;
		});

		it('should return prepare value for prepared state', () => {
			expect(getResyncTargetForState('prepared', { prepare: 5 })).to.equal(5);
		});

		it('should return play value for playing state', () => {
			expect(getResyncTargetForState('playing', { play: 3 })).to.equal(3);
		});

		it('should return finish value for finished state', () => {
			expect(getResyncTargetForState('finished', { finish: 7 })).to.equal(7);
		});

		it('should return undefined when specific field is not set', () => {
			expect(getResyncTargetForState('prepared', { play: 3 })).to.be.undefined;
		});
	});

	describe('getPriorityBounds', () => {
		it('should return undefined when priorityLevel is undefined', () => {
			expect(getPriorityBounds('main', undefined, { main: { 1: { min: 1, max: 5 } } })).to.be.undefined;
		});

		it('should return undefined when no bounds exist for region', () => {
			expect(getPriorityBounds('other', 1, { main: { 1: { min: 1, max: 5 } } })).to.be.undefined;
		});

		it('should return undefined when no bounds exist for priority level', () => {
			expect(getPriorityBounds('main', 2, { main: { 1: { min: 1, max: 5 } } })).to.be.undefined;
		});

		it('should return correct bounds when present', () => {
			const result = getPriorityBounds('main', 1, { main: { 1: { min: 2, max: 8 } } });
			expect(result).to.deep.equal({ min: 2, max: 8 });
		});

		it('should return undefined when boundsMap is undefined', () => {
			expect(getPriorityBounds('main', 1, undefined)).to.be.undefined;
		});
	});

	describe('getWrappedSyncIndex', () => {
		it('should return nextIndex when no wrapping needed', () => {
			expect(getWrappedSyncIndex(3, undefined, undefined, undefined, undefined, undefined)).to.equal(3);
		});

		it('should wrap to priorityMinSyncIndex when exceeding priorityMaxSyncIndex', () => {
			expect(getWrappedSyncIndex(10, 8, 2, undefined, undefined, undefined)).to.equal(2);
		});

		it('should default priorityMinSyncIndex to 1 when undefined', () => {
			expect(getWrappedSyncIndex(10, 8, undefined, undefined, undefined, undefined)).to.equal(1);
		});

		it('should wrap using slaveMaxSyncIndex when no priority bounds', () => {
			expect(getWrappedSyncIndex(10, undefined, undefined, 7, 3, undefined)).to.equal(3);
		});

		it('should wrap using globalMax as final fallback', () => {
			expect(getWrappedSyncIndex(10, undefined, undefined, undefined, undefined, 8)).to.equal(1);
		});

		it('should prefer priority bounds over slave/global bounds', () => {
			// priorityMax=8, slaveMax=5, globalMax=6 — should use priority
			expect(getWrappedSyncIndex(10, 8, 2, 5, 3, 6)).to.equal(2);
		});

		it('should return slaveMinSyncIndex when wrapping via slave bounds', () => {
			expect(getWrappedSyncIndex(10, undefined, undefined, 7, 4, undefined)).to.equal(4);
		});

		it('should return slaveMinSyncIndex when wrapping via global bounds', () => {
			expect(getWrappedSyncIndex(10, undefined, undefined, undefined, 4, 8)).to.equal(4);
		});

		it('should not wrap when nextIndex equals priorityMaxSyncIndex', () => {
			expect(getWrappedSyncIndex(8, 8, 2, undefined, undefined, undefined)).to.equal(8);
		});
	});

	describe('getNextEffectiveSyncIndex', () => {
		it('should return masterIndex + 1 when no playMode ranges exist', () => {
			expect(getNextEffectiveSyncIndex(5, 'main', undefined)).to.equal(6);
		});

		it('should return masterIndex + 1 when index is outside all ranges', () => {
			const ranges = { main: [{ start: 1, end: 3 }, { start: 7, end: 9 }] };
			expect(getNextEffectiveSyncIndex(5, 'main', ranges)).to.equal(6);
		});

		it('should return range.end + 1 when index is within a range', () => {
			const ranges = { main: [{ start: 2, end: 5 }] };
			expect(getNextEffectiveSyncIndex(3, 'main', ranges)).to.equal(6);
		});

		it('should work with multiple ranges and pick correct one', () => {
			const ranges = { main: [{ start: 1, end: 3 }, { start: 7, end: 9 }] };
			expect(getNextEffectiveSyncIndex(8, 'main', ranges)).to.equal(10);
		});

		it('should return masterIndex + 1 when region has no ranges', () => {
			const ranges = { other: [{ start: 1, end: 3 }] };
			expect(getNextEffectiveSyncIndex(5, 'main', ranges)).to.equal(6);
		});

		it('should match range boundary (start)', () => {
			const ranges = { main: [{ start: 3, end: 6 }] };
			expect(getNextEffectiveSyncIndex(3, 'main', ranges)).to.equal(7);
		});

		it('should match range boundary (end)', () => {
			const ranges = { main: [{ start: 3, end: 6 }] };
			expect(getNextEffectiveSyncIndex(6, 'main', ranges)).to.equal(7);
		});
	});

	describe('isWraparoundScenario', () => {
		it('should return false when no maxIndex is available', () => {
			expect(isWraparoundScenario(1, 5, undefined, undefined, undefined, 'main', undefined, undefined, undefined)).to.be.false;
		});

		it('should return true when slave at start and master at end', () => {
			// slave=1, master=9, max=10 → slave at start, master near end
			expect(isWraparoundScenario(1, 9, undefined, 10, undefined, 'main', undefined, undefined, undefined)).to.be.true;
		});

		it('should return false when both at start', () => {
			expect(isWraparoundScenario(1, 2, undefined, 10, undefined, 'main', undefined, undefined, undefined)).to.be.false;
		});

		it('should return false when both at end', () => {
			expect(isWraparoundScenario(9, 10, undefined, 10, undefined, 'main', undefined, undefined, undefined)).to.be.false;
		});

		it('should respect priority bounds over global bounds', () => {
			// priorityMin=5, priorityMax=10 → slave=5 is at start of priority range, master=9 at end
			expect(isWraparoundScenario(5, 9, 5, 10, 20, 'main', undefined, undefined, undefined)).to.be.true;
		});

		it('should use slaveEffectiveMax/Min when priority not available', () => {
			// slaveEffMin=2, slaveEffMax=8 → slave=2 at start, master=8 at end
			expect(isWraparoundScenario(2, 8, undefined, undefined, undefined, 'main', 8, 2, undefined)).to.be.true;
		});

		it('should account for playMode ranges (effectiveNext exceeds maxIndex)', () => {
			// master=7, playMode range [7,9] → effectiveNext=10 > maxIndex=9
			const ranges = { main: [{ start: 7, end: 9 }] };
			expect(isWraparoundScenario(1, 7, undefined, 9, undefined, 'main', undefined, undefined, ranges)).to.be.true;
		});

		it('should return false when slave not at start (above tolerance)', () => {
			// slave=4 is not within minIndex(1) + 1 = 2
			expect(isWraparoundScenario(4, 9, undefined, 10, undefined, 'main', undefined, undefined, undefined)).to.be.false;
		});
	});

	describe('hasPriorityChanged', () => {
		it('should return false when all undefined', () => {
			expect(hasPriorityChanged(undefined, undefined, undefined)).to.be.false;
		});

		it('should return true when stored equals message but expected is undefined and message is defined', () => {
			// expectedPriority===undefined && messagePriority!==undefined triggers change detection
			expect(hasPriorityChanged(1, 1, undefined)).to.be.true;
		});

		it('should return true when stored differs from message', () => {
			expect(hasPriorityChanged(1, 2, undefined)).to.be.true;
		});

		it('should return true when stored undefined and message defined', () => {
			expect(hasPriorityChanged(undefined, 1, undefined)).to.be.true;
		});

		it('should return true when expected differs from message', () => {
			expect(hasPriorityChanged(1, 1, 2)).to.be.true;
		});

		it('should return true when expected defined and message undefined', () => {
			expect(hasPriorityChanged(undefined, undefined, 1)).to.be.true;
		});

		it('should return false when stored and message both equal expected', () => {
			expect(hasPriorityChanged(1, 1, 1)).to.be.false;
		});

		it('should return true when stored matches message but expected differs', () => {
			expect(hasPriorityChanged(1, 1, 3)).to.be.true;
		});
	});

	describe('shouldSkipForResync', () => {
		it('should return false when not syncing in action', () => {
			expect(shouldSkipForResync(2, false, 5)).to.be.false;
		});

		it('should return false when resync target is undefined', () => {
			expect(shouldSkipForResync(2, true, undefined)).to.be.false;
		});

		it('should return false when syncIndex >= resyncTarget', () => {
			expect(shouldSkipForResync(5, true, 5)).to.be.false;
		});

		it('should return true when syncIndex < resyncTarget and syncing', () => {
			expect(shouldSkipForResync(2, true, 5)).to.be.true;
		});

		it('should return false when syncIndex above resyncTarget', () => {
			expect(shouldSkipForResync(7, true, 5)).to.be.false;
		});
	});

	describe('processElementState', () => {
		it('should return CONTINUE for exact match (not syncing)', () => {
			const value = makeVirtualElementState({ state: 'prepared', syncIndex: 3 });
			const result = processElementState(value, 'prepared', 3, 'main', makeProcessContext());
			expect(result.action).to.equal(ProcessAction.CONTINUE);
			expect(result.mutations).to.be.undefined;
		});

		it('should return CONTINUE with clearResyncTargets when exact match while syncing', () => {
			const value = makeVirtualElementState({ state: 'prepared', syncIndex: 3 });
			const result = processElementState(value, 'prepared', 3, 'main', makeProcessContext({ syncingInAction: true }));
			expect(result.action).to.equal(ProcessAction.CONTINUE);
			expect(result.mutations).to.deep.include({ clearResyncTargets: true, clearSyncingInAction: true });
		});

		it('should return WAIT when slave ahead of master (master syncIndex lower)', () => {
			const value = makeVirtualElementState({ state: 'prepared', syncIndex: 2 });
			const result = processElementState(value, 'prepared', 5, 'main', makeProcessContext());
			expect(result.action).to.equal(ProcessAction.WAIT);
		});

		it('should return RESYNC when master ahead with same state (prepared)', () => {
			const value = makeVirtualElementState({ state: 'prepared', syncIndex: 7 });
			const result = processElementState(value, 'prepared', 3, 'main', makeProcessContext());
			expect(result.action).to.equal(ProcessAction.RESYNC);
			expect(result.mutations!.setSyncingInAction).to.be.true;
			expect(result.mutations!.setResyncTarget!.field).to.equal('prepare');
			expect(result.mutations!.setResyncTarget!.value).to.equal(8);
		});

		it('should return RESYNC when master ahead with same state (playing)', () => {
			const value = makeVirtualElementState({ state: 'playing', syncIndex: 7 });
			const result = processElementState(value, 'playing', 3, 'main', makeProcessContext());
			expect(result.action).to.equal(ProcessAction.RESYNC);
			expect(result.mutations!.setResyncTarget!.field).to.equal('play');
		});

		it('should return RESYNC when master ahead with same state (finished)', () => {
			const value = makeVirtualElementState({ state: 'finished', syncIndex: 7 });
			const result = processElementState(value, 'finished', 3, 'main', makeProcessContext());
			expect(result.action).to.equal(ProcessAction.RESYNC);
			expect(result.mutations!.setResyncTarget!.field).to.equal('finish');
		});

		it('should return RESYNC when waiting for prepared but master already playing future element', () => {
			const value = makeVirtualElementState({ state: 'playing', syncIndex: 5 });
			const result = processElementState(value, 'prepared', 2, 'main', makeProcessContext());
			expect(result.action).to.equal(ProcessAction.RESYNC);
			expect(result.mutations!.setSyncingInAction).to.be.true;
			expect(result.mutations!.setResyncTarget!.field).to.equal('prepare');
			expect(result.mutations!.setResyncTarget!.value).to.equal(6);
		});

		it('should return RESYNC when behind in state progression (same syncIndex)', () => {
			// Slave expects 'prepared' but master is at 'playing' for same syncIndex
			const value = makeVirtualElementState({ state: 'playing', syncIndex: 3 });
			const result = processElementState(value, 'prepared', 3, 'main', makeProcessContext());
			expect(result.action).to.equal(ProcessAction.RESYNC);
			expect(result.mutations!.setResyncTarget!.field).to.equal('prepare');
		});

		it('should return WAIT when ahead in state progression (same syncIndex)', () => {
			// Slave expects 'playing' but master is at 'prepared' for same syncIndex
			const value = makeVirtualElementState({ state: 'prepared', syncIndex: 3 });
			const result = processElementState(value, 'playing', 3, 'main', makeProcessContext());
			expect(result.action).to.equal(ProcessAction.WAIT);
		});

		it('should return WAIT as default when no condition matches', () => {
			// Different state AND different syncIndex, master behind
			const value = makeVirtualElementState({ state: 'finished', syncIndex: 1 });
			const result = processElementState(value, 'prepared', 5, 'main', makeProcessContext());
			expect(result.action).to.equal(ProcessAction.WAIT);
		});

		it('should wrap resync target using priority bounds', () => {
			const value = makeVirtualElementState({
				state: 'prepared',
				syncIndex: 9,
				priorityMaxSyncIndex: 9,
				priorityMinSyncIndex: 3,
			});
			const result = processElementState(value, 'prepared', 5, 'main', makeProcessContext());
			expect(result.action).to.equal(ProcessAction.RESYNC);
			// nextEffective = 10, wraps via priority to min=3
			expect(result.mutations!.setResyncTarget!.value).to.equal(3);
		});

		it('should handle wraparound scenario (slave at start, master at end)', () => {
			const value = makeVirtualElementState({
				state: 'prepared',
				syncIndex: 9,
				priorityMaxSyncIndex: 10,
			});
			const ctx = makeProcessContext({ maxSyncIndexPerRegion: 10 });
			// slave=1, master=9 with max=10 → wraparound → WAIT
			const result = processElementState(value, 'prepared', 1, 'main', ctx);
			expect(result.action).to.equal(ProcessAction.WAIT);
		});

		it('should use playMode ranges when computing next effective index', () => {
			const value = makeVirtualElementState({ state: 'prepared', syncIndex: 7 });
			const ctx = makeProcessContext({
				playModeSyncRanges: { main: [{ start: 7, end: 9 }] },
			});
			const result = processElementState(value, 'prepared', 3, 'main', ctx);
			expect(result.action).to.equal(ProcessAction.RESYNC);
			// nextEffective = 10 (skips past range end 9)
			expect(result.mutations!.setResyncTarget!.value).to.equal(10);
		});

		it('should return RESYNC for state progression behind (finished vs prepared)', () => {
			const value = makeVirtualElementState({ state: 'finished', syncIndex: 3 });
			const result = processElementState(value, 'prepared', 3, 'main', makeProcessContext());
			expect(result.action).to.equal(ProcessAction.RESYNC);
			expect(result.mutations!.setResyncTarget!.field).to.equal('prepare');
		});

		it('should return WAIT for state progression ahead (prepared vs finished)', () => {
			const value = makeVirtualElementState({ state: 'prepared', syncIndex: 3 });
			const result = processElementState(value, 'finished', 3, 'main', makeProcessContext());
			expect(result.action).to.equal(ProcessAction.WAIT);
		});
	});
});
