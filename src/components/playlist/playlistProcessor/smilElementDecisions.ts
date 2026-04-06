/**
 * Pure decision functions extracted from SMILElementController.
 * These encapsulate the state-machine comparison and index-wrapping logic
 * used in the sync coordination protocol without any side effects.
 */
import { Synchronization, SyncElementState, VirtualElementState } from '../../../models/syncModels';

// Process actions for element state handling
export const ProcessAction = {
	CONTINUE: 'CONTINUE', // Exact match - continue playing normally
	RESYNC: 'RESYNC', // Slave behind master - trigger resync to skip elements
	WAIT: 'WAIT', // Keep waiting for correct broadcast
} as const;

export type ProcessActionType = typeof ProcessAction[keyof typeof ProcessAction];

/** Describes what mutations to apply after processElementState returns */
export interface ProcessElementStateMutations {
	clearResyncTargets?: boolean;
	clearSyncingInAction?: boolean;
	setSyncingInAction?: boolean;
	setResyncTarget?: { field: 'prepare' | 'play' | 'finish'; value: number };
}

/** Result from the pure processElementState decision function */
export interface ProcessElementStateResult {
	action: ProcessActionType;
	mutations?: ProcessElementStateMutations;
}

/** Context data needed by processElementState (read-only view of controller state) */
export interface ProcessElementStateContext {
	maxSyncIndexPerRegion: number | undefined;
	slaveEffectiveMax: number | undefined;
	slaveEffectiveMin: number | undefined;
	syncingInAction: boolean;
	playModeSyncRanges: Synchronization['playModeSyncRanges'];
	slaveMaxSyncIndex: number | undefined;
	slaveMinSyncIndex: number | undefined;
	globalMaxSyncIndex: number | undefined;
}

/**
 * Get the current resync target for a specific sync phase.
 */
export function getResyncTargetForState(
	state: 'prepared' | 'playing' | 'finished',
	resyncTargets: Synchronization['resyncTargets'],
): number | undefined {
	if (!resyncTargets) return undefined;
	return state === 'prepared'
		? resyncTargets.prepare
		: state === 'playing'
			? resyncTargets.play
			: resyncTargets.finish;
}

/**
 * Get priority bounds for a region and priority level from stored data.
 */
export function getPriorityBounds(
	regionName: string,
	priorityLevel: number | undefined,
	syncIndexBoundsPerPriority: Synchronization['syncIndexBoundsPerPriority'],
): { min: number; max: number } | undefined {
	if (priorityLevel === undefined) {
		return undefined;
	}
	return syncIndexBoundsPerPriority?.[regionName]?.[priorityLevel];
}

/**
 * Calculate wrapped sync index for resync target.
 * CASE 1: Priority playlist - use priority-specific bounds from message
 * CASE 1.5: Use slave's observed max (excludes wallclock-skipped elements)
 * CASE 2: Simple playlist (no priorityClass) - use global maxSyncIndexPerRegion
 */
export function getWrappedSyncIndex(
	nextIndex: number,
	priorityMaxSyncIndex: number | undefined,
	priorityMinSyncIndex: number | undefined,
	slaveMaxSyncIndex: number | undefined,
	slaveMinSyncIndex: number | undefined,
	globalMaxSyncIndex: number | undefined,
): number {
	// CASE 1: Priority playlist - use priority-specific bounds from message
	if (priorityMaxSyncIndex !== undefined && nextIndex > priorityMaxSyncIndex) {
		return priorityMinSyncIndex ?? 1;
	}

	// CASE 1.5: Use slave's observed max (excludes wallclock-skipped elements)
	const slaveMin = slaveMinSyncIndex ?? 1;
	if (slaveMaxSyncIndex !== undefined && nextIndex > slaveMaxSyncIndex) {
		return slaveMin;
	}

	// CASE 2: Simple playlist (no priorityClass) - use global max
	if (globalMaxSyncIndex !== undefined && nextIndex > globalMaxSyncIndex) {
		return slaveMin;
	}

	return nextIndex;
}

/**
 * Compute the next effective syncIndex after the given master position.
 * If masterIndex is within a playMode=one range, skips past remaining
 * siblings to the first syncIndex of the next seq element.
 */
export function getNextEffectiveSyncIndex(
	masterIndex: number,
	regionName: string,
	playModeSyncRanges: Synchronization['playModeSyncRanges'],
): number {
	const ranges = playModeSyncRanges?.[regionName];
	if (ranges) {
		for (const range of ranges) {
			if (masterIndex >= range.start && masterIndex <= range.end) {
				return range.end + 1;
			}
		}
	}
	return masterIndex + 1;
}

/**
 * Detects if slave wrapping to start of range while master message is from end of range.
 * This happens when slave checks for a new command before master's new command arrives.
 */
export function isWraparoundScenario(
	slaveIndex: number,
	masterIndex: number,
	priorityMin: number | undefined,
	priorityMax: number | undefined,
	globalMax: number | undefined,
	regionName: string,
	slaveEffectiveMax: number | undefined,
	slaveEffectiveMin: number | undefined,
	playModeSyncRanges: Synchronization['playModeSyncRanges'],
): boolean {
	// Use priority bounds if available, otherwise prefer slave's observed min/max
	const minIndex = priorityMin ?? slaveEffectiveMin ?? 1;
	const maxIndex = priorityMax ?? slaveEffectiveMax ?? globalMax;

	if (!maxIndex) {
		return false;
	}

	// Wraparound: slave at start of range, master message from end of range
	const slaveAtStart = slaveIndex <= minIndex + 1;
	// Account for playMode=one ranges
	const effectiveNext = getNextEffectiveSyncIndex(masterIndex, regionName, playModeSyncRanges);
	const masterAtEnd = masterIndex >= maxIndex - 1 || effectiveNext > maxIndex;

	return slaveAtStart && masterAtEnd;
}

/**
 * Check if a message's priority level indicates a priority transition
 * relative to stored and expected priority levels.
 */
export function hasPriorityChanged(
	storedPriority: number | undefined,
	messagePriority: number | undefined,
	expectedPriority: number | undefined,
): boolean {
	// Message differs from stored priority (actual transition detected)
	if (storedPriority !== undefined && messagePriority !== storedPriority) return true;
	if (storedPriority === undefined && messagePriority !== undefined) return true;

	// Expected differs from message priority (covers case where stored not yet updated)
	if (expectedPriority !== undefined && messagePriority !== undefined
		&& expectedPriority !== messagePriority) return true;
	if (expectedPriority !== undefined && messagePriority === undefined) return true;
	if (expectedPriority === undefined && messagePriority !== undefined) return true;

	return false;
}

/**
 * Check if slave should skip waiting during active resync (not yet at target).
 */
export function shouldSkipForResync(
	syncIndex: number,
	syncingInAction: boolean,
	resyncTarget: number | undefined,
): boolean {
	if (syncingInAction && resyncTarget !== undefined && syncIndex < resyncTarget) {
		return true;
	}
	return false;
}

/**
 * Process element state value and determine action.
 * Returns action to take based on the broadcast plus any mutations to apply:
 * - CONTINUE: Exact match found, continue playing normally
 * - RESYNC: Slave is behind master, trigger resync to skip elements
 * - WAIT: Keep waiting for the correct broadcast
 */
export function processElementState(
	value: VirtualElementState,
	expectedState: SyncElementState,
	syncIndex: number,
	regionName: string,
	context: ProcessElementStateContext,
): ProcessElementStateResult {
	const {
		maxSyncIndexPerRegion,
		slaveEffectiveMax,
		slaveEffectiveMin,
		syncingInAction,
		playModeSyncRanges,
		slaveMaxSyncIndex,
		slaveMinSyncIndex,
		globalMaxSyncIndex,
	} = context;

	if (value.state === expectedState && value.syncIndex === syncIndex) {
		// Normal case: exact match — clear sync state if we were resyncing
		if (syncingInAction) {
			return {
				action: ProcessAction.CONTINUE,
				mutations: { clearResyncTargets: true, clearSyncingInAction: true },
			};
		}
		return { action: ProcessAction.CONTINUE };
	} else if (
		value.syncIndex < syncIndex ||
		isWraparoundScenario(
			syncIndex, value.syncIndex,
			value.priorityMinSyncIndex, value.priorityMaxSyncIndex,
			maxSyncIndexPerRegion, regionName,
			slaveEffectiveMax, slaveEffectiveMin, playModeSyncRanges,
		)
	) {
		// Slave is ahead of master — wait for master to catch up
		return { action: ProcessAction.WAIT };
	} else if (expectedState === 'prepared' && value.state === 'playing' && value.syncIndex > syncIndex) {
		// Waiting for 'prepared' but master is already playing a future element — resync
		const nextIndex = getWrappedSyncIndex(
			getNextEffectiveSyncIndex(value.syncIndex, regionName, playModeSyncRanges),
			value.priorityMaxSyncIndex,
			value.priorityMinSyncIndex,
			slaveMaxSyncIndex,
			slaveMinSyncIndex,
			globalMaxSyncIndex,
		);
		return {
			action: ProcessAction.RESYNC,
			mutations: {
				setSyncingInAction: true,
				setResyncTarget: { field: 'prepare', value: nextIndex },
			},
		};
	} else if (value.state === expectedState && value.syncIndex > syncIndex) {
		// Master ahead with same state
		const nextIndex = getWrappedSyncIndex(
			getNextEffectiveSyncIndex(value.syncIndex, regionName, playModeSyncRanges),
			value.priorityMaxSyncIndex,
			value.priorityMinSyncIndex,
			slaveMaxSyncIndex,
			slaveMinSyncIndex,
			globalMaxSyncIndex,
		);
		const field: 'prepare' | 'play' | 'finish' =
			expectedState === 'prepared' ? 'prepare'
				: expectedState === 'playing' ? 'play'
					: 'finish';
		return {
			action: ProcessAction.RESYNC,
			mutations: {
				setSyncingInAction: true,
				setResyncTarget: { field, value: nextIndex },
			},
		};
	} else if (value.syncIndex === syncIndex && value.state !== expectedState) {
		// Same element but different state
		const stateOrder: SyncElementState[] = ['prepared', 'playing', 'finished'];
		const expectedIndex = stateOrder.indexOf(expectedState);
		const receivedIndex = stateOrder.indexOf(value.state);

		if (receivedIndex > expectedIndex) {
			// Behind in state progression
			const nextIndex = getWrappedSyncIndex(
				getNextEffectiveSyncIndex(syncIndex, regionName, playModeSyncRanges),
				value.priorityMaxSyncIndex,
				value.priorityMinSyncIndex,
				slaveMaxSyncIndex,
				slaveMinSyncIndex,
				globalMaxSyncIndex,
			);
			return {
				action: ProcessAction.RESYNC,
				mutations: {
					setSyncingInAction: true,
					setResyncTarget: { field: 'prepare', value: nextIndex },
				},
			};
		} else {
			// Ahead in state progression — wait for master to catch up
			return { action: ProcessAction.WAIT };
		}
	}

	// State doesn't match any condition — keep waiting
	return { action: ProcessAction.WAIT };
}
