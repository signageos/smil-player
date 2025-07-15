import { debug } from '../tools/generalTools';
import { Synchronization, SyncElementState } from '../../../models/syncModels';
import { getSyncGroup } from '../tools/syncTools';

// Process actions for element state handling
const ProcessAction = {
	CONTINUE: 'CONTINUE',    // Exact match - continue playing normally
	RESYNC: 'RESYNC',        // Slave behind master - trigger resync to skip elements
	WAIT: 'WAIT'             // Keep waiting for correct broadcast
} as const;

type ProcessActionType = typeof ProcessAction[keyof typeof ProcessAction];

export class SMILElementController {

	constructor(private synchronization: Synchronization) {}

	/**
	 * Prepare element for playback - coordinates sync at element boundaries
	 */
	public async prepareElement(regionName: string, syncIndex: number): Promise<boolean> {
		debug('Preparing element for sync: region=%s, syncIndex=%d', regionName, syncIndex);

		const syncGroup = getSyncGroup(`${this.synchronization.syncGroupName}-${regionName}-before`);
		if (!syncGroup) {
			debug('No sync group found for region: %s', regionName);
			return true; // No sync, continue
		}

		// Coordinate element transition - late joiners will sync here
		return await this.coordinateElementTransition(syncGroup, 'prepared', regionName, syncIndex);
	}

	/**
	 * Check if element should be prepared - handles resync logic for preparation phase
	 */
	public async shouldPrepareElement(regionName: string, syncIndex: number): Promise<boolean> {
		if (!this.synchronization.shouldSync) {
			return true; // No sync, always prepare
		}

		// Check if we're in resync mode for preparation
		if (this.synchronization.syncingInAction && this.synchronization.resyncTargets?.prepare) {
			if (syncIndex < this.synchronization.resyncTargets.prepare) {
				debug(
					'Skipping element preparation during resync: syncIndex=%d, target=%d',
					syncIndex,
					this.synchronization.resyncTargets.prepare,
				);
				return false; // Skip preparation
			} else if (syncIndex === this.synchronization.resyncTargets.prepare) {
				debug('Reached resync target during preparation: region=%s, syncIndex=%d', regionName, syncIndex);
				console.log(`[SYNC] Reached prepare target at index ${syncIndex} - resuming normal sync`);
				// Clear prepare target
				delete this.synchronization.resyncTargets.prepare;
				// Clear syncingInAction only if no other targets remain
				if (!this.synchronization.resyncTargets?.play) {
					this.synchronization.syncingInAction = false;
					debug('All resync targets cleared - exiting resync mode');
				}
				// Continue with normal preparation
			}
		}

		// Coordinate preparation with other devices
		const shouldContinue = await this.prepareElement(regionName, syncIndex);
		// If preparation triggered resync, we should skip
		if (!shouldContinue) {
			debug('Preparation coordination triggered resync - skip element');
			return false;
		}
		return true;
	}

	/**
	 * Check if element should be played - handles resync logic for playback phase
	 */
	public async shouldPlayElement(regionName: string, syncIndex: number): Promise<boolean> {
		if (!this.synchronization.shouldSync) {
			return true; // No sync needed
		}

		// Check if we're in resync mode for playing
		if (this.synchronization.syncingInAction && this.synchronization.resyncTargets?.play) {
			if (syncIndex < this.synchronization.resyncTargets.play) {
				debug(
					'Skipping element playback during resync: syncIndex=%d, target=%d',
					syncIndex,
					this.synchronization.resyncTargets.play,
				);
				return false; // Skip this element
			} else if (syncIndex === this.synchronization.resyncTargets.play) {
				debug('Reached resync target during playback: region=%s, syncIndex=%d', regionName, syncIndex);
				console.log(`[SYNC] Reached play target at index ${syncIndex} - resuming normal sync`);
				// Clear play target
				delete this.synchronization.resyncTargets.play;
				// Clear syncingInAction only if no other targets remain
				if (!this.synchronization.resyncTargets?.prepare) {
					this.synchronization.syncingInAction = false;
					debug('All resync targets cleared - exiting resync mode');
				}
				// Continue with normal sync
			}
		}

		// Normal sync flow
		return await this.shouldStartPlayback(regionName, syncIndex);
	}

	/**
	 * Check if element should start playback - replaces handleElementSynchronization
	 */
	public async shouldStartPlayback(regionName: string, syncIndex: number): Promise<boolean> {
		debug('Checking if should start playback: region=%s, syncIndex=%d', regionName, syncIndex);

		const syncGroup = getSyncGroup(`${this.synchronization.syncGroupName}-${regionName}-before`);
		if (!syncGroup) {
			debug('No sync group found for region: %s', regionName);
			return true;
		}

		// Coordinate playback start
		return await this.coordinateElementTransition(syncGroup, 'playing', regionName, syncIndex);
	}

	/**
	 * Mark element as finished - clean up sync state
	 */
	public async markElementFinished(regionName: string, syncIndex: number): Promise<void> {
		if (!this.synchronization.shouldSync) {
			return; // No-op for non-sync playlists
		}

		debug('Marking element as finished: region=%s, syncIndex=%d', regionName, syncIndex);

		// Broadcast finished state if master
		const isMaster = await this.isMaster(regionName);
		if (isMaster) {
			await this.broadcastState('finished', regionName, syncIndex);
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
	): Promise<boolean> {
		const isMaster = await syncGroup.isMaster();

		if (isMaster) {
			debug('Master coordinating %s state for region=%s, syncIndex=%d', state, regionName, syncIndex);
			await this.broadcastState(state, regionName, syncIndex);
			return true; // Master always continues
		} else {
			debug('Slave waiting for %s state for region=%s, syncIndex=%d', state, regionName, syncIndex);
			console.log('master state resolve', Date.now());
			const shouldContinue = await this.waitForMasterState(syncGroup, state, regionName, syncIndex);
			console.log('master state resolved', Date.now());
			return shouldContinue;
		}
	}

	/**
	 * Broadcast state to sync group (master only)
	 */
	private async broadcastState(state: SyncElementState, regionName: string, syncIndex: number): Promise<void> {
		const syncGroup = getSyncGroup(`${this.synchronization.syncGroupName}-${regionName}-before`);
		if (!syncGroup) return;

		await syncGroup.broadcastValue('elementState', {
			state,
			regionName,
			syncIndex,
			timestamp: Date.now(),
		});

		debug('Broadcasted state: %s for region=%s, syncIndex=%d', state, regionName, syncIndex);
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
			debug(
				'Received expected state: %s for region=%s, syncIndex=%d',
				expectedState,
				regionName,
				syncIndex,
			);
			return ProcessAction.CONTINUE; // In sync, continue normally
		} else if (
			expectedState === 'prepared' &&
			value.state === 'playing' &&
			value.syncIndex > syncIndex
		) {
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
	): Promise<boolean> {
		console.log('waiting for master state with syncIndex', syncIndex, expectedState);
		
		// Check for stored state first
		const storedValue = syncGroup.getLastValue('elementState');
		if (storedValue && storedValue.regionName === regionName) {
			const age = Date.now() - storedValue.timestamp;
			
			// Check freshness (2 seconds)
			if (age < 2000) {
				debug('Found fresh stored state for region=%s, age=%dms', regionName, age);
				
				const action = this.processElementState(
					storedValue, 
					expectedState, 
					syncIndex, 
					regionName
				);
				
				// Handle action based on type
				switch (action) {
					case ProcessAction.CONTINUE:
						// Clear consumed state and continue normally
						syncGroup.clearLastValue('elementState');
						debug('Cleared consumed elementState - continuing normally');
						return true;
					case ProcessAction.RESYNC:
						// Clear consumed state and trigger resync
						syncGroup.clearLastValue('elementState');
						debug('Cleared consumed elementState - triggering resync');
						return false;
					case ProcessAction.WAIT:
						// Don't clear state, don't return - wait for correct broadcast
						debug('Not clearing elementState - waiting for correct broadcast');
						// Fall through to set up listener
						break;
				}
			} else {
				debug('Stored state too old (age=%dms > 2000ms), ignoring', age);
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
				debug('Timeout waiting for state: %s, syncIndex=%d, region=%s', expectedState, syncIndex, regionName);
				console.log(`[SYNC] Timeout waiting for ${expectedState} state at syncIndex ${syncIndex} for region ${regionName} - continuing independently`);
				cleanup();
				resolve(true); // Continue on timeout to avoid blocking
			}, 90000); // 90 second timeout

			// Monitor master changes
			unsubscribeMasterChange = syncGroup.onMasterChange((isMaster: boolean) => {
				if (resolved) return; // Prevent processing after resolution
				
				if (isMaster) {
					// This device became master while waiting
					debug('Slave became master while waiting for state=%s, syncIndex=%d, region=%s', expectedState, syncIndex, regionName);
					console.log(`[SYNC] Device became master while waiting - continuing playback`);
					cleanup();
					resolve(true); // Continue playback as new master
				} else {
					// Another device became master
					debug('Master changed to another device while waiting for state=%s, syncIndex=%d, region=%s', expectedState, syncIndex, regionName);
					// Continue waiting for new master's broadcast
				}
			});

			unsubscribe = syncGroup.onValue(({ key, value }: { key: string; value?: any }) => {
				if (resolved) return; // Prevent processing after resolution
				console.log('Received value in syncGroup', value);
				console.log('---------------------------------------------------');
				if (key === 'elementState' && value?.regionName === regionName) {
					const action = this.processElementState(
						value,
						expectedState,
						syncIndex,
						regionName
					);
					
					// Handle action based on type
					switch (action) {
						case ProcessAction.CONTINUE:
						case ProcessAction.RESYNC:
							// Clear consumed state and resolve
							syncGroup.clearLastValue('elementState');
							debug(`Cleared consumed elementState - action: ${action}`);
							cleanup();
							resolve(action === ProcessAction.CONTINUE);
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
}
