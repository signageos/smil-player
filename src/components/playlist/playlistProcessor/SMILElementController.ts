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
				debug('Reached resync target during preparation: syncIndex=%d', syncIndex);
				// Clear prepare target
				delete this.synchronization.resyncTargets.prepare;
				// Clear syncingInAction only if no other targets remain
				if (!this.synchronization.resyncTargets?.play) {
					this.synchronization.syncingInAction = false;
				}
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
				debug('Reached resync target during playback: syncIndex=%d', syncIndex);
				// Clear play target
				delete this.synchronization.resyncTargets.play;
				// Clear syncingInAction only if no other targets remain
				if (!this.synchronization.resyncTargets?.prepare) {
					this.synchronization.syncingInAction = false;
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
		console.log('waiting for master state with syncIndex', syncIndex);
		return new Promise((resolve) => {
			const timeout = setTimeout(() => {
				debug('Timeout waiting for state: %s', expectedState);
				resolve();
			}, 1000000); // 1000 second timeout

			syncGroup.onValue(({ key, value }: { key: string; value?: any }) => {
				if (key === 'elementState' && value?.regionName === regionName) {
					// Debug all state broadcasts to understand flow
					debug(
						'Received state broadcast: state=%s, syncIndex=%d (waiting for state=%s, syncIndex=%d)',
						value.state,
						value.syncIndex,
						expectedState,
						syncIndex,
					);
					
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
					} else if (expectedState === 'prepared' && value.state === 'playing' && value.syncIndex > syncIndex) {
						// Special case: We're waiting for 'prepared' but master is already playing a future element
						// This means we missed our chance to prepare and need to catch up
						clearTimeout(timeout);
						debug(
							'Waiting for prepared but master playing future element - need resync. Master playing %d, we waiting at %d',
							value.syncIndex,
							syncIndex,
						);
						
						// Set target to prepare for the NEXT element after what master is playing
						const maxIndex = this.synchronization.maxSyncIndexPerRegion?.[regionName];
						let nextIndex: number;
						
						if (maxIndex !== undefined && value.syncIndex >= maxIndex) {
							// Master playing last element, we'll prepare first element
							nextIndex = 1;
						} else {
							// Prepare next element after what master is playing
							nextIndex = value.syncIndex + 1;
						}
						
						// Set state-specific resync target for preparation
						if (!this.synchronization.resyncTargets) {
							this.synchronization.resyncTargets = {};
						}
						this.synchronization.resyncTargets.prepare = nextIndex;
						this.synchronization.syncingInAction = true;
						debug('Setting resync target to prepare syncIndex=%d', nextIndex);
						resolve();
					} else if (value.state === expectedState && value.syncIndex > syncIndex) {
						// Master ahead with same state
						clearTimeout(timeout);
						debug('Master ahead - need resync. Master at %d, we are at %d', value.syncIndex, syncIndex);
						
						// Handle wraparound for playlist looping
						const maxIndex = this.synchronization.maxSyncIndexPerRegion?.[regionName];
						let nextIndex: number;
						
						if (maxIndex !== undefined && value.syncIndex >= maxIndex) {
							// Master is at last element, wrap to beginning (1)
							nextIndex = 1;
						} else {
							// Normal case: increment
							nextIndex = value.syncIndex + 1;
						}
						
						// Set state-specific resync target based on expected state
						if (!this.synchronization.resyncTargets) {
							this.synchronization.resyncTargets = {};
						}
						
						// Determine which target to set based on what state we're waiting for
						if (expectedState === 'prepared') {
							this.synchronization.resyncTargets.prepare = nextIndex;
						} else if (expectedState === 'playing') {
							this.synchronization.resyncTargets.play = nextIndex;
						}
						
						this.synchronization.syncingInAction = true;
						debug('Setting resync target for %s state to syncIndex=%d', expectedState, nextIndex);
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
								// At last element, wrap to beginning (1)
								nextIndex = 1;
							} else {
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
						resolve();
					}
					// Continue listening for other state broadcasts
					// Don't resolve for unrelated broadcasts - just keep waiting
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
