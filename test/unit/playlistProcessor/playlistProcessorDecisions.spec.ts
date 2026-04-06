import * as chai from 'chai';
import MockDate from 'mockdate';
import { PriorityBehaviour } from '../../../src/enums/priorityEnums';
import {
	isPriorityBlockedOrPaused,
	isWallclockEndTimeExpired,
	isTriggerCancelled,
	isDynamicPlaylistCancelled,
	shouldCancelForVersionUpdate,
	shouldCancelParentRegion,
	PriorityEntry,
} from '../../../src/components/playlist/playlistProcessor/playlistProcessorDecisions';

const expect = chai.expect;

function makePriorityEntry(overrides: Partial<PriorityEntry> = {}): PriorityEntry {
	return {
		player: {
			stop: false,
			contentPause: 0,
			endTime: 0,
			playing: false,
		},
		behaviour: PriorityBehaviour.none,
		...overrides,
	};
}

describe('playlistProcessorDecisions', () => {
	describe('isPriorityBlockedOrPaused', () => {
		it('should return false for undefined entry', () => {
			expect(isPriorityBlockedOrPaused(undefined)).to.be.false;
		});

		it('should return false for normal playing entry', () => {
			const entry = makePriorityEntry({ player: { stop: false, contentPause: 0, endTime: 0, playing: true } });
			expect(isPriorityBlockedOrPaused(entry)).to.be.false;
		});

		it('should return true when player is stopped', () => {
			const entry = makePriorityEntry({ player: { stop: true, contentPause: 0, endTime: 0, playing: false } });
			expect(isPriorityBlockedOrPaused(entry)).to.be.true;
		});

		it('should return true when player is paused (contentPause > 0)', () => {
			const entry = makePriorityEntry({ player: { stop: false, contentPause: 9999999, endTime: 0, playing: false } });
			expect(isPriorityBlockedOrPaused(entry)).to.be.true;
		});

		it('should return true when behaviour is pause', () => {
			const entry = makePriorityEntry({ behaviour: PriorityBehaviour.pause });
			expect(isPriorityBlockedOrPaused(entry)).to.be.true;
		});

		it('should return false when behaviour is defer (not pause)', () => {
			const entry = makePriorityEntry({ behaviour: PriorityBehaviour.defer });
			expect(isPriorityBlockedOrPaused(entry)).to.be.false;
		});
	});

	describe('isWallclockEndTimeExpired', () => {
		beforeEach(() => {
			MockDate.set('2025-06-15T12:00:00Z');
		});

		afterEach(() => {
			MockDate.reset();
		});

		it('should return false for undefined entry', () => {
			expect(isWallclockEndTimeExpired(undefined)).to.be.false;
		});

		it('should return false when endTime is 0 (indefinite)', () => {
			const entry = makePriorityEntry({ player: { stop: false, contentPause: 0, endTime: 0, playing: true } });
			expect(isWallclockEndTimeExpired(entry)).to.be.false;
		});

		it('should return false when endTime is a repeat count (e.g., 3)', () => {
			// repeat counts are <= ENDTIME_REPEAT_THRESHOLD (1000)
			const entry = makePriorityEntry({ player: { stop: false, contentPause: 0, endTime: 3, playing: true } });
			expect(isWallclockEndTimeExpired(entry)).to.be.false;
		});

		it('should return true when endTime is a past timestamp', () => {
			const pastTimestamp = Date.now() - 60000; // 1 minute ago
			const entry = makePriorityEntry({ player: { stop: false, contentPause: 0, endTime: pastTimestamp, playing: true } });
			expect(isWallclockEndTimeExpired(entry)).to.be.true;
		});

		it('should return false when endTime is a future timestamp', () => {
			const futureTimestamp = Date.now() + 60000; // 1 minute from now
			const entry = makePriorityEntry({ player: { stop: false, contentPause: 0, endTime: futureTimestamp, playing: true } });
			expect(isWallclockEndTimeExpired(entry)).to.be.false;
		});

		it('should return false when endTime equals ENDTIME_REPEAT_THRESHOLD (boundary)', () => {
			const entry = makePriorityEntry({ player: { stop: false, contentPause: 0, endTime: 1000, playing: true } });
			expect(isWallclockEndTimeExpired(entry)).to.be.false;
		});
	});

	describe('isTriggerCancelled', () => {
		it('should return false when triggerValue is undefined', () => {
			expect(isTriggerCancelled(undefined, {})).to.be.false;
		});

		it('should return false when trigger is still playing', () => {
			expect(isTriggerCancelled('trigger1', { trigger1: { play: true } })).to.be.false;
		});

		it('should return true when trigger play is false', () => {
			expect(isTriggerCancelled('trigger1', { trigger1: { play: false } })).to.be.true;
		});

		it('should return true when trigger does not exist in map', () => {
			expect(isTriggerCancelled('trigger1', {})).to.be.true;
		});
	});

	describe('isDynamicPlaylistCancelled', () => {
		it('should return false when dynamicValue is undefined', () => {
			expect(isDynamicPlaylistCancelled(undefined, {}, 'a.mp4', 'b.mp4')).to.be.false;
		});

		it('should return false when dynamic playlist is still playing', () => {
			expect(isDynamicPlaylistCancelled('dyn1', { dyn1: { play: true } }, 'a.mp4', 'b.mp4')).to.be.false;
		});

		it('should return true when dynamic playlist is cancelled and src differs', () => {
			expect(isDynamicPlaylistCancelled('dyn1', { dyn1: { play: false } }, 'a.mp4', 'b.mp4')).to.be.true;
		});

		it('should return false when dynamic playlist is cancelled but src matches (currently playing)', () => {
			expect(isDynamicPlaylistCancelled('dyn1', { dyn1: { play: false } }, 'a.mp4', 'a.mp4')).to.be.false;
		});
	});

	describe('shouldCancelForVersionUpdate', () => {
		it('should return true when newer version arrives and loop not started', () => {
			expect(shouldCancelForVersionUpdate(false, 2, 1)).to.be.true;
		});

		it('should return false when check files loop already running', () => {
			expect(shouldCancelForVersionUpdate(true, 2, 1)).to.be.false;
		});

		it('should return false when incoming version is not newer', () => {
			expect(shouldCancelForVersionUpdate(false, 1, 1)).to.be.false;
		});

		it('should return false when incoming version is older', () => {
			expect(shouldCancelForVersionUpdate(false, 1, 2)).to.be.false;
		});
	});

	describe('shouldCancelParentRegion', () => {
		it('should return true when parent differs from element and parent is playing', () => {
			expect(shouldCancelParentRegion('fullScreen', 'video', true)).to.be.true;
		});

		it('should return false when parent is same as element region', () => {
			expect(shouldCancelParentRegion('video', 'video', true)).to.be.false;
		});

		it('should return false when parent is not playing', () => {
			expect(shouldCancelParentRegion('fullScreen', 'video', false)).to.be.false;
		});
	});
});
