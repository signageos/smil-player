import { logDebug } from '../tools/generalTools';
import { Synchronization, SyncElementState, SyncMessage, SyncMessageType, SyncPhase, SyncPhaseConfig, SyncSignalReadyType, SYNC_PHASE_CONFIG, SYNC_TIMEOUTS, VirtualElementState,
	SyncCommandType
} from '../../../models/syncModels';
import { getSyncGroup } from '../tools/syncTools';
import { SyncGroup } from '../tools/SyncGroup';
import { TimedDebugger } from './TimedDebugger';
import { RandomPlaylist } from '../../../models/playlistModels';

// Process actions for element state handling
export const ProcessAction = {
	CONTINUE: 'CONTINUE', // Exact match - continue playing normally
	RESYNC: 'RESYNC', // Slave behind master - trigger resync to skip elements
	WAIT: 'WAIT', // Keep waiting for correct broadcast
} as const;

export type ProcessActionType = typeof ProcessAction[keyof typeof ProcessAction];

/**
 * Tracks acknowledgments from slave devices for synchronized operations
 */
class AckTracker {
	private activeRounds: Map<string, AckRound> = new Map<string, AckRound>();

	/**
	 * Start tracking acknowledgments for a specific operation
	 * @param key Unique identifier for this ACK round (e.g., "region1-5-prepared")
	 * @param expectedCount Number of ACKs expected (excluding master)
	 * @param syncGroup The sync group to listen for ACK messages
	 * @param timeoutMs Timeout in milliseconds (default 500ms)
	 * @param expectedPriorityLevel Optional priority level to validate against incoming ACKs
	 * @returns Promise that resolves to true if all ACKs received, false if timeout
	 */
	public async waitForAcks(
		key: string,
		expectedCount: number,
		syncGroup: SyncGroup,
		timeoutMs: number = SYNC_TIMEOUTS.ackTimeout,
		expectedPriorityLevel?: number,
	): Promise<boolean> {
		logDebug(undefined, 'Starting ACK tracking for %s, expecting %d ACKs, timeout %dms', key, expectedCount, timeoutMs);

		// If no slaves to wait for, return immediately
		if (expectedCount === 0) {
			logDebug(undefined, 'No ACKs expected for %s, continuing', key);
			return true;
		}

		// Parse the key to extract ACK type, region, and syncIndex
		// Key format: "regionName-syncIndex-ackType"
		const keyParts = key.split('-');
		const ackType = keyParts[keyParts.length - 2] + '-' + keyParts[keyParts.length - 1]; // e.g., "ack-prepared"
		const syncIndex = parseInt(keyParts[keyParts.length - 3], 10);
		const regionName = keyParts.slice(0, -3).join('-'); // Handle region names with dashes

		// Create new round
		const round = new AckRound(expectedCount);
		this.activeRounds.set(key, round);

		// Check for already stored ACKs before setting up listener
		// We now store only the latest ACK per type/region
		logDebug(undefined, 'Checking for stored ACKs for %s', key);
		const storedAck = syncGroup.getSyncCoordinationMessage(ackType, regionName);
		if (storedAck && storedAck.syncIndex === syncIndex) {
			// Validate priority if both are defined
			if (expectedPriorityLevel !== undefined &&
				storedAck.priorityLevel !== undefined &&
				storedAck.priorityLevel !== expectedPriorityLevel) {
				// Stale ACK from different priority context - discard
				logDebug(undefined, 'Discarding stale ACK for %s with priority %d (expected %d)',
					key, storedAck.priorityLevel, expectedPriorityLevel);
				syncGroup.clearSyncCoordinationMessage(ackType, regionName);
				// Don't record this ACK, continue to listener
			} else {
				// Priority matches or not checking - accept the ACK
				const age = Date.now() - storedAck.timestamp;
				logDebug(undefined, 'Found stored ACK for %s, age=%dms', key, age);
				this.recordAck(key);

				// Clear consumed message immediately
				syncGroup.clearSyncCoordinationMessage(ackType, regionName);

				// Check if this completes all ACKs
				if (round.isComplete()) {
					logDebug(undefined, 'All ACKs already received from storage for %s', key);
					this.cleanupRound(key);
					return true;
				}
			}
		}

		return new Promise<boolean>((resolve) => {
			let resolved = false;
			let unsubscribe: (() => void) | undefined;
			let timeoutId: NodeJS.Timeout | undefined;

			const cleanup = () => {
				resolved = true;
				if (unsubscribe) {
					unsubscribe();
				}
				if (timeoutId) {
					clearTimeout(timeoutId);
				}
				this.cleanupRound(key);
			};

			// Set up timeout
			timeoutId = setTimeout(() => {
				if (resolved) {
					return;
				}
				logDebug(undefined, 'ACK timeout for %s - received %d of %d ACKs. Continuing without slow devices.', key, round.receivedCount, expectedCount);
				cleanup();
				resolve(false);
			},
			timeoutMs);

			// Set up active listener for ACK messages
			unsubscribe = syncGroup.onValue(({ key: msgKey, value }: { key: string; value?: any }) => {
				if (resolved) {
					return;
				} // Prevent processing after resolution

				if (msgKey === 'sync-coordination' && value) {
					const message = value as SyncMessage;

					// Check if this is an ACK message
					if (message.type === 'ack-prepared' || message.type === 'ack-playing' || message.type === 'ack-finished' || message.type === 'ack-playMode') {
						// Build the ACK key from the message
						const ackKey = `${message.regionName}-${message.syncIndex}-${message.type}`;

						// Check if this ACK is for our round
						if (ackKey === key) {
							// Validate priority if both are defined
							if (expectedPriorityLevel !== undefined &&
								message.priorityLevel !== undefined &&
								message.priorityLevel !== expectedPriorityLevel) {
								// Wrong priority - ignore this ACK
								logDebug(undefined, 'Ignoring ACK for %s with priority %d (expected %d)',
									key, message.priorityLevel, expectedPriorityLevel);
								return; // Don't record, keep waiting
							}

							logDebug(undefined, 'Received ACK for %s', key);
							this.recordAck(key);

							// Clear consumed message
							syncGroup.clearSyncCoordinationMessage(message.type, message.regionName);

							// Check if all ACKs received
							if (round.isComplete()) {
								logDebug(undefined, 'All ACKs received for %s', key);
								cleanup();
								resolve(true);
							}
						}
					}
				}
			});

			// Also listen to the round's promise in case recordAck is called from elsewhere
			round.promise.then((result) => {
				if (!resolved) {
					cleanup();
					resolve(result);
				}
			});
		});
	}

	/**
	 * Adjust expected ACK count for a round (e.g., when peer disconnects)
	 * @param key The round identifier
	 * @param newExpectedCount New expected count
	 */
	public adjustExpectedCount(key: string, newExpectedCount: number): void {
		const round = this.activeRounds.get(key);
		if (!round) {
			logDebug(undefined, 'Cannot adjust count for unknown round: %s', key);
			return;
		}

		const oldCount = round.expectedCount;
		round.expectedCount = newExpectedCount;
		logDebug(undefined, 'Adjusted expected ACKs for %s from %d to %d', key, oldCount, newExpectedCount);

		// Check if we've now received all ACKs
		if (round.isComplete()) {
			logDebug(undefined, 'All ACKs now received after adjustment for %s', key);
			round.resolve(true);
		}
	}

	/**
	 * Record an acknowledgment for a specific round
	 * @param key The round identifier
	 */
	public recordAck(key: string): void {
		const round = this.activeRounds.get(key);
		if (!round) {
			logDebug(undefined, 'Received ACK for unknown round: %s', key);
			return;
		}

		round.addAck();
		logDebug(undefined, 'Recorded ACK for %s - %d of %d received', key, round.receivedCount, round.expectedCount);

		if (round.isComplete()) {
			logDebug(undefined, 'All ACKs received for %s', key);
			round.resolve(true);
		}
	}

	/**
	 * Get the number of active ACK rounds (for debugging/testing)
	 */
	public getActiveRoundCount(): number {
		return this.activeRounds.size;
	}

	/**
	 * Clean up a completed or timed-out round
	 */
	private cleanupRound(key: string): void {
		this.activeRounds.delete(key);
	}
}

/**
 * Represents a single round of ACK collection
 */
class AckRound {
	public receivedCount: number = 0;
	public promise: Promise<boolean>;
	public resolve: (value: boolean) => void = () => {
		/* placeholder */
	};

	constructor(public expectedCount: number) {
		this.promise = new Promise<boolean>((resolve) => {
			this.resolve = resolve;
		});
	}

	public addAck(): void {
		this.receivedCount++;
	}

	public isComplete(): boolean {
		return this.receivedCount >= this.expectedCount;
	}
}

export class SMILElementController {
	private ackTracker: AckTracker = new AckTracker();

	// State tracking for sync coordination
	private syncState = {
		slavePosition: {
			prepare: new Map<string, number>(), // regionName -> syncIndex
			play: new Map<string, number>(),     // regionName -> syncIndex for play state
			finish: new Map<string, number>(),   // regionName -> syncIndex for finish state
		},
		// Master position now tracked via latest cmd-prepare messages in SyncGroup
		pendingAcks: new Set<string>(), // "region-index-state" keys to avoid duplicates
		// Track priority level per region to detect priority changes
		priorityLevel: new Map<string, number>(), // regionName -> priorityLevel
	};

	constructor(private synchronization: Synchronization) {}

	/**
	 * Clear all resync state - used when priority context changes
	 */
	private clearResyncState(): void {
		if (this.synchronization.resyncTargets) {
			delete this.synchronization.resyncTargets.prepare;
			delete this.synchronization.resyncTargets.play;
			delete this.synchronization.resyncTargets.finish;
		}
		this.synchronization.syncingInAction = false;
		this.synchronization.movingForward = false;
	}

	/**
	 * Get priority bounds for a region and priority level from stored data.
	 * Used by master to include bounds in sync messages.
	 * @param regionName The region name
	 * @param priorityLevel The priority level (undefined for non-priority playlists)
	 * @returns The min/max bounds or undefined if not available
	 */
	private getPriorityBounds(
		regionName: string,
		priorityLevel: number | undefined,
	): { min: number; max: number } | undefined {
		if (priorityLevel === undefined) {
			return undefined;
		}
		return this.synchronization.syncIndexBoundsPerPriority?.[regionName]?.[priorityLevel];
	}

	/**
	 * Calculate wrapped sync index for resync target.
	 * CASE 1: Priority playlist - use priority-specific bounds from message
	 * CASE 2: Simple playlist (no priorityClass) - use global maxSyncIndexPerRegion
	 *
	 * @param nextIndex The calculated next index (before wraparound check)
	 * @param regionName The region name for global max lookup
	 * @param priorityMaxSyncIndex Max syncIndex from message (undefined for non-priority)
	 * @param priorityMinSyncIndex Min syncIndex from message (undefined for non-priority)
	 * @returns The wrapped sync index
	 */
	private getWrappedSyncIndex(
		nextIndex: number,
		regionName: string,
		priorityMaxSyncIndex?: number,
		priorityMinSyncIndex?: number,
	): number {
		// CASE 1: Priority playlist - use priority-specific bounds from message
		if (priorityMaxSyncIndex !== undefined && nextIndex > priorityMaxSyncIndex) {
			const minIndex = priorityMinSyncIndex ?? 1;
			logDebug(undefined, 'Wrapping resync target from %d to %d (priority max=%d)',
				nextIndex, minIndex, priorityMaxSyncIndex);
			return minIndex;
		}

		// CASE 2: Simple playlist (no priorityClass) - use global max
		const globalMax = this.synchronization.maxSyncIndexPerRegion?.[regionName];
		if (globalMax !== undefined && nextIndex > globalMax) {
			logDebug(undefined, 'Wrapping resync target from %d to 1 (global max=%d)',
				nextIndex, globalMax);
			return 1;
		}

		return nextIndex;
	}

	/**
	 * Compute the next effective syncIndex after the given master position.
	 * If masterIndex is within a playMode=one range, skips past remaining
	 * siblings to the first syncIndex of the next seq element.
	 * Falls back to masterIndex + 1 when no playMode ranges exist (backwards compatible).
	 */
	private getNextEffectiveSyncIndex(masterIndex: number, regionName: string): number {
		const ranges = this.synchronization.playModeSyncRanges?.[regionName];
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
	 *
	 * @param slaveIndex - The syncIndex the slave is waiting for
	 * @param masterIndex - The syncIndex from the master's stored/received message
	 * @param priorityMin - The minimum syncIndex in the current priority range (from message)
	 * @param priorityMax - The maximum syncIndex in the current priority range (from message)
	 * @param globalMax - The global maximum syncIndex for the region (fallback)
	 * @param regionName - The region name, used to look up playMode=one sync ranges
	 * @returns true if this is a wraparound scenario where slave should wait
	 */
	private isWraparoundScenario(
		slaveIndex: number,
		masterIndex: number,
		priorityMin: number | undefined,
		priorityMax: number | undefined,
		globalMax: number | undefined,
		regionName: string,
	): boolean {
		// Use priority bounds if available, otherwise fall back to global max
		const minIndex = priorityMin ?? 1;
		const maxIndex = priorityMax ?? globalMax;

		if (!maxIndex) {
			return false;
		}

		// Wraparound: slave at start of range, master message from end of range
		// Allow some tolerance (slave within first 2 indices of range, master within last 2)
		const slaveAtStart = slaveIndex <= minIndex + 1;
		// Account for playMode=one ranges: if the master's effective next index
		// would exceed maxIndex, the master is at the effective end of the playlist
		const effectiveNext = this.getNextEffectiveSyncIndex(masterIndex, regionName);
		const masterAtEnd = masterIndex >= maxIndex - 1 || effectiveNext > maxIndex;

		return slaveAtStart && masterAtEnd;
	}

	/**
	 * Check for priority level changes from incoming sync messages.
	 * If priority changed, clear stale resync state from different priority context.
	 * Handles three transition cases:
	 * 1. Priority → Non-priority (undefined): Clear stored priority and resync state
	 * 2. Non-priority → Priority: Clear resync state, set new priority
	 * 3. Priority → Different priority: Clear resync state, update priority
	 */
	private checkAndUpdatePriorityLevel(regionName: string, messagePriority: number | undefined): void {
		const storedPriority = this.syncState.priorityLevel.get(regionName);

		// Case 1: Transitioning TO non-priority playlist (messagePriority is undefined)
		if (messagePriority === undefined) {
			if (storedPriority !== undefined) {
				// Was in priority context, now leaving - clear stored priority and resync state
				logDebug(undefined, 'Leaving priority context (was %d) - clearing resync state', storedPriority);
				this.syncState.priorityLevel.delete(regionName);
				this.clearResyncState();
			}
			// If storedPriority was already undefined, nothing to do
			return;
		}

		// Case 2: Transitioning FROM non-priority TO priority (storedPriority is undefined)
		if (storedPriority === undefined) {
			// Entering priority context - clear any stale resync state from previous context
			logDebug(undefined, 'Entering priority context (now %d) - clearing resync state', messagePriority);
			this.clearResyncState();
			this.syncState.priorityLevel.set(regionName, messagePriority);
			return;
		}

		// Case 3: Priority changed between different defined values
		if (storedPriority !== messagePriority) {
			logDebug(undefined, 'Priority changed from %d to %d - clearing resync state', storedPriority, messagePriority);
			this.clearResyncState();
		}

		// Update stored priority (only reached if messagePriority is defined)
		this.syncState.priorityLevel.set(regionName, messagePriority);
	}

	/**
	 * Coordinate the start of element preparation
	 * Master broadcasts cmd-prepare, slaves wait for it
	 * @returns ProcessActionType indicating whether to continue or resync
	 */
	public async coordinatePrepareStart(
		regionName: string,
		syncIndex: number,
		timedDebug?: TimedDebugger,
		priorityLevel?: number,
	): Promise<ProcessActionType> {
		return this.coordinatePhaseStart('prepare', regionName, syncIndex, timedDebug, priorityLevel);
	}

	/**
	 * Coordinate the completion of element preparation
	 * Slaves send ack-prepared, master waits for all ACKs
	 */
	public async coordinatePrepareComplete(
		regionName: string,
		syncIndex: number,
		timedDebug?: TimedDebugger,
		priorityLevel?: number,
	): Promise<void> {
		return this.coordinatePhaseComplete('prepare', regionName, syncIndex, timedDebug, priorityLevel);
	}

	/**
	 * Coordinate the start of element playing
	 * Master broadcasts cmd-play, slaves wait for it
	 * @returns ProcessActionType indicating whether to continue or resync
	 */
	public async coordinatePlayStart(
		regionName: string,
		syncIndex: number,
		timedDebug?: TimedDebugger,
		priorityLevel?: number,
	): Promise<ProcessActionType> {
		return this.coordinatePhaseStart('play', regionName, syncIndex, timedDebug, priorityLevel);
	}

	/**
	 * Coordinate the completion of play coordination (before actual playback starts)
	 * Slaves send ack-playing, master waits for all ACKs, then signals ready
	 */
	public async coordinatePlayComplete(
		regionName: string,
		syncIndex: number,
		timedDebug?: TimedDebugger,
		priorityLevel?: number,
	): Promise<void> {
		return this.coordinatePhaseComplete('play', regionName, syncIndex, timedDebug, priorityLevel);
	}

	/**
	 * Coordinate the start of element finish synchronization
	 * Master broadcasts cmd-finish, slaves wait for it
	 * @returns ProcessActionType indicating whether to continue or resync
	 */
	public async coordinateFinishStart(
		regionName: string,
		syncIndex: number,
		timedDebug?: TimedDebugger,
		priorityLevel?: number,
	): Promise<ProcessActionType> {
		return this.coordinatePhaseStart('finish', regionName, syncIndex, timedDebug, priorityLevel);
	}

	/**
	 * Coordinate the completion of finish synchronization
	 * Slaves send ack-finished, master waits for all ACKs, then signals ready
	 */
	public async coordinateFinishComplete(
		regionName: string,
		syncIndex: number,
		timedDebug?: TimedDebugger,
		priorityLevel?: number,
	): Promise<void> {
		return this.coordinatePhaseComplete('finish', regionName, syncIndex, timedDebug, priorityLevel);
	}

	/**
	 * Process element state value and determine action
	 * Returns action to take based on the broadcast:
	 * - CONTINUE: Exact match found, continue playing normally
	 * - RESYNC: Slave is behind master, trigger resync to skip elements
	 * - WAIT: Keep waiting for the correct broadcast
	 */
	private processElementState(
		value: VirtualElementState,
		expectedState: SyncElementState,
		syncIndex: number,
		regionName: string,
	): ProcessActionType {
		// Log broadcast being processed
		logDebug(
			undefined,
			'Processing broadcast: state=%s, syncIndex=%d, timestamp=%d for region=%s (waiting for state=%s, syncIndex=%d)',
			value.state,
			value.syncIndex,
			value.timestamp,
			regionName,
			expectedState,
			syncIndex,
		);

		// Get maxIndex for wraparound detection
		const maxIndex = this.synchronization.maxSyncIndexPerRegion?.[regionName];

		if (value.state === expectedState && value.syncIndex === syncIndex) {
			// Normal case: exact match
			logDebug(undefined, 'Received expected state: %s for region=%s, syncIndex=%d', expectedState, regionName, syncIndex);

			// Clear sync state when we achieve exact match
			if (this.synchronization.syncingInAction) {
				logDebug(undefined, 'Exact match found - clearing resync state');
				if (this.synchronization.resyncTargets) {
					delete this.synchronization.resyncTargets.prepare;
					delete this.synchronization.resyncTargets.play;
					delete this.synchronization.resyncTargets.finish;
				}
				this.synchronization.syncingInAction = false;
			}

			return ProcessAction.CONTINUE; // In sync, continue normally
		} else if (value.syncIndex < syncIndex || this.isWraparoundScenario(syncIndex, value.syncIndex, value.priorityMinSyncIndex, value.priorityMaxSyncIndex, maxIndex, regionName)) {
			// Slave is ahead of master - wait for master to catch up
			// Includes wraparound: slave at start of new iteration, master at end of previous
			const isWraparound = this.isWraparoundScenario(syncIndex, value.syncIndex, value.priorityMinSyncIndex, value.priorityMaxSyncIndex, maxIndex, regionName);
			logDebug(
				undefined,
				'Slave ahead of master %s- slave waiting for syncIndex=%d, master at syncIndex=%d for region=%s',
				isWraparound ? '(wraparound) ' : '',
				syncIndex,
				value.syncIndex,
				regionName,
			);
			return ProcessAction.WAIT; // Keep waiting for correct broadcast
		} else if (expectedState === 'prepared' && value.state === 'playing' && value.syncIndex > syncIndex) {
			// Special case: We're waiting for 'prepared' but master is already playing a future element
			// This means we missed our chance to prepare and need to catch up
			logDebug(
				undefined,
				'Waiting for prepared but master playing future element - need resync. Master playing %d, we waiting at %d',
				value.syncIndex,
				syncIndex,
			);

			// Set target to prepare for the NEXT element after what master is playing
			const nextIndex = this.getWrappedSyncIndex(
				this.getNextEffectiveSyncIndex(value.syncIndex, regionName),
				regionName,
				value.priorityMaxSyncIndex,
				value.priorityMinSyncIndex,
			);

			// Set state-specific resync target for preparation
			if (!this.synchronization.resyncTargets) {
				this.synchronization.resyncTargets = {};
			}
			this.synchronization.resyncTargets.prepare = nextIndex;
			this.synchronization.syncingInAction = true;
			logDebug(
				undefined,
				'Setting resync target for preparation: region=%s, targetIndex=%d (master playing %d)',
				regionName,
				nextIndex,
				value.syncIndex,
			);
			logDebug(undefined, 'Returning false from waitForMasterState to trigger element skip');
			return ProcessAction.RESYNC; // Trigger resync - skip current element
		} else if (value.state === expectedState && value.syncIndex > syncIndex) {
			// Master ahead with same state
			logDebug(undefined, 'Master ahead - need resync. Master at %d, we are at %d', value.syncIndex, syncIndex);

			// Handle wraparound for playlist looping using priority bounds if available
			const nextIndex = this.getWrappedSyncIndex(
				this.getNextEffectiveSyncIndex(value.syncIndex, regionName),
				regionName,
				value.priorityMaxSyncIndex,
				value.priorityMinSyncIndex,
			);

			// Set state-specific resync target based on expected state
			if (!this.synchronization.resyncTargets) {
				this.synchronization.resyncTargets = {};
			}

			// Determine which target to set based on what state we're waiting for
			if (expectedState === 'prepared') {
				this.synchronization.resyncTargets.prepare = nextIndex;
				logDebug(
					undefined,
					'Setting resync target for PREPARE: region=%s, targetIndex=%d (master at %d)',
					regionName,
					nextIndex,
					value.syncIndex,
				);
			} else if (expectedState === 'playing') {
				this.synchronization.resyncTargets.play = nextIndex;
				logDebug(
					undefined,
					'Setting resync target for PLAY: region=%s, targetIndex=%d (master at %d)',
					regionName,
					nextIndex,
					value.syncIndex,
				);
			} else if (expectedState === 'finished') {
				this.synchronization.resyncTargets.finish = nextIndex;
				logDebug(
					undefined,
					'Setting resync target for FINISH: region=%s, targetIndex=%d (master at %d)',
					regionName,
					nextIndex,
					value.syncIndex,
				);
			}

			this.synchronization.syncingInAction = true;
			return ProcessAction.RESYNC; // Trigger resync - skip current element
		} else if (value.syncIndex === syncIndex && value.state !== expectedState) {
			// Same element but different state
			// Determine if we're ahead or behind based on state progression
			const stateOrder: SyncElementState[] = ['prepared', 'playing', 'finished'];
			const expectedIndex = stateOrder.indexOf(expectedState);
			const receivedIndex = stateOrder.indexOf(value.state);

			if (receivedIndex > expectedIndex) {
				// We're behind (e.g., we expect 'prepared' but master is at 'playing')
				logDebug(
					undefined,
					'Behind in state progression - expected %s but master at %s for syncIndex=%d',
					expectedState,
					value.state,
					syncIndex,
				);

				// Handle wraparound for playlist looping using priority bounds if available
				const nextIndex = this.getWrappedSyncIndex(
					this.getNextEffectiveSyncIndex(syncIndex, regionName),
					regionName,
					value.priorityMaxSyncIndex,
					value.priorityMinSyncIndex,
				);

				// Set state-specific resync target for preparation
				if (!this.synchronization.resyncTargets) {
					this.synchronization.resyncTargets = {};
				}
				// When behind in state progression, we need to prepare the next element
				this.synchronization.resyncTargets.prepare = nextIndex;
				this.synchronization.syncingInAction = true;
				logDebug(
					undefined,
					'Setting resync target due to state mismatch: region=%s, targetIndex=%d (behind in state progression)',
					regionName,
					nextIndex,
				);
			} else {
				// We're ahead (e.g., we expect 'playing' but master is at 'prepared')
				logDebug(
					undefined,
					'Ahead in state progression - expected %s but master at %s for syncIndex=%d',
					expectedState,
					value.state,
					syncIndex,
				);
				// Wait for master to catch up - don't set resync flags
			}
			return receivedIndex <= expectedIndex ? ProcessAction.WAIT : ProcessAction.RESYNC;
		}

		// State doesn't match any condition - keep waiting
		return ProcessAction.WAIT;
	}

	/**
	 * Broadcast a sync coordination message (commands or ACKs)
	 */
	private async broadcastSyncMessage(
		type: SyncMessageType,
		regionName: string,
		syncIndex: number,
		syncGroup?: SyncGroup,
		priorityLevel?: number,
		previousIndex?: number,
	): Promise<void> {
		// Look up priority bounds for this region and priority level
		const bounds = this.getPriorityBounds(regionName, priorityLevel);

		const message: SyncMessage = {
			type,
			regionName,
			syncIndex,
			timestamp: Date.now(),
			priorityLevel,
			previousIndex,
			// Only include bounds if they exist (priority playlists only)
			...(bounds && {
				priorityMinSyncIndex: bounds.min,
				priorityMaxSyncIndex: bounds.max,
			}),
		};

		// Use provided sync group or get it
		const group = syncGroup || getSyncGroup(`${this.synchronization.syncGroupName}-${regionName}-before`);
		if (!group) {
			logDebug(undefined, 'No sync group to broadcast to for region: %s', regionName);
			return;
		}

		await group.broadcastValue('sync-coordination', message);
		logDebug(undefined, 'Broadcasted sync message: type=%s, region=%s, syncIndex=%d, priorityBounds=%s',
			type, regionName, syncIndex, bounds ? `[${bounds.min}-${bounds.max}]` : 'none');
	}

	/**
	 * Unified method to wait for commands and check sync status
	 * Handles cmd-prepare/cmd-play messages only (ACK protocol)
	 * Returns action to take: CONTINUE, RESYNC, or keeps waiting if WAIT
	 */
	private async waitForCommandAndCheckSync(
		commandType: SyncCommandType,
		expectedState: 'prepared' | 'playing' | 'finished',
		regionName: string,
		syncIndex: number,
		syncGroup: SyncGroup,
		timedDebug?: TimedDebugger,
		expectedPriorityLevel?: number,
	): Promise<ProcessActionType> {
		// Update slave position tracking
		this.updateSlavePosition(regionName, syncIndex, expectedState);

		// FIRST: Check stored message for priority level changes BEFORE resync skip check
		// This allows priority change to clear stale resync state before we check it
		const storedMsg = syncGroup.getSyncCoordinationMessage(commandType, regionName);
		if (storedMsg) {
			// Primary: Check if message priority differs from last received priority
			this.checkAndUpdatePriorityLevel(regionName, storedMsg.priorityLevel);

			// Backup: If expected priority differs from stored message priority, clear resync state
			// This handles case where master's new message hasn't arrived yet
			if (expectedPriorityLevel !== undefined &&
				storedMsg.priorityLevel !== undefined &&
				storedMsg.priorityLevel !== expectedPriorityLevel) {
				logDebug(timedDebug, 'Expected priority %d differs from stored message priority %d - clearing resync state (backup)',
					expectedPriorityLevel, storedMsg.priorityLevel);

				this.clearResyncState();

				// Clear the stale message - it's from a different priority context
				syncGroup.clearSyncCoordinationMessage(commandType, regionName);
				logDebug(timedDebug, 'Cleared stale %s message from priority %d context',
					commandType, storedMsg.priorityLevel);
			}
		}

		// THEN: Check if actively resyncing and not at target yet - skip immediately
		// This check now happens AFTER priority check may have cleared stale state
		// Use state-specific resync target based on expected state
		const resyncTarget = expectedState === 'prepared'
			? this.synchronization.resyncTargets?.prepare
			: expectedState === 'playing'
				? this.synchronization.resyncTargets?.play
				: this.synchronization.resyncTargets?.finish;

		if (this.synchronization.syncingInAction && resyncTarget !== undefined && syncIndex < resyncTarget) {
			logDebug(
				timedDebug,
				'Skipping wait during resync: at syncIndex=%d, target=%d for %s',
				syncIndex,
				resyncTarget,
				expectedState,
			);
			// Return RESYNC immediately - no timeout, no waiting
			return ProcessAction.RESYNC;
		}

		// Log current positions for debugging
		const positions = this.getPositions(regionName, expectedState, syncGroup);
		logDebug(
			timedDebug,
			'Current sync positions for %s %s: slave=%d, master=%d',
			regionName,
			expectedState,
			positions.slave,
			positions.master,
		);

		// Re-fetch stored message (will be null if we cleared it above due to priority mismatch)
		const currentStoredMsg = syncGroup.getSyncCoordinationMessage(commandType, regionName);
		if (currentStoredMsg) {
			const age = Date.now() - currentStoredMsg.timestamp;
			logDebug(timedDebug, 'Found stored %s for region=%s, storedIndex=%d, expectedIndex=%d, age=%dms',
				commandType, regionName, currentStoredMsg.syncIndex, syncIndex, age);

			// Create virtual elementState from stored command, including priority bounds
			const virtualElementState = {
				state: expectedState,
				regionName: currentStoredMsg.regionName,
				syncIndex: currentStoredMsg.syncIndex,
				timestamp: currentStoredMsg.timestamp,
				priorityMinSyncIndex: currentStoredMsg.priorityMinSyncIndex,
				priorityMaxSyncIndex: currentStoredMsg.priorityMaxSyncIndex,
			};

			// Use processElementState to determine action
			const action = this.processElementState(virtualElementState, expectedState, syncIndex, regionName);

			if (action !== ProcessAction.WAIT) {
				// Don't clear the message - we want to keep the latest for position tracking
				return action;
			}
		}
		// If no stored message (cleared due to priority mismatch or never existed), fall through to Promise listener

		// Create promise with active listener
		return new Promise<ProcessActionType>((resolve) => {
			let resolved = false;
			let unsubscribe: (() => void) | undefined;
			let unsubscribeMasterChange: (() => void) | undefined;
			let timeoutId: NodeJS.Timeout | undefined;

			const cleanup = () => {
				resolved = true;
				if (unsubscribe) {
					unsubscribe();
				}
				if (unsubscribeMasterChange) {
					unsubscribeMasterChange();
				}
				if (timeoutId) {
					clearTimeout(timeoutId);
				}
			};

			// Check if we're at resync target - use 10 minute timeout to prevent indefinite waiting
			const resyncTargetCheck = expectedState === 'prepared'
				? this.synchronization.resyncTargets?.prepare
				: expectedState === 'playing'
					? this.synchronization.resyncTargets?.play
					: this.synchronization.resyncTargets?.finish;
			const isAtResyncTarget =
				this.synchronization.syncingInAction && resyncTargetCheck !== undefined && syncIndex === resyncTargetCheck;

			if (isAtResyncTarget) {
				logDebug(timedDebug, 'At resync target %d for %s - waiting for master with 10 minute timeout', syncIndex, expectedState);
				// Set 10 minute timeout to prevent indefinite waiting
				timeoutId = setTimeout(() => {
					if (resolved) {
						return;
					}
					const timeoutMsg = `Timeout waiting for ${commandType} at resync target=${syncIndex}, region=${regionName} after 10 minutes`;
					logDebug(timedDebug, timeoutMsg);
					cleanup();
					resolve(ProcessAction.CONTINUE);
				}, SYNC_TIMEOUTS.resyncTargetTimeout);
			} else {
				// Safety timeout for network failure edge case - 60 seconds
				// If network/server goes down, slave shouldn't wait forever for cmd-prepare/cmd-play
				timeoutId = setTimeout(() => {
					if (resolved) {
						return;
					}
					logDebug(timedDebug, 'Timeout waiting for %s at syncIndex=%d - triggering resync', commandType, syncIndex);
					this.synchronization.syncingInAction = true;
					if (!this.synchronization.resyncTargets) {
						this.synchronization.resyncTargets = {};
					}

					// Use range-aware computation + wraparound for timeout recovery
					const nextIndex = this.getWrappedSyncIndex(
						this.getNextEffectiveSyncIndex(syncIndex, regionName),
						regionName,
					);

					if (expectedState === 'prepared') {
						this.synchronization.resyncTargets.prepare = nextIndex;
					} else if (expectedState === 'playing') {
						this.synchronization.resyncTargets.play = nextIndex;
					} else {
						this.synchronization.resyncTargets.finish = nextIndex;
					}
					cleanup();
					resolve(ProcessAction.RESYNC);
				}, SYNC_TIMEOUTS.networkFailureTimeout);
			}

			// Monitor master changes - if slave becomes master, continue immediately
			unsubscribeMasterChange = syncGroup.onMasterChange((isMaster: boolean) => {
				if (resolved) {
					return;
				} // Prevent processing after resolution

				if (isMaster) {
					// This device became master while waiting
					logDebug(
						timedDebug,
						'Slave became master while waiting for %s at syncIndex=%d, region=%s',
						commandType,
						syncIndex,
						regionName,
					);
					cleanup();
					resolve(ProcessAction.CONTINUE); // Continue as new master
				}
			});

			// Set up active listener for sync-coordination messages only
			unsubscribe = syncGroup.onValue(async ({ key, value }: { key: string; value?: any }) => {
				if (resolved) {
					return;
				}

				// Handle sync-coordination messages (commands and ACKs)
				if (key === 'sync-coordination' && value) {
					const message = value as SyncMessage;

					// Check if this is a command message for our region
					if (message.type === commandType && message.regionName === regionName) {
						// Check for priority level changes and clear stale resync state if needed
						this.checkAndUpdatePriorityLevel(regionName, message.priorityLevel);

						// Backup: If expected priority differs from message priority, clear resync state
						// This handles case where checkAndUpdatePriorityLevel didn't detect change
						// (e.g., stored priority matches message, but expected differs)
						if (expectedPriorityLevel !== undefined &&
							message.priorityLevel !== undefined &&
							message.priorityLevel !== expectedPriorityLevel) {
							logDebug(timedDebug, 'Expected priority %d differs from message priority %d - clearing resync state (listener backup)',
								expectedPriorityLevel, message.priorityLevel);
							this.clearResyncState();
						}

						// Recompute isAtResyncTarget after priority check may have cleared state
						const currentResyncTarget = expectedState === 'prepared'
							? this.synchronization.resyncTargets?.prepare
							: expectedState === 'playing'
								? this.synchronization.resyncTargets?.play
								: this.synchronization.resyncTargets?.finish;
						const currentIsAtResyncTarget =
							this.synchronization.syncingInAction &&
							currentResyncTarget !== undefined &&
							syncIndex === currentResyncTarget;

						// Create virtual elementState from command, including priority bounds
						const virtualElementState = {
							state: expectedState,
							regionName: message.regionName,
							syncIndex: message.syncIndex,
							timestamp: message.timestamp,
							priorityMinSyncIndex: message.priorityMinSyncIndex,
							priorityMaxSyncIndex: message.priorityMaxSyncIndex,
						};

						// Special handling if we're at resync target and master has passed us
						if (currentIsAtResyncTarget && message.syncIndex > syncIndex) {
							// Master has moved past our resync target - use range-aware computation + priority bounds
							const newTarget = this.getWrappedSyncIndex(
								this.getNextEffectiveSyncIndex(message.syncIndex, regionName),
								regionName,
								message.priorityMaxSyncIndex,
								message.priorityMinSyncIndex,
							);

							// Set state-specific resync target based on command type
							if (commandType === 'cmd-prepare') {
								this.synchronization.resyncTargets!.prepare = newTarget;
							} else {
								this.synchronization.resyncTargets!.play = newTarget;
							}

							logDebug(timedDebug, 'Master passed resync target - updating target from %d to %d', syncIndex, newTarget);

							// Send ACK for master's position to not block it
							await this.sendAckForPosition(regionName, message.syncIndex, expectedState, syncGroup);

							cleanup();
							resolve(ProcessAction.RESYNC);
							return;
						}

						// Use processElementState to determine action
						const action = this.processElementState(
							virtualElementState,
							expectedState,
							syncIndex,
							regionName,
						);

						switch (action) {
							case ProcessAction.CONTINUE:
								// Exact match - we got our command
								logDebug(timedDebug, `Received ${commandType} for region=${regionName}, syncIndex=${syncIndex}`);
								// Don't clear the message - we want to keep the latest for position tracking
								cleanup();
								resolve(ProcessAction.CONTINUE);
								break;

							case ProcessAction.RESYNC:
								// We're behind - resync flags already set by processElementState
								logDebug(timedDebug, 'Detected resync needed while waiting for %s', commandType);
								// Send ACK for master's position to not block master during resync
								await this.sendAckForPosition(regionName, message.syncIndex, expectedState, syncGroup);
								logDebug(
									timedDebug,
									'Sent ACK for master position %d before starting resync',
									message.syncIndex,
								);
								cleanup();
								resolve(ProcessAction.RESYNC);
								break;

							case ProcessAction.WAIT:
								// We're ahead - send ACK for master's position but keep waiting
								logDebug(
									timedDebug,
									'Slave ahead at %d, master at %d - sending ACK and waiting',
									syncIndex,
									message.syncIndex,
								);
								await this.sendAckForPosition(regionName, message.syncIndex, expectedState, syncGroup);
								// Don't resolve - keep listening
								break;
							default:
								// Should not happen
								logDebug(timedDebug, 'Unexpected action from processElementState: %s', action);
								break;
						}
					}
				}
			});
		});
	}

	/**
	 * Send ACK for a specific position (used when slave is ahead)
	 */
	private async sendAckForPosition(
		regionName: string,
		syncIndex: number,
		state: 'prepared' | 'playing' | 'finished',
		syncGroup: SyncGroup,
	): Promise<void> {
		const ackType = state === 'prepared' ? 'ack-prepared' : state === 'playing' ? 'ack-playing' : 'ack-finished';
		const ackKey = `${regionName}-${syncIndex}-${ackType}`;

		// Avoid duplicate ACKs
		if (!this.syncState.pendingAcks.has(ackKey)) {
			this.syncState.pendingAcks.add(ackKey);

			await this.broadcastSyncMessage(ackType, regionName, syncIndex, syncGroup);
			logDebug(undefined, 'Sent ACK for master position %d while slave at different position', syncIndex);

			// Clean up after a delay
			setTimeout(() => {
				this.syncState.pendingAcks.delete(ackKey);
			}, SYNC_TIMEOUTS.ackCleanupDelay);
		}
	}

	/**
	 * Update slave position tracking
	 */
	private updateSlavePosition(regionName: string, syncIndex: number, state: 'prepared' | 'playing' | 'finished'): void {
		if (state === 'prepared') {
			this.syncState.slavePosition.prepare.set(regionName, syncIndex);
			logDebug(undefined, 'Updated slave prepare position: region=%s, syncIndex=%d', regionName, syncIndex);
		} else if (state === 'playing') {
			this.syncState.slavePosition.play.set(regionName, syncIndex);
			logDebug(undefined, 'Updated slave play position: region=%s, syncIndex=%d', regionName, syncIndex);
		} else if (state === 'finished') {
			this.syncState.slavePosition.finish.set(regionName, syncIndex);
			logDebug(undefined, 'Updated slave finish position: region=%s, syncIndex=%d', regionName, syncIndex);
		}
	}

	/**
	 * Get current positions for debugging
	 */
	private getPositions(regionName: string, state: 'prepared' | 'playing' | 'finished', syncGroup?: SyncGroup): { slave: number; master: number } {
		// Get slave position from local tracking based on state
		const slavePos = state === 'prepared'
			? (this.syncState.slavePosition.prepare.get(regionName) || 0)
			: state === 'playing'
				? (this.syncState.slavePosition.play.get(regionName) || 0)
				: (this.syncState.slavePosition.finish.get(regionName) || 0);

		// Get master position from the latest command message in SyncGroup
		let masterPos = 0;
		if (syncGroup) {
			const commandType = state === 'prepared' ? 'cmd-prepare' : state === 'playing' ? 'cmd-play' : 'cmd-finish';
			const latestCommand = syncGroup.getSyncCoordinationMessage(commandType, regionName);
			if (latestCommand && latestCommand.syncIndex) {
				masterPos = latestCommand.syncIndex;
			}
		}
		// If no syncGroup provided or no command found, masterPos remains 0

		return { slave: slavePos, master: masterPos };
	}

	/**
	 * Handle master's phase completion: wait for ACKs and send signal-ready
	 */
	private async handleMasterPhaseComplete(
		phase: SyncPhase,
		config: SyncPhaseConfig,
		regionName: string,
		syncIndex: number,
		syncGroup: SyncGroup,
		timedDebug?: TimedDebugger,
		priorityLevel?: number,
	): Promise<void> {
		const expectedAcks = syncGroup.getConnectedPeersCount() - 1;

		if (expectedAcks > 0) {
			const ackKey = `${regionName}-${syncIndex}-${config.ackType}`;
			logDebug(timedDebug, 'Master waiting for %d %s ACKs for %s', expectedAcks, phase, ackKey);

			const acksReceived = await this.ackTracker.waitForAcks(ackKey, expectedAcks, syncGroup, SYNC_TIMEOUTS.ackTimeout, priorityLevel);
			logDebug(timedDebug, acksReceived
				? 'Master received all %s ACKs for %s'
				: 'Master timeout waiting for %s ACKs for %s', phase, ackKey);
		}

		await this.broadcastSyncMessage(config.signalType, regionName, syncIndex, syncGroup, priorityLevel);
	}

	/**
	 * Handle slave's phase completion: send ACK and wait for signal-ready
	 */
	private async handleSlavePhaseComplete(
		phase: SyncPhase,
		config: SyncPhaseConfig,
		regionName: string,
		syncIndex: number,
		syncGroup: SyncGroup,
		timedDebug?: TimedDebugger,
		priorityLevel?: number,
	): Promise<void> {
		const resyncTarget = this.synchronization.resyncTargets?.[config.resyncField];

		// Handle resync mode - send ACK for master's position
		if (this.synchronization.syncingInAction && resyncTarget) {
			await this.sendSlaveResyncAck(config, regionName, syncIndex, syncGroup, timedDebug);
			return; // Don't wait for signal-ready during resync
		}

		// Normal flow - send ACK for current position
		await this.broadcastSyncMessage(config.ackType, regionName, syncIndex, syncGroup, priorityLevel);
		logDebug(timedDebug, 'Slave sent %s for region=%s, syncIndex=%d', config.ackType, regionName, syncIndex);

		// Wait for signal-ready from master
		logDebug(timedDebug, 'Slave waiting for %s from master for region=%s, syncIndex=%d',
			config.signalType, regionName, syncIndex);

		const receivedSignal = await this.waitForSignalReady(regionName, syncIndex, syncGroup, config.signalType, timedDebug, priorityLevel);

		if (!receivedSignal) {
			await this.handleSignalReadyTimeout(phase, config, regionName, syncIndex, syncGroup, timedDebug);
		} else {
			logDebug(timedDebug, 'Slave received %s, continuing for region=%s, syncIndex=%d',
				config.signalType, regionName, syncIndex);
		}
	}

	/**
	 * Send ACK for master's position during resync mode
	 */
	private async sendSlaveResyncAck(
		config: SyncPhaseConfig,
		regionName: string,
		syncIndex: number,
		syncGroup: SyncGroup,
		timedDebug?: TimedDebugger,
	): Promise<void> {
		const masterPos = this.getPositions(regionName, config.state, syncGroup).master;

		if (masterPos > 0) {
			await this.sendAckForPosition(regionName, masterPos, config.state, syncGroup);
			logDebug(timedDebug, 'Slave in resync mode - sent %s for master position=%d instead of %d',
				config.ackType, masterPos, syncIndex);
		} else {
			await this.broadcastSyncMessage(config.ackType, regionName, syncIndex, syncGroup);
			logDebug(timedDebug, 'Slave in resync but no master position known - sent normal %s', config.ackType);
		}
	}

	/**
	 * Handle signal-ready timeout: trigger resync and set target
	 */
	private async handleSignalReadyTimeout(
		phase: SyncPhase,
		config: SyncPhaseConfig,
		regionName: string,
		syncIndex: number,
		syncGroup: SyncGroup,
		timedDebug?: TimedDebugger,
	): Promise<void> {
		if (phase === 'playMode') {
			logDebug(timedDebug, 'Signal-ready timeout for playMode phase - no resync needed');
			return;
		}

		logDebug(timedDebug, '%s timeout for region=%s, syncIndex=%d - triggering resync', config.signalType, regionName, syncIndex);
		this.synchronization.syncingInAction = true;

		const masterPos = this.getPositions(regionName, config.state, syncGroup).master;
		if (masterPos > syncIndex) {
			if (!this.synchronization.resyncTargets) {
				this.synchronization.resyncTargets = {};
			}
			const nextTarget = this.getWrappedSyncIndex(
				this.getNextEffectiveSyncIndex(masterPos, regionName),
				regionName,
			);
			this.synchronization.resyncTargets[config.resyncField] = nextTarget;
			logDebug(timedDebug, 'Timeout recovery: setting %s resync target to %d (master at %d)',
				phase, nextTarget, masterPos);
		}
	}

	/**
	 * Unified method to coordinate the start of any sync phase
	 * Master broadcasts command, slaves wait for it
	 * @returns ProcessActionType indicating whether to continue or resync
	 */
	public async coordinatePhaseStart(
		phase: SyncPhase,
		regionName: string,
		syncIndex: number,
		timedDebug?: TimedDebugger,
		priorityLevel?: number,
	): Promise<ProcessActionType> {
		if (!this.synchronization.shouldSync) {
			return ProcessAction.CONTINUE;
		}

		const config = SYNC_PHASE_CONFIG[phase];
		const syncGroup = getSyncGroup(`${this.synchronization.syncGroupName}-${regionName}-before`);

		if (!syncGroup) {
			logDebug(timedDebug, 'No sync group for %s start: region=%s', phase, regionName);
			return ProcessAction.CONTINUE;
		}

		const isMaster = await syncGroup.isMaster();
		if (isMaster) {
			await this.broadcastSyncMessage(config.commandType, regionName, syncIndex, syncGroup, priorityLevel);
			logDebug(timedDebug, 'Master sent %s for region=%s, syncIndex=%d', config.commandType, regionName, syncIndex);
			return ProcessAction.CONTINUE;
		} else {
			logDebug(timedDebug, 'Slave waiting for %s from master for region=%s, syncIndex=%d', config.commandType, regionName, syncIndex);

			const action = await this.waitForCommandAndCheckSync(
				config.commandType,
				config.state,
				regionName,
				syncIndex,
				syncGroup,
				timedDebug,
				priorityLevel,
			);

			if (action === ProcessAction.CONTINUE) {
				logDebug(timedDebug, 'Slave received %s, starting %s coordination for region=%s, syncIndex=%d',
					config.commandType, phase, regionName, syncIndex);
			} else if (action === ProcessAction.RESYNC) {
				logDebug(timedDebug, 'Slave detected resync needed during %s start for region=%s, syncIndex=%d',
					phase, regionName, syncIndex);
			}

			return action;
		}
	}

	/**
	 * Unified method to coordinate the completion of any sync phase
	 * Slaves send ACK, master waits for all ACKs, then signals ready
	 */
	public async coordinatePhaseComplete(
		phase: SyncPhase,
		regionName: string,
		syncIndex: number,
		timedDebug?: TimedDebugger,
		priorityLevel?: number,
	): Promise<void> {
		if (!this.synchronization.shouldSync) {
			return;
		}

		const config = SYNC_PHASE_CONFIG[phase];
		const syncGroup = getSyncGroup(`${this.synchronization.syncGroupName}-${regionName}-before`);

		if (!syncGroup) {
			logDebug(timedDebug, 'No sync group for %s complete: region=%s', phase, regionName);
			return;
		}

		const isMaster = await syncGroup.isMaster();
		if (isMaster) {
			await this.handleMasterPhaseComplete(phase, config, regionName, syncIndex, syncGroup, timedDebug, priorityLevel);
		} else {
			await this.handleSlavePhaseComplete(phase, config, regionName, syncIndex, syncGroup, timedDebug, priorityLevel);
		}
	}

	/**
	 * Wait for signal-ready message from master (slaves only)
	 * @param signalType The specific signal type to wait for ('signal-ready-prepared', 'signal-ready-playing', or 'signal-ready-finished')
	 * @param expectedPriorityLevel Optional priority level to validate against incoming signals
	 */
	private async waitForSignalReady(
		regionName: string,
		syncIndex: number,
		syncGroup: SyncGroup,
		signalType: SyncSignalReadyType,
		timedDebug?: TimedDebugger,
		expectedPriorityLevel?: number,
	): Promise<boolean> {
		// Check for stored message first
		const storedMsg = syncGroup.getSyncCoordinationMessage(signalType, regionName);
		if (storedMsg && storedMsg.syncIndex === syncIndex) {
			// Validate priority if both are defined
			if (expectedPriorityLevel !== undefined &&
				storedMsg.priorityLevel !== undefined &&
				storedMsg.priorityLevel !== expectedPriorityLevel) {
				// Stale signal from different priority context - discard and wait for new one
				logDebug(timedDebug, 'Discarding stale %s with priority %d (expected %d)',
					signalType, storedMsg.priorityLevel, expectedPriorityLevel);
				syncGroup.clearSyncCoordinationMessage(signalType, regionName);
				// Fall through to active listener to wait for correct signal
			} else {
				// Priority matches or not checking - accept the signal
				const age = Date.now() - storedMsg.timestamp;
				logDebug(timedDebug, `Found stored ${signalType} for region=%s, syncIndex=%d, age=%dms`, regionName, syncIndex, age);
				// Clear signal-ready after consuming (unlike commands, we don't need to keep these)
				syncGroup.clearSyncCoordinationMessage(signalType, regionName);
				return true; // Continue immediately - signal received
			}
		}

		// Create promise with active listener
		return new Promise<boolean>((resolve) => {
			let resolved = false;
			let unsubscribe: (() => void) | undefined;
			let timeoutId: NodeJS.Timeout | undefined;

			const cleanup = () => {
				resolved = true;
				if (unsubscribe) {
					unsubscribe();
				}
				if (timeoutId) {
					clearTimeout(timeoutId);
				}
			};

			// Set up timeout
			timeoutId = setTimeout(() => {
				if (resolved) {
					return;
				}
				const timeoutMsg = `Timeout waiting for ${signalType} from master for region=${regionName}, syncIndex=${syncIndex}`;
				logDebug(timedDebug, timeoutMsg);
				cleanup();
				resolve(false);
			}, SYNC_TIMEOUTS.signalReadyTimeout);

			// Set up active listener
			unsubscribe = syncGroup.onValue(({ key, value }: { key: string; value?: any }) => {
				if (resolved) {
					return;
				} // Prevent processing after resolution

				if (key === 'sync-coordination' && value) {
					const message = value as SyncMessage;
					// Check if this is the signal-ready we're waiting for
					if (
						message.type === signalType &&
						message.regionName === regionName &&
						message.syncIndex === syncIndex
					) {
						// Validate priority if both are defined
						if (expectedPriorityLevel !== undefined &&
							message.priorityLevel !== undefined &&
							message.priorityLevel !== expectedPriorityLevel) {
							// Wrong priority - keep waiting for correct signal
							logDebug(timedDebug, 'Ignoring %s with priority %d (expected %d)',
								signalType, message.priorityLevel, expectedPriorityLevel);
							return; // Don't resolve, keep waiting
						}

						logDebug(timedDebug, `Received ${signalType} for region=${regionName}, syncIndex=${syncIndex}`);
						// Clear consumed message
						syncGroup.clearSyncCoordinationMessage(signalType, regionName);
						cleanup();
						resolve(true);
					}
				}
			});
		});
	}

	// ==================== playMode=one synchronization ====================

	/**
	 * Coordinate playMode=one element selection across synced devices.
	 * Master broadcasts its previousIndex; slaves override their local index.
	 *
	 * @param regionName - Region name used to look up the existing sync group
	 * @param syncParentId - Deterministic key for cross-device matching (based on syncIndex)
	 * @param localParentId - Hash-based key for local randomPlaylist state lookups
	 * @param currentPreviousIndex - Master's current previousIndex for this playlist
	 * @param randomPlaylist - Reference to the randomPlaylist record for overriding slave index
	 * @returns The previousIndex to use (master's own or received from master)
	 */
	public async coordinatePlayModeSync(
		regionName: string,
		syncParentId: string,
		localParentId: string,
		currentPreviousIndex: number,
		randomPlaylist: RandomPlaylist,
	): Promise<number> {
		if (!this.synchronization.shouldSync) {
			return currentPreviousIndex;
		}

		const syncGroup = getSyncGroup(`${this.synchronization.syncGroupName}-${regionName}-before`);
		if (!syncGroup) {
			logDebug(undefined, 'No sync group available for playMode sync, region: %s', regionName);
			return currentPreviousIndex;
		}

		const config = SYNC_PHASE_CONFIG['playMode'];
		const isMaster = await syncGroup.isMaster();

		if (isMaster) {
			// Broadcast cmd-playMode with previousIndex, then wait for ACKs + signal-ready
			// syncIndex is always 0 for playMode - element position is tracked via previousIndex,
			// not syncIndex. Clear stale ACKs from previous rounds since the key never changes.
			syncGroup.clearSyncCoordinationMessage(config.ackType, syncParentId);
			await this.broadcastSyncMessage(config.commandType, syncParentId, 0, syncGroup, undefined, currentPreviousIndex);
			logDebug(undefined, 'Master sent cmd-playMode for syncParent=%s, previousIndex=%d', syncParentId, currentPreviousIndex);
			await this.handleMasterPhaseComplete('playMode', config, syncParentId, 0, syncGroup);
			return currentPreviousIndex;
		}

		// Slave: wait for master's index, override local state, then ACK + signal-ready
		const receivedIndex = await this.waitForPlayModeCommand(syncParentId, syncGroup, regionName);

		if (receivedIndex === undefined) {
			logDebug(undefined, 'Slave timeout waiting for cmd-playMode for %s, using local index', syncParentId);
			return randomPlaylist[localParentId]?.previousIndex ?? 0;
		}

		if (!randomPlaylist[localParentId]) {
			randomPlaylist[localParentId] = { previousIndex: 0 };
		}
		randomPlaylist[localParentId].previousIndex = receivedIndex;
		logDebug(undefined, 'Slave overrode previousIndex to %d for syncParent=%s', receivedIndex, syncParentId);

		await this.handleSlavePhaseComplete('playMode', config, syncParentId, 0, syncGroup);
		return receivedIndex;
	}

	/**
	 * Slave waits for cmd-playMode from master, returns the previousIndex or undefined on timeout
	 */
	private async waitForPlayModeCommand(
		parentId: string,
		syncGroup: SyncGroup,
		regionName: string,
	): Promise<number | undefined> {
		// Check stored message first
		const stored = syncGroup.getSyncCoordinationMessage('cmd-playMode', parentId);
		if (stored && stored.previousIndex !== undefined) {
			// Check if stored message is stale by comparing against latest cmd-play timestamp.
			// Master sends cmd-play and cmd-playMode at the same time, so a cmd-playMode
			// older than the latest cmd-play is from a previous cycle.
			const latestCmdPlay = syncGroup.getSyncCoordinationMessage('cmd-play', regionName);
			if (latestCmdPlay && stored.timestamp < latestCmdPlay.timestamp) {
				logDebug(undefined, 'Discarding stale cmd-playMode for %s: message timestamp %d < latest cmd-play timestamp %d',
					parentId, stored.timestamp, latestCmdPlay.timestamp);
				syncGroup.clearSyncCoordinationMessage('cmd-playMode', parentId);
				// Fall through to wait for fresh message via listener
			} else {
				logDebug(undefined, 'Found stored cmd-playMode for %s, previousIndex=%d', parentId, stored.previousIndex);
				syncGroup.clearSyncCoordinationMessage('cmd-playMode', parentId);
				return stored.previousIndex;
			}
		}

		return new Promise<number | undefined>((resolve) => {
			let resolved = false;
			let unsubscribe: (() => void) | undefined;
			let unsubscribeMasterChange: (() => void) | undefined;
			let timeoutId: NodeJS.Timeout | undefined;

			const cleanup = () => {
				resolved = true;
				if (unsubscribe) unsubscribe();
				if (unsubscribeMasterChange) unsubscribeMasterChange();
				if (timeoutId) clearTimeout(timeoutId);
			};

			timeoutId = setTimeout(() => {
				if (resolved) return;
				logDebug(undefined, 'Timeout waiting for cmd-playMode for %s', parentId);
				cleanup();
				resolve(undefined);
			}, SYNC_TIMEOUTS.playModeCmdTimeout);

			unsubscribeMasterChange = syncGroup.onMasterChange((isMaster: boolean) => {
				if (resolved) return;
				if (isMaster) {
					logDebug(undefined, 'Slave became master while waiting for cmd-playMode');
					cleanup();
					resolve(undefined);
				}
			});

			unsubscribe = syncGroup.onValue(({ key, value }: { key: string; value?: any }) => {
				if (resolved) return;
				if (key === 'sync-coordination' && value) {
					const msg = value as SyncMessage;
					if (msg.type === 'cmd-playMode' && msg.regionName === parentId && msg.previousIndex !== undefined) {
						logDebug(undefined, 'Received cmd-playMode for %s, previousIndex=%d', parentId, msg.previousIndex);
						syncGroup.clearSyncCoordinationMessage('cmd-playMode', parentId);
						cleanup();
						resolve(msg.previousIndex);
					}
				}
			});
		});
	}
}
