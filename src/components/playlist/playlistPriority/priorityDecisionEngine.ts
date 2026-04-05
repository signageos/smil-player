import Debug from 'debug';
import { ENDTIME_REPEAT_THRESHOLD, PriorityRule } from '../../../enums/priorityEnums';
import { PriorityObject } from '../../../models/priorityModels';
import { CurrentlyPlayingRegion } from '../../../models/playlistModels';
import { SMILMedia } from '../../../models/mediaModels';

const debug = Debug('@signageos/smil-player:priorityDecisionEngine');

export type PriorityRelation = 'higher' | 'peer' | 'lower';

/**
 * Determines the relationship between an incoming element and an existing (previously playing) element.
 * "higher" means the incoming element has higher priority (higher number = higher priority).
 * "lower" means the incoming element has lower priority.
 * "peer" means they have the same priority level.
 */
export function determinePriorityRelation(
	incomingLevel: number,
	existingLevel: number,
): PriorityRelation {
	let relation: PriorityRelation;
	if (existingLevel < incomingLevel) {
		relation = 'higher';
	} else if (existingLevel > incomingLevel) {
		relation = 'lower';
	} else {
		relation = 'peer';
	}
	debug('[priority-engine] priority relation: incoming=%d vs existing=%d -> %s', incomingLevel, existingLevel, relation);
	return relation;
}

/**
 * Selects the applicable priority rule based on the relationship between incoming and existing elements.
 * For 'lower' relation: remaps stop -> never, pause -> defer (lower-priority must not interrupt higher).
 */
export function selectApplicableRule(
	relation: PriorityRelation,
	existingPriority: PriorityObject,
): PriorityRule {
	let rule: PriorityRule;
	switch (relation) {
		case 'higher':
			rule = existingPriority.higher;
			break;
		case 'peer':
			rule = existingPriority.peer;
			break;
		case 'lower': {
			const lowerRule = existingPriority.lower;
			if (lowerRule === PriorityRule.stop) {
				rule = PriorityRule.never;
			} else if (lowerRule === PriorityRule.pause) {
				rule = PriorityRule.defer;
			} else {
				rule = lowerRule;
			}
			break;
		}
	}
	debug('[priority-engine] selected rule: relation=%s, rule=%s', relation, rule!);
	return rule!;
}

/**
 * Determines if two priority entries are in a peer conflict.
 * A peer conflict exists when both have the same priority level, different parents,
 * the existing one is still playing, and the incoming one's endTime has not expired.
 */
export function isPeerConflict(
	existing: CurrentlyPlayingRegion,
	incoming: { priorityLevel: number; parent: string; endTime: number },
): boolean {
	const result = (
		existing.priority.priorityLevel === incoming.priorityLevel &&
		existing.parent !== incoming.parent &&
		existing.player.playing &&
		(Date.now() <= incoming.endTime || incoming.endTime <= ENDTIME_REPEAT_THRESHOLD)
	);
	if (result) {
		debug('[priority-engine] detected peer conflict: pri=%d, existingParent=%s, incomingParent=%s', incoming.priorityLevel, existing.parent, incoming.parent);
	}
	return result;
}

/**
 * Checks if the endTime (as a wallclock timestamp in millis) has expired.
 * Returns false if endTime is a repeat count (at or below ENDTIME_REPEAT_THRESHOLD).
 */
export function isEndTimeExpired(endTime: number): boolean {
	return endTime <= Date.now() && endTime > ENDTIME_REPEAT_THRESHOLD;
}

/**
 * Checks if the repeat count has been exceeded.
 * Returns false if endTime is 0 (indefinite) — indefinite playlists are never
 * "finished" by repeat count; they only end on external interruption (SMIL update,
 * version change, or priority conflict). The original code lacked the endTime !== 0
 * guard, causing indefinite playlists to cycle playing=false→true every iteration,
 * which unnecessarily resolved deferreds and unpaused controlled playlists.
 */
export function isRepeatCountExpired(timesPlayed: number, endTime: number): boolean {
	return timesPlayed >= endTime && endTime !== 0;
}

/**
 * Determines if a playlist is finished based on the 5 end conditions.
 */
export function isPlaylistFinished(params: {
	endTimeExpired: boolean;
	repeatCountExpired: boolean;
	isLast: boolean;
	smilFileUpdated: boolean;
	expiredVersion: boolean;
}): boolean {
	const result = (
		((params.endTimeExpired || params.repeatCountExpired) && params.isLast) ||
		params.smilFileUpdated ||
		params.expiredVersion
	);
	if (result) {
		const reasons = [];
		if (params.endTimeExpired && params.isLast) reasons.push('endTimeExpired+isLast');
		if (params.repeatCountExpired && params.isLast) reasons.push('repeatCountExpired+isLast');
		if (params.smilFileUpdated) reasons.push('smilFileUpdated');
		if (params.expiredVersion) reasons.push('expiredVersion');
		debug('[priority-engine] playlist finished: reasons=[%s]', reasons.join(', '));
	}
	return result;
}

/**
 * Determines if a deferred/stopped element should continue waiting or should exit.
 * Returns false if the element should stop waiting (expired or cancelled).
 */
export function shouldContinueWaiting(params: {
	endTime: number;
	timesPlayed: number;
	isCancelled: boolean;
}): boolean {
	if (params.isCancelled) {
		debug('[priority-engine] stop waiting: cancelled');
		return false;
	}
	if (isEndTimeExpired(params.endTime)) {
		debug('[priority-engine] stop waiting: endTime expired (endTime=%d)', params.endTime);
		return false;
	}
	if (isRepeatCountExpired(params.timesPlayed, params.endTime)) {
		debug('[priority-engine] stop waiting: repeat count expired (played=%d, endTime=%d)', params.timesPlayed, params.endTime);
		return false;
	}
	return true;
}

/**
 * Finds the index of an existing entry in the tracking array that matches the given info.
 * Prefers exact match (media+parent+version) over parent-only match (parent+version).
 * Returns an object with:
 * - matchIndex: the index of the matching entry (-1 if not found)
 * - matchType: 'exact' if media+parent+version match, 'parent' if parent+version match, 'none' if new entry
 */
/**
 * Checks if two SMILMedia objects represent the same playlist entry.
 * Uses targeted field comparison instead of deep equality — the match is for
 * identity (is this the same element?), not change detection.
 */
export function isMediaMatch(a: SMILMedia, b: SMILMedia): boolean {
	return a.src === b.src
		&& a.regionInfo?.regionName === b.regionInfo?.regionName
		&& a.dynamicValue === b.dynamicValue
		&& a.triggerValue === b.triggerValue;
}

export function findMatchingEntryIndex(
	entries: CurrentlyPlayingRegion[],
	media: SMILMedia,
	parent: string,
	version: number,
): { matchIndex: number; matchType: 'exact' | 'parent' | 'none' } {
	let parentMatchIndex = -1;
	for (let i = 0; i < entries.length; i++) {
		const elem = entries[i];
		if (elem.parent === parent && elem.version === version) {
			if (isMediaMatch(elem.media, media)) {
				return { matchIndex: i, matchType: 'exact' };
			}
			if (parentMatchIndex === -1) {
				parentMatchIndex = i;
			}
		}
	}
	if (parentMatchIndex !== -1) {
		debug('[priority-engine] entry match: type=parent, index=%d, parent=%s', parentMatchIndex, parent);
		return { matchIndex: parentMatchIndex, matchType: 'parent' };
	}
	debug('[priority-engine] entry match: type=none, creating new entry for parent=%s', parent);
	return { matchIndex: -1, matchType: 'none' };
}
