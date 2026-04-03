import * as chai from 'chai';
import {
	determinePriorityRelation,
	selectApplicableRule,
	isPeerConflict,
	isEndTimeExpired,
	isRepeatCountExpired,
	isPlaylistFinished,
	shouldContinueWaiting,
	findMatchingEntryIndex,
	isMediaMatch,
} from '../../../src/components/playlist/playlistPriority/priorityDecisionEngine';
import { PriorityBehaviour, PriorityRule, ENDTIME_REPEAT_THRESHOLD } from '../../../src/enums/priorityEnums';
import { PriorityObject } from '../../../src/models/priorityModels';
import { CurrentlyPlayingRegion } from '../../../src/models/playlistModels';
import { SMILMedia } from '../../../src/models/mediaModels';

const expect = chai.expect;

function makePriorityObject(overrides: Partial<PriorityObject> = {}): PriorityObject {
	return {
		priorityLevel: 0,
		maxPriorityLevel: 2,
		lower: PriorityRule.defer,
		peer: PriorityRule.never,
		higher: PriorityRule.stop,
		...overrides,
	};
}

function makeRegion(overrides: Partial<CurrentlyPlayingRegion> = {}): CurrentlyPlayingRegion {
	return {
		media: { src: 'test.mp4', regionInfo: { regionName: 'main' } } as SMILMedia,
		priority: makePriorityObject(),
		player: {
			contentPause: 0,
			stop: false,
			endTime: 0,
			playing: false,
			timesPlayed: 0,
			playingCompletionDeferred: undefined,
		},
		parent: 'par-abc123',
		behaviour: PriorityBehaviour.none,
		version: 1,
		controlledPlaylist: null,
		isFirstInPlaylist: {} as SMILMedia,
		...overrides,
	};
}

describe('PriorityDecisionEngine', () => {
	describe('determinePriorityRelation', () => {
		it('should return "higher" when existing has lower priority level (higher priority)', () => {
			// existing level 0 (highest) vs incoming level 2 (lower) -> existing is higher priority
			expect(determinePriorityRelation(2, 0)).to.equal('higher');
		});

		it('should return "lower" when existing has higher priority level (lower priority)', () => {
			// existing level 2 (lower) vs incoming level 0 (highest) -> existing is lower priority
			expect(determinePriorityRelation(0, 2)).to.equal('lower');
		});

		it('should return "peer" when same priority level', () => {
			expect(determinePriorityRelation(1, 1)).to.equal('peer');
		});

		it('should return "peer" for zero-level equality', () => {
			expect(determinePriorityRelation(0, 0)).to.equal('peer');
		});
	});

	describe('selectApplicableRule', () => {
		it('should return higher rule for higher relation', () => {
			const priority = makePriorityObject({ higher: PriorityRule.stop });
			expect(selectApplicableRule('higher', priority)).to.equal(PriorityRule.stop);
		});

		it('should return peer rule for peer relation', () => {
			const priority = makePriorityObject({ peer: PriorityRule.pause });
			expect(selectApplicableRule('peer', priority)).to.equal(PriorityRule.pause);
		});

		it('should return lower rule for lower relation when defer', () => {
			const priority = makePriorityObject({ lower: PriorityRule.defer });
			expect(selectApplicableRule('lower', priority)).to.equal(PriorityRule.defer);
		});

		it('should return lower rule for lower relation when never', () => {
			const priority = makePriorityObject({ lower: PriorityRule.never });
			expect(selectApplicableRule('lower', priority)).to.equal(PriorityRule.never);
		});

		it('should remap stop to never for lower relation', () => {
			const priority = makePriorityObject({ lower: PriorityRule.stop });
			expect(selectApplicableRule('lower', priority)).to.equal(PriorityRule.never);
		});

		it('should remap pause to defer for lower relation', () => {
			const priority = makePriorityObject({ lower: PriorityRule.pause });
			expect(selectApplicableRule('lower', priority)).to.equal(PriorityRule.defer);
		});

		it('should return all rule types for higher relation', () => {
			expect(selectApplicableRule('higher', makePriorityObject({ higher: PriorityRule.stop }))).to.equal(PriorityRule.stop);
			expect(selectApplicableRule('higher', makePriorityObject({ higher: PriorityRule.pause }))).to.equal(PriorityRule.pause);
			expect(selectApplicableRule('higher', makePriorityObject({ higher: PriorityRule.defer }))).to.equal(PriorityRule.defer);
			expect(selectApplicableRule('higher', makePriorityObject({ higher: PriorityRule.never }))).to.equal(PriorityRule.never);
		});

		it('should return all rule types for peer relation', () => {
			expect(selectApplicableRule('peer', makePriorityObject({ peer: PriorityRule.stop }))).to.equal(PriorityRule.stop);
			expect(selectApplicableRule('peer', makePriorityObject({ peer: PriorityRule.pause }))).to.equal(PriorityRule.pause);
			expect(selectApplicableRule('peer', makePriorityObject({ peer: PriorityRule.defer }))).to.equal(PriorityRule.defer);
			expect(selectApplicableRule('peer', makePriorityObject({ peer: PriorityRule.never }))).to.equal(PriorityRule.never);
		});
	});

	describe('isPeerConflict', () => {
		it('should return true when same priority, different parent, playing, and valid endTime', () => {
			const existing = makeRegion({
				priority: makePriorityObject({ priorityLevel: 1 }),
				parent: 'par-111',
				player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0 },
			});
			expect(isPeerConflict(existing, {
				priorityLevel: 1,
				parent: 'par-222',
				endTime: Date.now() + 10000,
			})).to.be.true;
		});

		it('should return false when same parent', () => {
			const existing = makeRegion({
				priority: makePriorityObject({ priorityLevel: 1 }),
				parent: 'par-111',
				player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0 },
			});
			expect(isPeerConflict(existing, {
				priorityLevel: 1,
				parent: 'par-111',
				endTime: Date.now() + 10000,
			})).to.be.false;
		});

		it('should return false when different priority level', () => {
			const existing = makeRegion({
				priority: makePriorityObject({ priorityLevel: 1 }),
				parent: 'par-111',
				player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0 },
			});
			expect(isPeerConflict(existing, {
				priorityLevel: 2,
				parent: 'par-222',
				endTime: Date.now() + 10000,
			})).to.be.false;
		});

		it('should return false when not playing', () => {
			const existing = makeRegion({
				priority: makePriorityObject({ priorityLevel: 1 }),
				parent: 'par-111',
				player: { contentPause: 0, stop: false, endTime: 0, playing: false, timesPlayed: 0 },
			});
			expect(isPeerConflict(existing, {
				priorityLevel: 1,
				parent: 'par-222',
				endTime: Date.now() + 10000,
			})).to.be.false;
		});

		it('should return false when endTime expired (timestamp mode)', () => {
			const existing = makeRegion({
				priority: makePriorityObject({ priorityLevel: 1 }),
				parent: 'par-111',
				player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0 },
			});
			// endTime is a timestamp in the past (> ENDTIME_REPEAT_THRESHOLD)
			expect(isPeerConflict(existing, {
				priorityLevel: 1,
				parent: 'par-222',
				endTime: Date.now() - 10000,
			})).to.be.false;
		});

		it('should return true when endTime is repeat count (at or below threshold)', () => {
			const existing = makeRegion({
				priority: makePriorityObject({ priorityLevel: 1 }),
				parent: 'par-111',
				player: { contentPause: 0, stop: false, endTime: 0, playing: true, timesPlayed: 0 },
			});
			expect(isPeerConflict(existing, {
				priorityLevel: 1,
				parent: 'par-222',
				endTime: 3, // repeat count mode
			})).to.be.true;
		});
	});

	describe('isEndTimeExpired', () => {
		it('should return true when endTime is past timestamp', () => {
			expect(isEndTimeExpired(Date.now() - 1000)).to.be.true;
		});

		it('should return false when endTime is future timestamp', () => {
			expect(isEndTimeExpired(Date.now() + 10000)).to.be.false;
		});

		it('should return false when endTime is repeat count (at or below threshold)', () => {
			expect(isEndTimeExpired(5)).to.be.false;
			expect(isEndTimeExpired(ENDTIME_REPEAT_THRESHOLD)).to.be.false;
		});

		it('should return false when endTime is 0 (indefinite)', () => {
			expect(isEndTimeExpired(0)).to.be.false;
		});
	});

	describe('isRepeatCountExpired', () => {
		it('should return true when timesPlayed >= endTime', () => {
			expect(isRepeatCountExpired(3, 3)).to.be.true;
			expect(isRepeatCountExpired(5, 3)).to.be.true;
		});

		it('should return false when timesPlayed < endTime', () => {
			expect(isRepeatCountExpired(2, 3)).to.be.false;
		});

		it('should return false when endTime is 0 (indefinite)', () => {
			expect(isRepeatCountExpired(100, 0)).to.be.false;
		});
	});

	describe('isPlaylistFinished', () => {
		it('should return true when endTime expired and is last', () => {
			expect(isPlaylistFinished({
				endTimeExpired: true,
				repeatCountExpired: false,
				isLast: true,
				smilFileUpdated: false,
				expiredVersion: false,
			})).to.be.true;
		});

		it('should return true when repeat count expired and is last', () => {
			expect(isPlaylistFinished({
				endTimeExpired: false,
				repeatCountExpired: true,
				isLast: true,
				smilFileUpdated: false,
				expiredVersion: false,
			})).to.be.true;
		});

		it('should return false when expired but not last', () => {
			expect(isPlaylistFinished({
				endTimeExpired: true,
				repeatCountExpired: false,
				isLast: false,
				smilFileUpdated: false,
				expiredVersion: false,
			})).to.be.false;
		});

		it('should return true when SMIL file updated regardless of other conditions', () => {
			expect(isPlaylistFinished({
				endTimeExpired: false,
				repeatCountExpired: false,
				isLast: false,
				smilFileUpdated: true,
				expiredVersion: false,
			})).to.be.true;
		});

		it('should return true when version expired regardless of other conditions', () => {
			expect(isPlaylistFinished({
				endTimeExpired: false,
				repeatCountExpired: false,
				isLast: false,
				smilFileUpdated: false,
				expiredVersion: true,
			})).to.be.true;
		});

		it('should return false when nothing has expired', () => {
			expect(isPlaylistFinished({
				endTimeExpired: false,
				repeatCountExpired: false,
				isLast: true,
				smilFileUpdated: false,
				expiredVersion: false,
			})).to.be.false;
		});
	});

	describe('shouldContinueWaiting', () => {
		it('should return false when cancelled', () => {
			expect(shouldContinueWaiting({
				endTime: Date.now() + 10000,
				timesPlayed: 0,
				isCancelled: true,
			})).to.be.false;
		});

		it('should return false when endTime (timestamp) expired', () => {
			expect(shouldContinueWaiting({
				endTime: Date.now() - 1000,
				timesPlayed: 0,
				isCancelled: false,
			})).to.be.false;
		});

		it('should return false when repeat count expired', () => {
			expect(shouldContinueWaiting({
				endTime: 3,
				timesPlayed: 3,
				isCancelled: false,
			})).to.be.false;
		});

		it('should return true when everything is valid', () => {
			expect(shouldContinueWaiting({
				endTime: Date.now() + 10000,
				timesPlayed: 0,
				isCancelled: false,
			})).to.be.true;
		});

		it('should return true when endTime is 0 (indefinite)', () => {
			expect(shouldContinueWaiting({
				endTime: 0,
				timesPlayed: 100,
				isCancelled: false,
			})).to.be.true;
		});
	});

	describe('isMediaMatch', () => {
		it('should return true for same src, region, dynamicValue, and triggerValue', () => {
			const a = { src: 'video1.mp4', regionInfo: { regionName: 'main' } } as SMILMedia;
			const b = { src: 'video1.mp4', regionInfo: { regionName: 'main' } } as SMILMedia;
			expect(isMediaMatch(a, b)).to.be.true;
		});

		it('should return false when src differs', () => {
			const a = { src: 'video1.mp4', regionInfo: { regionName: 'main' } } as SMILMedia;
			const b = { src: 'video2.mp4', regionInfo: { regionName: 'main' } } as SMILMedia;
			expect(isMediaMatch(a, b)).to.be.false;
		});

		it('should return false when regionName differs', () => {
			const a = { src: 'video1.mp4', regionInfo: { regionName: 'main' } } as SMILMedia;
			const b = { src: 'video1.mp4', regionInfo: { regionName: 'sidebar' } } as SMILMedia;
			expect(isMediaMatch(a, b)).to.be.false;
		});

		it('should return false when dynamicValue differs', () => {
			const a = { src: 'video1.mp4', regionInfo: { regionName: 'main' }, dynamicValue: 'dyn1' } as SMILMedia;
			const b = { src: 'video1.mp4', regionInfo: { regionName: 'main' }, dynamicValue: 'dyn2' } as SMILMedia;
			expect(isMediaMatch(a, b)).to.be.false;
		});

		it('should return false when triggerValue differs', () => {
			const a = { src: 'video1.mp4', regionInfo: { regionName: 'main' }, triggerValue: 'trig1' } as SMILMedia;
			const b = { src: 'video1.mp4', regionInfo: { regionName: 'main' }, triggerValue: 'trig2' } as SMILMedia;
			expect(isMediaMatch(a, b)).to.be.false;
		});

		it('should match when non-identity fields differ (dur, localFilePath)', () => {
			const a = { src: 'video1.mp4', regionInfo: { regionName: 'main' }, dur: '5s' } as SMILMedia;
			const b = { src: 'video1.mp4', regionInfo: { regionName: 'main' }, dur: '10s' } as SMILMedia;
			expect(isMediaMatch(a, b)).to.be.true;
		});
	});

	describe('findMatchingEntryIndex', () => {
		const media1 = { src: 'video1.mp4', regionInfo: { regionName: 'main' } } as SMILMedia;
		const media2 = { src: 'video2.mp4', regionInfo: { regionName: 'main' } } as SMILMedia;

		it('should return exact match when media, parent, and version match', () => {
			const entries = [
				makeRegion({ media: media1, parent: 'par-111', version: 1 }),
				makeRegion({ media: media2, parent: 'par-222', version: 1 }),
			];
			const result = findMatchingEntryIndex(entries, media1, 'par-111', 1);
			expect(result.matchIndex).to.equal(0);
			expect(result.matchType).to.equal('exact');
		});

		it('should return parent match when parent and version match but media differs', () => {
			const entries = [
				makeRegion({ media: media1, parent: 'par-111', version: 1 }),
			];
			const result = findMatchingEntryIndex(entries, media2, 'par-111', 1);
			expect(result.matchIndex).to.equal(0);
			expect(result.matchType).to.equal('parent');
		});

		it('should return none when no entry matches', () => {
			const entries = [
				makeRegion({ media: media1, parent: 'par-111', version: 1 }),
			];
			const result = findMatchingEntryIndex(entries, media2, 'par-222', 1);
			expect(result.matchIndex).to.equal(-1);
			expect(result.matchType).to.equal('none');
		});

		it('should return none when version differs', () => {
			const entries = [
				makeRegion({ media: media1, parent: 'par-111', version: 1 }),
			];
			const result = findMatchingEntryIndex(entries, media1, 'par-111', 2);
			expect(result.matchIndex).to.equal(-1);
			expect(result.matchType).to.equal('none');
		});

		it('should return none for empty entries array', () => {
			const result = findMatchingEntryIndex([], media1, 'par-111', 1);
			expect(result.matchIndex).to.equal(-1);
			expect(result.matchType).to.equal('none');
		});

		it('should prefer exact match over parent match', () => {
			const entries = [
				makeRegion({ media: media2, parent: 'par-111', version: 1 }), // parent match
				makeRegion({ media: media1, parent: 'par-111', version: 1 }), // exact match
			];
			const result = findMatchingEntryIndex(entries, media1, 'par-111', 1);
			expect(result.matchIndex).to.equal(1);
			expect(result.matchType).to.equal('exact');
		});

		it('should fall back to parent match when no exact match exists', () => {
			const media3 = { src: 'video3.mp4', regionInfo: { regionName: 'main' } } as SMILMedia;
			const entries = [
				makeRegion({ media: media1, parent: 'par-111', version: 1 }),
			];
			const result = findMatchingEntryIndex(entries, media3, 'par-111', 1);
			expect(result.matchIndex).to.equal(0);
			expect(result.matchType).to.equal('parent');
		});
	});
});
