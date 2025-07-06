import FrontApplet from '@signageos/front-applet/es6/FrontApplet/FrontApplet';
import { debug } from '../tools/generalTools';
import { Synchronization, SyncElementState } from '../../../models/syncModels';
import { ElementRegistry } from '../playlistDataPrepare/ElementRegistry';
import { getSyncGroup } from '../tools/syncTools';
import { SMILMedia } from '../../../models/mediaModels';

export class SMILElementController {
	constructor(
		private sos: FrontApplet,
		private synchronization: Synchronization,
		private elementRegistry: ElementRegistry,
	) {}

	/**
	 * Prepare element for playback - coordinates sync at element boundaries
	 */
	public async prepareElement(
		element: SMILMedia,
		regionName: string,
		syncIndex: number,
	): Promise<void> {
		if (!this.synchronization.shouldSync) {
			return; // No-op for non-sync playlists
		}

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
	 * Check if element should start playback - replaces handleElementSynchronization
	 */
	public async shouldStartPlayback(
		element: SMILMedia,
		regionName: string,
		syncIndex: number,
	): Promise<boolean> {
		if (!this.synchronization.shouldSync) {
			return true; // Always play immediately in non-sync mode
		}

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
	public async markElementFinished(
		element: SMILMedia,
		regionName: string,
		syncIndex: number,
	): Promise<void> {
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
	private async broadcastState(
		state: SyncElementState,
		regionName: string,
		syncIndex: number,
	): Promise<void> {
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
				if (
					key === 'elementState' &&
					value?.state === expectedState &&
					value?.regionName === regionName &&
					value?.syncIndex === syncIndex
				) {
					clearTimeout(timeout);
					debug('Received expected state: %s for region=%s, syncIndex=%d', expectedState, regionName, syncIndex);
					resolve();
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