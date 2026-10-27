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
			expect(isPriorityBlockedOrPaused(undefined)).to.equal(false);
		});

		it('should return false for normal playing entry', () => {
			const entry = makePriorityEntry({ player: { stop: false, contentPause: 0, endTime: 0, playing: true } });
			expect(isPriorityBlockedOrPaused(entry)).to.equal(false);
		});

		it('should return true when player is stopped', () => {
			const entry = makePriorityEntry({ player: { stop: true, contentPause: 0, endTime: 0, playing: false } });
			expect(isPriorityBlockedOrPaused(entry)).to.equal(true);
		});

		it('should return true when player is paused (contentPause > 0)', () => {
			const entry = makePriorityEntry({ player: { stop: false, contentPause: 9999999, endTime: 0, playing: false } });
			expect(isPriorityBlockedOrPaused(entry)).to.equal(true);
		});

		it('should return true when behaviour is pause', () => {
			const entry = makePriorityEntry({ behaviour: PriorityBehaviour.pause });
			expect(isPriorityBlockedOrPaused(entry)).to.equal(true);
		});

		it('should return false when behaviour is defer (not pause)', () => {
			const entry = makePriorityEntry({ behaviour: PriorityBehaviour.defer });
			expect(isPriorityBlockedOrPaused(entry)).to.equal(false);
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
			expect(isWallclockEndTimeExpired(undefined)).to.equal(false);
		});

		it('should return false when endTime is 0 (indefinite)', () => {
			const entry = makePriorityEntry({ player: { stop: false, contentPause: 0, endTime: 0, playing: true } });
			expect(isWallclockEndTimeExpired(entry)).to.equal(false);
		});

		it('should return false when endTime is a repeat count (e.g., 3)', () => {
			// repeat counts are <= ENDTIME_REPEAT_THRESHOLD (1000)
			const entry = makePriorityEntry({ player: { stop: false, contentPause: 0, endTime: 3, playing: true } });
			expect(isWallclockEndTimeExpired(entry)).to.equal(false);
		});

		it('should return true when endTime is a past timestamp', () => {
			const pastTimestamp = Date.now() - 60000; // 1 minute ago
			const entry = makePriorityEntry({ player: { stop: false, contentPause: 0, endTime: pastTimestamp, playing: true } });
			expect(isWallclockEndTimeExpired(entry)).to.equal(true);
		});

		it('should return false when endTime is a future timestamp', () => {
			const futureTimestamp = Date.now() + 60000; // 1 minute from now
			const entry = makePriorityEntry({ player: { stop: false, contentPause: 0, endTime: futureTimestamp, playing: true } });
			expect(isWallclockEndTimeExpired(entry)).to.equal(false);
		});

		it('should return false when endTime equals ENDTIME_REPEAT_THRESHOLD (boundary)', () => {
			const entry = makePriorityEntry({ player: { stop: false, contentPause: 0, endTime: 1000, playing: true } });
			expect(isWallclockEndTimeExpired(entry)).to.equal(false);
		});
	});

	describe('isTriggerCancelled', () => {
		it('should return false when triggerValue is undefined', () => {
			expect(isTriggerCancelled(undefined, {})).to.equal(false);
		});

		it('should return false when trigger is still playing', () => {
			expect(isTriggerCancelled('trigger1', { trigger1: { play: true } })).to.equal(false);
		});

		it('should return true when trigger play is false', () => {
			expect(isTriggerCancelled('trigger1', { trigger1: { play: false } })).to.equal(true);
		});

		it('should return true when trigger does not exist in map', () => {
			expect(isTriggerCancelled('trigger1', {})).to.equal(true);
		});
	});

	describe('isDynamicPlaylistCancelled', () => {
		it('should return false when dynamicValue is undefined', () => {
			expect(isDynamicPlaylistCancelled({
				dynamicValue: undefined,
				dynamicPlaylist: {},
				elementSrc: 'a.mp4',
				currentlyPlayingSrc: 'b.mp4',
			})).to.equal(false);
		});

		it('should return false when dynamic playlist is still playing', () => {
			expect(isDynamicPlaylistCancelled({
				dynamicValue: 'dyn1',
				dynamicPlaylist: { dyn1: { play: true } },
				elementSrc: 'a.mp4',
				currentlyPlayingSrc: 'b.mp4',
			})).to.equal(false);
		});

		it('should return true when dynamic playlist is cancelled and src differs', () => {
			expect(isDynamicPlaylistCancelled({
				dynamicValue: 'dyn1',
				dynamicPlaylist: { dyn1: { play: false } },
				elementSrc: 'a.mp4',
				currentlyPlayingSrc: 'b.mp4',
			})).to.equal(true);
		});

		it('should return false when dynamic playlist is cancelled but src matches (currently playing)', () => {
			expect(isDynamicPlaylistCancelled({
				dynamicValue: 'dyn1',
				dynamicPlaylist: { dyn1: { play: false } },
				elementSrc: 'a.mp4',
				currentlyPlayingSrc: 'a.mp4',
			})).to.equal(false);
		});
	});

	describe('shouldCancelForVersionUpdate', () => {
		it('should return true when newer version arrives and loop not started', () => {
			expect(shouldCancelForVersionUpdate({
				checkFilesLoop: false,
				incomingVersion: 2,
				currentPlaylistVersion: 1,
			})).to.equal(true);
		});

		it('should return false when check files loop already running', () => {
			expect(shouldCancelForVersionUpdate({
				checkFilesLoop: true,
				incomingVersion: 2,
				currentPlaylistVersion: 1,
			})).to.equal(false);
		});

		it('should return false when incoming version is not newer', () => {
			expect(shouldCancelForVersionUpdate({
				checkFilesLoop: false,
				incomingVersion: 1,
				currentPlaylistVersion: 1,
			})).to.equal(false);
		});

		it('should return false when incoming version is older', () => {
			expect(shouldCancelForVersionUpdate({
				checkFilesLoop: false,
				incomingVersion: 1,
				currentPlaylistVersion: 2,
			})).to.equal(false);
		});
	});

	describe('shouldCancelParentRegion', () => {
		it('should return true when parent differs from element and parent is playing', () => {
			expect(shouldCancelParentRegion({
				parentRegionName: 'fullScreen',
				elementRegionName: 'video',
				parentRegionPlaying: true,
			})).to.equal(true);
		});

		it('should return false when parent is same as element region', () => {
			expect(shouldCancelParentRegion({
				parentRegionName: 'video',
				elementRegionName: 'video',
				parentRegionPlaying: true,
			})).to.equal(false);
		});

		it('should return false when parent is not playing', () => {
			expect(shouldCancelParentRegion({
				parentRegionName: 'fullScreen',
				elementRegionName: 'video',
				parentRegionPlaying: false,
			})).to.equal(false);
		});
	});
});
