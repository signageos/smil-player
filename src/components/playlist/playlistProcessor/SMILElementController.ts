import { debug } from '../tools/generalTools';
import { Synchronization, SyncElementState } from '../../../models/syncModels';
import { getSyncGroup } from '../tools/syncTools';

export class SMILElementController {
	constructor(private synchronization: Synchronization) {}

	/**
	 * Prepare element for playback - coordinates sync at element boundaries
	 */
	public async prepareElement(regionName: string, syncIndex: number): Promise<void> {
		debug('Preparing element for sync: region=%s, syncIndex=%d', regionName, syncIndex);

		const syncGroup = getSyncGroup(`${this.synchronization.syncGroupName}-${regionName}-before`);
		if (!syncGroup) {
			debug('No sync group found for region: %s', regionName);
			return;
		}

		// Coordinate element transition - late joiners will sync here
		await this.coordinateElementTransition(syncGroup, 'prepared', regionName, syncIndex);
	}

	/**
	 * Check if element should be prepared - handles resync logic for preparation phase
	 */
	public async shouldPrepareElement(regionName: string, syncIndex: number): Promise<boolean> {
		if (!this.synchronization.shouldSync) {
			return true; // No sync, always prepare
		}
		
		// Check if we're in resync mode
		if (this.synchronization.syncingInAction && this.synchronization.targetSyncIndex) {
			if (syncIndex < this.synchronization.targetSyncIndex) {
				debug('Skipping element preparation during resync: syncIndex=%d, target=%d', 
					syncIndex, this.synchronization.targetSyncIndex);
				return false; // Skip preparation
			} else if (syncIndex === this.synchronization.targetSyncIndex) {
				debug('Reached resync target during preparation: syncIndex=%d', syncIndex);
				// Clear resync flags
				this.synchronization.syncingInAction = false;
				this.synchronization.targetSyncIndex = undefined;
				// Continue with normal preparation
			}
		}
		
		// Coordinate preparation with other devices
		await this.prepareElement(regionName, syncIndex);
		return true;
	}

	/**
	 * Check if element should be played - handles resync logic for playback phase
	 */
	public async shouldPlayElement(regionName: string, syncIndex: number): Promise<boolean> {
		if (!this.synchronization.shouldSync) {
			return true; // No sync needed
		}

		// Check if we're in resync mode
		if (this.synchronization.syncingInAction && this.synchronization.targetSyncIndex) {
			if (syncIndex < this.synchronization.targetSyncIndex) {
				debug(
					'Skipping element during resync: syncIndex=%d, target=%d',
					syncIndex,
					this.synchronization.targetSyncIndex,
				);
				return false; // Skip this element
			} else if (syncIndex === this.synchronization.targetSyncIndex) {
				debug('Reached resync target: syncIndex=%d', syncIndex);
				// Clear resync flags
				this.synchronization.syncingInAction = false;
				this.synchronization.targetSyncIndex = undefined;
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
		await this.coordinateElementTransition(syncGroup, 'playing', regionName, syncIndex);
		return true;
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
	): Promise<void> {
		const isMaster = await syncGroup.isMaster();

		if (isMaster) {
			debug('Master coordinating %s state for region=%s, syncIndex=%d', state, regionName, syncIndex);
			await this.broadcastState(state, regionName, syncIndex);
		} else {
			debug('Slave waiting for %s state for region=%s, syncIndex=%d', state, regionName, syncIndex);
			await this.waitForMasterState(syncGroup, state, regionName, syncIndex);
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
	 * Wait for master state broadcast (slave only)
	 */
	private async waitForMasterState(
		syncGroup: any,
		expectedState: SyncElementState,
		regionName: string,
		syncIndex: number,
	): Promise<void> {
		return new Promise((resolve) => {
			const timeout = setTimeout(() => {
				debug('Timeout waiting for state: %s', expectedState);
				resolve();
			}, 10000); // 10 second timeout

			syncGroup.onValue(({ key, value }: { key: string; value?: any }) => {
				if (key === 'elementState' && value?.regionName === regionName) {
					if (value.state === expectedState && value.syncIndex === syncIndex) {
						// Normal case: exact match
						clearTimeout(timeout);
						debug(
							'Received expected state: %s for region=%s, syncIndex=%d',
							expectedState,
							regionName,
							syncIndex,
						);
						resolve();
					} else if (value.state === expectedState && value.syncIndex > syncIndex) {
						// Master ahead with same state
						clearTimeout(timeout);
						debug('Master ahead - need resync. Master at %d, we are at %d', value.syncIndex, syncIndex);
						this.synchronization.targetSyncIndex = value.syncIndex + 1;
						this.synchronization.syncingInAction = true;
						resolve();
					} else if (value.syncIndex === syncIndex && value.state !== expectedState) {
						// Same element but different state
						clearTimeout(timeout);
						
						// Determine if we're ahead or behind based on state progression
						const stateOrder: SyncElementState[] = ['prepared', 'playing', 'finished'];
						const expectedIndex = stateOrder.indexOf(expectedState);
						const receivedIndex = stateOrder.indexOf(value.state);
						
						if (receivedIndex > expectedIndex) {
							// We're behind (e.g., we expect 'prepared' but master is at 'playing')
							debug('Behind in state progression - expected %s but master at %s for syncIndex=%d', 
								expectedState, value.state, syncIndex);
							// Skip to next element
							this.synchronization.targetSyncIndex = syncIndex + 1;
							this.synchronization.syncingInAction = true;
						} else {
							// We're ahead (e.g., we expect 'playing' but master is at 'prepared')
							debug('Ahead in state progression - expected %s but master at %s for syncIndex=%d', 
								expectedState, value.state, syncIndex);
							// Wait for master to catch up - don't set resync flags
						}
						resolve();
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
