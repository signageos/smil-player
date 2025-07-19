import { debug } from '../tools/generalTools';
import { Synchronization, SyncElementState, SyncMessage, SyncMessageType } from '../../../models/syncModels';
import { getSyncGroup } from '../tools/syncTools';
import { TimedDebugger } from './playlistProcessor';

// Process actions for element state handling
const ProcessAction = {
	CONTINUE: 'CONTINUE', // Exact match - continue playing normally
	RESYNC: 'RESYNC', // Slave behind master - trigger resync to skip elements
	WAIT: 'WAIT', // Keep waiting for correct broadcast
} as const;

type ProcessActionType = typeof ProcessAction[keyof typeof ProcessAction];

/**
 * Tracks acknowledgments from slave devices for synchronized operations
 */
class AckTracker {
	private activeRounds: Map<string, AckRound> = new Map<string, AckRound>();

	/**
	 * Start tracking acknowledgments for a specific operation
	 * @param key Unique identifier for this ACK round (e.g., "region1-5-prepared")
	 * @param expectedCount Number of ACKs expected (excluding master)
	 * @param timeoutMs Timeout in milliseconds (default 500ms)
	 * @returns Promise that resolves to true if all ACKs received, false if timeout
	 */
	public async waitForAcks(key: string, expectedCount: number, timeoutMs: number = 500): Promise<boolean> {
		debug('Starting ACK tracking for %s, expecting %d ACKs, timeout %dms', key, expectedCount, timeoutMs);

		// If no slaves to wait for, return immediately
		if (expectedCount === 0) {
			debug('No ACKs expected for %s, continuing', key);
			return true;
		}

		// Create new round
		const round = new AckRound(expectedCount);
		this.activeRounds.set(key, round);

		// Set up timeout
		const timeoutPromise = new Promise<boolean>((resolve) => {
			setTimeout(() => {
				debug('ACK timeout for %s - received %d of %d ACKs', key, round.receivedCount, expectedCount);
				this.cleanupRound(key);
				resolve(false);
			}, timeoutMs);
		});

		// Wait for either all ACKs or timeout
		const result = await Promise.race([round.promise, timeoutPromise]);

		// Cleanup
		this.cleanupRound(key);

		return result;
	}

	/**
	 * Record an acknowledgment for a specific round
	 * @param key The round identifier
	 */
	public recordAck(key: string): void {
		const round = this.activeRounds.get(key);
		if (!round) {
			debug('Received ACK for unknown round: %s', key);
			return;
		}

		round.addAck();
		debug('Recorded ACK for %s - %d of %d received', key, round.receivedCount, round.expectedCount);

		if (round.isComplete()) {
			debug('All ACKs received for %s', key);
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
	public resolve: (value: boolean) => void = () => {};

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

	constructor(private synchronization: Synchronization) {}

	/**
	 * Prepare element for playback - coordinates sync at element boundaries
	 */
	public async prepareElement(regionName: string, syncIndex: number, timedDebug?: TimedDebugger): Promise<boolean> {
		const msg = 'Preparing element for sync: region=%s, syncIndex=%d';
		if (timedDebug) {
			timedDebug.log(msg, regionName, syncIndex);
		} else {
			debug(msg, regionName, syncIndex);
		}

		const syncGroup = getSyncGroup(`${this.synchronization.syncGroupName}-${regionName}-before`);
		if (!syncGroup) {
			const noGroupMsg = 'No sync group found for region: %s';
			if (timedDebug) {
				timedDebug.log(noGroupMsg, regionName);
			} else {
				debug(noGroupMsg, regionName);
			}
			return true; // No sync, continue
		}

		// Coordinate element transition - late joiners will sync here
		return await this.coordinateElementTransition(syncGroup, 'prepared', regionName, syncIndex, timedDebug);
	}

	/**
	 * Check if element should be prepared - handles resync logic for preparation phase
	 */
	public async shouldPrepareElement(
		regionName: string,
		syncIndex: number,
		timedDebug?: TimedDebugger,
	): Promise<boolean> {
		if (!this.synchronization.shouldSync) {
			return true; // No sync, always prepare
		}

		// Check if we're in resync mode for preparation
		if (this.synchronization.syncingInAction && this.synchronization.resyncTargets?.prepare) {
			if (syncIndex < this.synchronization.resyncTargets.prepare) {
				const msg = 'Skipping element preparation during resync: syncIndex=%d, target=%d';
				if (timedDebug) {
					timedDebug.log(msg, syncIndex, this.synchronization.resyncTargets.prepare);
				} else {
					debug(msg, syncIndex, this.synchronization.resyncTargets.prepare);
				}
				return false; // Skip preparation
			} else if (syncIndex === this.synchronization.resyncTargets.prepare) {
				const msg = 'Reached resync target during preparation: region=%s, syncIndex=%d';
				if (timedDebug) {
					timedDebug.log(msg, regionName, syncIndex);
				} else {
					debug(msg, regionName, syncIndex);
				}
				console.log(`[SYNC] Reached prepare target at index ${syncIndex} - resuming normal sync`);
				// Clear prepare target
				delete this.synchronization.resyncTargets.prepare;
				// Clear syncingInAction only if no other targets remain
				if (!this.synchronization.resyncTargets?.play) {
					this.synchronization.syncingInAction = false;
					const clearMsg = 'All resync targets cleared - exiting resync mode';
					if (timedDebug) {
						timedDebug.log(clearMsg);
					} else {
						debug(clearMsg);
					}
				}
				// Continue with normal preparation
			}
		}

		// Coordinate preparation with other devices
		const shouldContinue = await this.prepareElement(regionName, syncIndex, timedDebug);
		// If preparation triggered resync, we should skip
		if (!shouldContinue) {
			const skipMsg = 'Preparation coordination triggered resync - skip element';
			if (timedDebug) {
				timedDebug.log(skipMsg);
			} else {
				debug(skipMsg);
			}
			return false;
		}
		return true;
	}

	/**
	 * Check if element should be played - handles resync logic for playback phase
	 */
	public async shouldPlayElement(
		regionName: string,
		syncIndex: number,
		timedDebug?: TimedDebugger,
	): Promise<boolean> {
		if (!this.synchronization.shouldSync) {
			return true; // No sync needed
		}

		// Check if we're in resync mode for playing
		if (this.synchronization.syncingInAction && this.synchronization.resyncTargets?.play) {
			if (syncIndex < this.synchronization.resyncTargets.play) {
				const msg = 'Skipping element playback during resync: syncIndex=%d, target=%d';
				if (timedDebug) {
					timedDebug.log(msg, syncIndex, this.synchronization.resyncTargets.play);
				} else {
					debug(msg, syncIndex, this.synchronization.resyncTargets.play);
				}
				return false; // Skip this element
			} else if (syncIndex === this.synchronization.resyncTargets.play) {
				const msg = 'Reached resync target during playback: region=%s, syncIndex=%d';
				if (timedDebug) {
					timedDebug.log(msg, regionName, syncIndex);
				} else {
					debug(msg, regionName, syncIndex);
				}
				console.log(`[SYNC] Reached play target at index ${syncIndex} - resuming normal sync`);
				// Clear play target
				delete this.synchronization.resyncTargets.play;
				// Clear syncingInAction only if no other targets remain
				if (!this.synchronization.resyncTargets?.prepare) {
					this.synchronization.syncingInAction = false;
					const clearMsg = 'All resync targets cleared - exiting resync mode';
					if (timedDebug) {
						timedDebug.log(clearMsg);
					} else {
						debug(clearMsg);
					}
				}
				// Continue with normal sync
			}
		}

		// Normal sync flow
		return await this.shouldStartPlayback(regionName, syncIndex, timedDebug);
	}

	/**
	 * Check if element should start playback - replaces handleElementSynchronization
	 */
	public async shouldStartPlayback(
		regionName: string,
		syncIndex: number,
		timedDebug?: TimedDebugger,
	): Promise<boolean> {
		const msg = 'Checking if should start playback: region=%s, syncIndex=%d';
		if (timedDebug) {
			timedDebug.log(msg, regionName, syncIndex);
		} else {
			debug(msg, regionName, syncIndex);
		}

		const syncGroup = getSyncGroup(`${this.synchronization.syncGroupName}-${regionName}-before`);
		if (!syncGroup) {
			const noGroupMsg = 'No sync group found for region: %s';
			if (timedDebug) {
				timedDebug.log(noGroupMsg, regionName);
			} else {
				debug(noGroupMsg, regionName);
			}
			return true;
		}

		// Coordinate playback start
		return await this.coordinateElementTransition(syncGroup, 'playing', regionName, syncIndex, timedDebug);
	}

	/**
	 * Mark element as finished - clean up sync state
	 */
	public async markElementFinished(regionName: string, syncIndex: number, timedDebug?: TimedDebugger): Promise<void> {
		if (!this.synchronization.shouldSync) {
			return; // No-op for non-sync playlists
		}

		const msg = 'Marking element as finished: region=%s, syncIndex=%d';
		if (timedDebug) {
			timedDebug.log(msg, regionName, syncIndex);
		} else {
			debug(msg, regionName, syncIndex);
		}

		// Broadcast finished state if master
		const isMaster = await this.isMaster(regionName);
		if (isMaster) {
			await this.broadcastState('finished', regionName, syncIndex, timedDebug);
		}
	}

	/**
	 * Coordinate element state transition across devices
	 */
	private async coordinateElementTransition(
		syncGroup: any,
		state: SyncElementState,
		regionName: string,
		syncIndex: number,
		timedDebug?: TimedDebugger,
	): Promise<boolean> {
		const isMaster = await syncGroup.isMaster();

		if (isMaster) {
			const masterMsg = 'Master coordinating %s state for region=%s, syncIndex=%d';
			if (timedDebug) {
				timedDebug.log(masterMsg, state, regionName, syncIndex);
			} else {
				debug(masterMsg, state, regionName, syncIndex);
			}

			// IMPORTANT: Simulate slave processing to prevent timing drift
			// This ensures master takes similar time as slaves, preventing accumulation of ~50ms drift per transition
			await this.simulateSlaveProcessing(syncGroup, state, regionName, syncIndex, timedDebug);

			await this.broadcastState(state, regionName, syncIndex, timedDebug);

			return true; // Master always continues
		} else {
			const slaveMsg = 'Slave waiting for %s state for region=%s, syncIndex=%d';
			if (timedDebug) {
				timedDebug.log(slaveMsg, state, regionName, syncIndex);
			} else {
				debug(slaveMsg, state, regionName, syncIndex);
			}
			console.log('master state resolve', Date.now());
			const shouldContinue = await this.waitForMasterState(syncGroup, state, regionName, syncIndex, timedDebug);
			console.log('master state resolved', Date.now());

			// Send ACK after receiving state broadcast (hybrid mode for Step 4)
			if (shouldContinue && state === 'prepared') {
				await this.broadcastSyncMessage('ack-prepared', regionName, syncIndex, syncGroup);
				debug('Slave sent ACK after prepared state broadcast: region=%s, syncIndex=%d', regionName, syncIndex);
			} else if (shouldContinue && state === 'playing') {
				await this.broadcastSyncMessage('ack-playing', regionName, syncIndex, syncGroup);
				debug('Slave sent ACK after playing state broadcast: region=%s, syncIndex=%d', regionName, syncIndex);
			}

			return shouldContinue;
		}
	}

	/**
	 * Broadcast state to sync group (master only)
	 */
	private async broadcastState(
		state: SyncElementState,
		regionName: string,
		syncIndex: number,
		timedDebug?: TimedDebugger,
	): Promise<void> {
		const syncGroup = getSyncGroup(`${this.synchronization.syncGroupName}-${regionName}-before`);
		if (!syncGroup) return;

		await syncGroup.broadcastValue('elementState', {
			state,
			regionName,
			syncIndex,
			timestamp: Date.now(),
		});

		const msg = 'Broadcasted state: %s for region=%s, syncIndex=%d';
		if (timedDebug) {
			timedDebug.log(msg, state, regionName, syncIndex);
		} else {
			debug(msg, state, regionName, syncIndex);
		}
	}

	/**
	 * Process element state value and determine action
	 * Returns action to take based on the broadcast:
	 * - CONTINUE: Exact match found, continue playing normally
	 * - RESYNC: Slave is behind master, trigger resync to skip elements
	 * - WAIT: Keep waiting for the correct broadcast
	 */
	private processElementState(
		value: any,
		expectedState: SyncElementState,
		syncIndex: number,
		regionName: string,
	): ProcessActionType {
		// Log broadcast being processed
		debug(
			'Processing broadcast: state=%s, syncIndex=%d, timestamp=%d for region=%s (waiting for state=%s, syncIndex=%d)',
			value.state,
			value.syncIndex,
			value.timestamp,
			regionName,
			expectedState,
			syncIndex,
		);

		if (value.state === expectedState && value.syncIndex === syncIndex) {
			// Normal case: exact match
			debug('Received expected state: %s for region=%s, syncIndex=%d', expectedState, regionName, syncIndex);
			return ProcessAction.CONTINUE; // In sync, continue normally
		} else if (expectedState === 'prepared' && value.state === 'playing' && value.syncIndex > syncIndex) {
			// Special case: We're waiting for 'prepared' but master is already playing a future element
			// This means we missed our chance to prepare and need to catch up
			debug(
				'Waiting for prepared but master playing future element - need resync. Master playing %d, we waiting at %d',
				value.syncIndex,
				syncIndex,
			);

			// Set target to prepare for the NEXT element after what master is playing
			const maxIndex = this.synchronization.maxSyncIndexPerRegion?.[regionName];
			let nextIndex: number;

			if (maxIndex !== undefined && value.syncIndex >= maxIndex) {
				console.log('reseting index');
				// Master playing last element, we'll prepare first element
				nextIndex = 1;
			} else {
				console.log('increasing index');
				// Prepare next element after what master is playing
				nextIndex = value.syncIndex + 1;
			}

			// Set state-specific resync target for preparation
			if (!this.synchronization.resyncTargets) {
				this.synchronization.resyncTargets = {};
			}
			this.synchronization.resyncTargets.prepare = nextIndex;
			this.synchronization.syncingInAction = true;
			debug(
				'Setting resync target for preparation: region=%s, targetIndex=%d (master playing %d)',
				regionName,
				nextIndex,
				value.syncIndex,
			);
			console.log(`[SYNC] Slave needs to resync - waiting for prepared at index ${nextIndex}`);
			debug('Returning false from waitForMasterState to trigger element skip');
			return ProcessAction.RESYNC; // Trigger resync - skip current element
		} else if (value.state === expectedState && value.syncIndex > syncIndex) {
			// Master ahead with same state
			debug('Master ahead - need resync. Master at %d, we are at %d', value.syncIndex, syncIndex);

			// Handle wraparound for playlist looping
			const maxIndex = this.synchronization.maxSyncIndexPerRegion?.[regionName];
			let nextIndex: number;

			if (maxIndex !== undefined && value.syncIndex >= maxIndex) {
				console.log('reseting index');
				// Master is at last element, wrap to beginning (1)
				nextIndex = 1;
			} else {
				// Normal case: increment
				console.log('increasing index');
				nextIndex = value.syncIndex + 1;
			}

			// Set state-specific resync target based on expected state
			if (!this.synchronization.resyncTargets) {
				this.synchronization.resyncTargets = {};
			}

			// Determine which target to set based on what state we're waiting for
			if (expectedState === 'prepared') {
				this.synchronization.resyncTargets.prepare = nextIndex;
				debug(
					'Setting resync target for PREPARE: region=%s, targetIndex=%d (master at %d)',
					regionName,
					nextIndex,
					value.syncIndex,
				);
			} else if (expectedState === 'playing') {
				this.synchronization.resyncTargets.play = nextIndex;
				debug(
					'Setting resync target for PLAY: region=%s, targetIndex=%d (master at %d)',
					regionName,
					nextIndex,
					value.syncIndex,
				);
			}

			this.synchronization.syncingInAction = true;
			console.log(`[SYNC] Master ahead - resync to ${expectedState} at index ${nextIndex}`);
			return ProcessAction.RESYNC; // Trigger resync - skip current element
		} else if (value.syncIndex < syncIndex) {
			// Slave is ahead of master - wait for master to catch up
			debug(
				'Slave ahead of master - slave waiting for syncIndex=%d, master at syncIndex=%d for region=%s',
				syncIndex,
				value.syncIndex,
				regionName,
			);
			return ProcessAction.WAIT; // Keep waiting for correct broadcast
		} else if (value.syncIndex === syncIndex && value.state !== expectedState) {
			// Same element but different state
			// Determine if we're ahead or behind based on state progression
			const stateOrder: SyncElementState[] = ['prepared', 'playing', 'finished'];
			const expectedIndex = stateOrder.indexOf(expectedState);
			const receivedIndex = stateOrder.indexOf(value.state);

			if (receivedIndex > expectedIndex) {
				// We're behind (e.g., we expect 'prepared' but master is at 'playing')
				debug(
					'Behind in state progression - expected %s but master at %s for syncIndex=%d',
					expectedState,
					value.state,
					syncIndex,
				);

				// Handle wraparound for playlist looping
				const maxIndex = this.synchronization.maxSyncIndexPerRegion?.[regionName];
				let nextIndex: number;

				if (maxIndex !== undefined && syncIndex >= maxIndex) {
					console.log('reseting index');
					// At last element, wrap to beginning (1)
					nextIndex = 1;
				} else {
					console.log('increasing index');
					// Normal case: increment
					nextIndex = syncIndex + 1;
				}

				// Set state-specific resync target for preparation
				if (!this.synchronization.resyncTargets) {
					this.synchronization.resyncTargets = {};
				}
				// When behind in state progression, we need to prepare the next element
				this.synchronization.resyncTargets.prepare = nextIndex;
				this.synchronization.syncingInAction = true;
				debug(
					'Setting resync target due to state mismatch: region=%s, targetIndex=%d (behind in state progression)',
					regionName,
					nextIndex,
				);
				console.log(`[SYNC] Behind in state - resync to prepare at index ${nextIndex}`);
			} else {
				// We're ahead (e.g., we expect 'playing' but master is at 'prepared')
				debug(
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
	 * Wait for master state broadcast (slave only)
	 */
	private async waitForMasterState(
		syncGroup: any,
		expectedState: SyncElementState,
		regionName: string,
		syncIndex: number,
		timedDebug?: TimedDebugger,
	): Promise<boolean> {
		console.log('waiting for master state with syncIndex', syncIndex, expectedState);

		// Check for stored state first - look for exact match
		const exactMatch = syncGroup.getElementState(regionName, syncIndex, expectedState);
		if (exactMatch) {
			const age = Date.now() - exactMatch.timestamp;

			// Check freshness (2 seconds)
			if (age < 2000) {
				debug(
					'Found exact match in stored state for region=%s, syncIndex=%d, state=%s, age=%dms',
					regionName,
					syncIndex,
					expectedState,
					age,
				);

				// Process the exact match to determine action (should always be CONTINUE)
				const action = this.processElementState(exactMatch, expectedState, syncIndex, regionName);

				// Handle action (for exact match, we expect CONTINUE)
				if (action === ProcessAction.CONTINUE) {
					// Clear this specific state and continue
					syncGroup.clearElementState(regionName, syncIndex, expectedState);
					debug('Cleared consumed elementState - continuing normally');
					return true;
				} else {
					// Unexpected action for exact match
					debug('Unexpected action %s for exact match - treating as WAIT', action);
					// Fall through to check other states or set up listener
				}
			} else {
				debug('Stored state too old (age=%dms > 2000ms), ignoring', age);
			}
		}

		// No exact match - check if there's another state for this syncIndex
		const anyStateForIndex = syncGroup.findElementStateByIndex(regionName, syncIndex);
		if (anyStateForIndex) {
			const age = Date.now() - anyStateForIndex.timestamp;

			// Check freshness (2 seconds)
			if (age < 2000) {
				debug(
					'Found different state for same syncIndex: expected=%s, found=%s for region=%s, syncIndex=%d',
					expectedState,
					anyStateForIndex.state,
					regionName,
					syncIndex,
				);

				// Process with the found state to determine resync
				const action = this.processElementState(anyStateForIndex, expectedState, syncIndex, regionName);

				// For non-exact matches, we expect RESYNC action
				if (action === ProcessAction.RESYNC) {
					// Don't clear the found state - it might be needed later
					debug('Triggering resync - not clearing found state');
					return false;
				}
			}
		}

		// No valid stored state, set up listener
		return new Promise((resolve) => {
			let resolved = false;
			let unsubscribe: (() => void) | null = null;
			let unsubscribeMasterChange: (() => void) | null = null;

			const cleanup = () => {
				if (resolved) return;
				resolved = true;
				clearTimeout(timeout);
				if (unsubscribe) {
					debug('Cleaning up event listener for region=%s', regionName);
					unsubscribe();
					unsubscribe = null;
				}
				if (unsubscribeMasterChange) {
					debug('Cleaning up master change listener for region=%s', regionName);
					unsubscribeMasterChange();
					unsubscribeMasterChange = null;
				}
			};

			const timeout = setTimeout(() => {
				const timeoutMsg = 'Timeout waiting for state: %s, syncIndex=%d, region=%s';
				if (timedDebug) {
					timedDebug.log(timeoutMsg, expectedState, syncIndex, regionName);
				} else {
					debug(timeoutMsg, expectedState, syncIndex, regionName);
				}
				console.log(
					`[SYNC] Timeout waiting for ${expectedState} state at syncIndex ${syncIndex} for region ${regionName} - continuing independently`,
				);
				cleanup();
				resolve(true); // Continue on timeout to avoid blocking
			}, 90000); // 90 second timeout

			// Monitor master changes
			unsubscribeMasterChange = syncGroup.onMasterChange((isMaster: boolean) => {
				if (resolved) return; // Prevent processing after resolution

				if (isMaster) {
					// This device became master while waiting
					debug(
						'Slave became master while waiting for state=%s, syncIndex=%d, region=%s',
						expectedState,
						syncIndex,
						regionName,
					);
					console.log(`[SYNC] Device became master while waiting - continuing playback`);
					cleanup();
					resolve(true); // Continue playback as new master
				} else {
					// Another device became master
					debug(
						'Master changed to another device while waiting for state=%s, syncIndex=%d, region=%s',
						expectedState,
						syncIndex,
						regionName,
					);
					// Continue waiting for new master's broadcast
				}
			});

			unsubscribe = syncGroup.onValue(({ key, value }: { key: string; value?: any }) => {
				if (resolved) return; // Prevent processing after resolution
				console.log('Received value in syncGroup', value);
				console.log('---------------------------------------------------');
				if (key === 'elementState' && value?.regionName === regionName) {
					const action = this.processElementState(value, expectedState, syncIndex, regionName);

					// Handle action based on type
					switch (action) {
						case ProcessAction.CONTINUE:
							// Clear this specific consumed state and resolve
							syncGroup.clearElementState(regionName, syncIndex, expectedState);
							debug(`Cleared consumed elementState - continuing normally`);
							cleanup();
							resolve(true);
							break;
						case ProcessAction.RESYNC:
							// Don't clear on resync - the state might be needed
							debug(`Triggering resync - not clearing state`);
							cleanup();
							resolve(false);
							break;
						case ProcessAction.WAIT:
							// Don't resolve, keep waiting
							debug('Ignoring broadcast - waiting for correct state/syncIndex');
							break;
					}
				}
			});
		});
	}

	/**
	 * Check if this device is master for given region
	 */
	private async isMaster(regionName: string): Promise<boolean> {
		const syncGroup = getSyncGroup(`${this.synchronization.syncGroupName}-${regionName}-before`);
		if (!syncGroup) return false;

		return await syncGroup.isMaster();
	}

	/**
	 * DUMMY METHOD - NO FUNCTIONAL IMPACT
	 * Simulates slave processing time to maintain timing symmetry between master and slave.
	 * This prevents drift accumulation by ensuring master takes similar time as slaves.
	 *
	 * IMPORTANT: This method must have NO side effects on playback state!
	 * It only exists to consume similar CPU time as slave processing.
	 *
	 * @param syncGroup - The sync group to simulate operations on (read-only)
	 * @param state - The state being simulated
	 * @param regionName - The region name
	 * @param syncIndex - The sync index
	 */
	private async simulateSlaveProcessing(
		syncGroup: any,
		state: SyncElementState,
		regionName: string,
		syncIndex: number,
		timedDebug?: TimedDebugger,
	): Promise<void> {
		// Simulate state lookups that slaves perform (read-only operations)
		// These calls don't affect anything, just consume similar CPU time
		syncGroup.getElementState(regionName, syncIndex, state);
		syncGroup.findElementStateByIndex(regionName, syncIndex);

		// Run processElementState logic without using the result
		// This simulates the computational work slaves do
		const dummyValue = {
			state,
			regionName,
			syncIndex,
			timestamp: Date.now(),
		};
		// Call processElementState but ignore the result - purely for timing
		this.processElementState(dummyValue, state, syncIndex, regionName);

		// Add fixed delay to compensate for network propagation and slave processing overhead
		// This 200ms delay approximates the time it takes for:
		// - Network message delivery
		// - Slave event processing
		// - Additional overhead in slave code path
		await new Promise((resolve) => setTimeout(resolve, 300));

		const msg = 'Master simulated slave processing delay for sync timing symmetry';
		if (timedDebug) {
			timedDebug.log(msg);
		} else {
			debug(msg);
		}
	}

	/**
	 * Broadcast a sync coordination message (commands or ACKs)
	 */
	private async broadcastSyncMessage(
		type: SyncMessageType,
		regionName: string,
		syncIndex: number,
		syncGroup?: any,
	): Promise<void> {
		const message: SyncMessage = {
			type,
			regionName,
			syncIndex,
			timestamp: Date.now(),
		};

		// Use provided sync group or get it
		const group = syncGroup || getSyncGroup(`${this.synchronization.syncGroupName}-${regionName}-before`);
		if (!group) {
			debug('No sync group to broadcast to for region: %s', regionName);
			return;
		}

		await group.broadcastValue('sync-coordination', message);
		debug('Broadcasted sync message: type=%s, region=%s, syncIndex=%d', type, regionName, syncIndex);
	}

	/**
	 * Set up message routing based on device role
	 * This method should be called once during initialization
	 */
	public setupMessageRouting(regionName: string): void {
		const syncGroup = getSyncGroup(`${this.synchronization.syncGroupName}-${regionName}-before`);
		if (!syncGroup) {
			debug('No sync group for message routing setup: %s', regionName);
			return;
		}

		// Subscribe to sync-coordination messages
		syncGroup.onValue(async ({ key, value }: { key: string; value: any }) => {
			if (key !== 'sync-coordination' || !value) return;

			const message = value as SyncMessage;
			const isMaster = await syncGroup.isMaster();

			// Role-based filtering
			if (isMaster) {
				// Master only processes ACK messages from slaves
				if (this.isAckMessage(message.type)) {
					this.handleAckMessage(message);
				}
			} else {
				// Slaves only process command messages from master
				if (this.isCommandMessage(message.type)) {
					this.handleCommandMessage(message);
				}
			}
		});

		debug('Message routing setup complete for region: %s', regionName);
	}

	/**
	 * Check if message type is an ACK (from slaves)
	 */
	private isAckMessage(type: SyncMessageType): boolean {
		return type === 'ack-prepared' || type === 'ack-playing';
	}

	/**
	 * Check if message type is a command (from master)
	 */
	private isCommandMessage(type: SyncMessageType): boolean {
		return type === 'cmd-prepare' || type === 'cmd-play' || type === 'signal-ready';
	}

	/**
	 * Handle incoming ACK messages (master only)
	 */
	private handleAckMessage(message: SyncMessage): void {
		debug('Master received ACK: type=%s, region=%s, syncIndex=%d',
			message.type, message.regionName, message.syncIndex);

		// Build key for ACK tracking
		const ackKey = `${message.regionName}-${message.syncIndex}-${message.type}`;
		this.ackTracker.recordAck(ackKey);
	}

	/**
	 * Handle incoming command messages (slaves only)
	 * Note: Actual command processing will be implemented in later steps
	 */
	private handleCommandMessage(message: SyncMessage): void {
		debug('Slave received command: type=%s, region=%s, syncIndex=%d',
			message.type, message.regionName, message.syncIndex);
		
		// Command processing will be implemented in Step 4
		// For now, just log that we received it
	}

	/**
	 * Initialize ACK message routing for a region
	 * NOTE: This must be called once per region before sync operations begin
	 * TODO: Call this from playlistProcessor when initializing regions
	 */
	public initializeAckProtocol(regionName: string): void {
		if (!this.synchronization.shouldSync) {
			return; // No sync, no initialization needed
		}

		// Set up message routing for this region
		this.setupMessageRouting(regionName);
		debug('ACK protocol initialized for region: %s', regionName);
	}
}
