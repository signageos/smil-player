import { EventEmitter } from 'events';
import Debug from 'debug';
import FrontApplet from '@signageos/front-applet/es6/FrontApplet/FrontApplet';
import { IMasterStatusProvider } from './IMasterStatusProvider';

const debug = Debug('@signageos/smil-player:syncGroup');

export interface ISyncGroup {
	id: string;
	isMaster(): Promise<boolean>;
	broadcastValue(key: string, value: any): Promise<void>;
	onMasterChange(callback: (isMaster: boolean) => void): () => void;
	onStatus(callback: (peers: string[]) => void): () => void;
	onValue(callback: (args: { key: string, value?: any }) => void): () => void;
}

export class SyncGroup implements ISyncGroup, IMasterStatusProvider {
	public readonly id: string;

	private masterStatus: boolean | null = null;
	private emitter: EventEmitter = new EventEmitter();
	private lastValues: Map<string, any> = new Map<string, any>();
	private connectedPeers: string[] = [];

	constructor(
		private sos: FrontApplet,
		public readonly groupName: string,
		deviceId?: string,
	) {
		// Use provided deviceId or generate a unique one
		this.id = deviceId || `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		debug('Creating SyncGroup for %s with id %s', groupName, this.id);

		this.monitorStatus();
		this.monitorValues();
	}

	public async join() {
		debug('Joining sync group %s with id %s', this.groupName, this.id);

		await this.sos.sync.joinGroup({
			groupName: this.groupName,
			deviceIdentification: this.id,
		});
	}

	public async isMaster(): Promise<boolean> {
		if (this.masterStatus === null) {
			this.masterStatus = await this.sos.sync.isMaster(this.groupName);
			debug('Initial master status for %s: %s', this.groupName, this.masterStatus);
		}

		return this.masterStatus!;
	}

	public async broadcastValue(key: string, value?: any): Promise<void> {
		debug('Broadcasting to %s - key: %s, value: %O', this.groupName, key, value);
		await this.sos.sync.broadcastValue({ groupName: this.groupName, key, value });
	}

	public onMasterChange(callback: (isMaster: boolean) => void): () => void {
		this.emitter.on('master_changed', callback);
		return () => this.emitter.removeListener('master_changed', callback);
	}

	public onStatus(callback: (peers: string[]) => void): () => void {
		this.emitter.on('status', callback);
		return () => this.emitter.removeListener('status', callback);
	}

	public onValue(callback: (args: { key: string, value?: any }) => void): () => void {
		this.emitter.on('value', callback);
		return () => this.emitter.removeListener('value', callback);
	}

	public getConnectedPeersCount(): number {
		return this.connectedPeers.length;
	}

	public getLastValue(key: string): any {
		return this.lastValues.get(key);
	}

	public clearLastValue(key: string): void {
		this.lastValues.delete(key);
		debug('Cleared last value for key: %s', key);
	}

	// Build composite key for elementState storage
	public buildElementStateKey(regionName: string, syncIndex: number, state: string): string {
		return `elementState-${regionName}-${syncIndex}-${state}`;
	}

	// Get specific elementState by exact match
	public getElementState(regionName: string, syncIndex: number, state: string): any {
		const key = this.buildElementStateKey(regionName, syncIndex, state);
		return this.lastValues.get(key);
	}

	// Find any elementState for given region and syncIndex
	public findElementStateByIndex(regionName: string, syncIndex: number): any {
		// Check all possible states for this syncIndex
		const states = ['prepared', 'playing', 'finished'];
		for (const state of states) {
			const key = this.buildElementStateKey(regionName, syncIndex, state);
			const value = this.lastValues.get(key);
			if (value) {
				debug('Found elementState for region=%s, syncIndex=%d, state=%s', regionName, syncIndex, state);
				return value;
			}
		}
		return null;
	}

	// Clear specific elementState
	public clearElementState(regionName: string, syncIndex: number, state: string): void {
		const key = this.buildElementStateKey(regionName, syncIndex, state);
		this.lastValues.delete(key);
		debug('Cleared elementState: %s', key);
	}

	// Build composite key for sync-coordination storage
	public buildSyncCoordinationKey(type: string, regionName: string, syncIndex: number): string {
		return `sync-coord-${type}-${regionName}-${syncIndex}`;
	}

	// Get specific sync-coordination message by exact match
	public getSyncCoordinationMessage(type: string, regionName: string, syncIndex: number): any {
		const key = this.buildSyncCoordinationKey(type, regionName, syncIndex);
		return this.lastValues.get(key);
	}

	// Clear specific sync-coordination message
	public clearSyncCoordinationMessage(type: string, regionName: string, syncIndex: number): void {
		const key = this.buildSyncCoordinationKey(type, regionName, syncIndex);
		this.lastValues.delete(key);
		debug('Cleared sync-coordination: %s', key);
	}

	private monitorStatus() {
		this.sos.sync.onStatus(({ isMaster, groupName, connectedPeers }) => {
			if (groupName === this.groupName) {
				debug('Status update for %s - peers: %O', this.groupName, connectedPeers);
				this.connectedPeers = connectedPeers || [];
				this.emitter.emit('status', connectedPeers);

				if (this.masterStatus !== isMaster) {
					debug('Master status changed for %s: %s -> %s', this.groupName, this.masterStatus, isMaster);
					this.masterStatus = isMaster;
					this.emitter.emit('master_changed', isMaster);
				}
			}
		});
	}

	private monitorValues() {
		this.sos.sync.onValue(async (key, value, groupName) => {
			if (groupName === this.groupName) {
				debug('Received value for %s - key: %s, value: %O', this.groupName, key, value);

				// Handle sync-coordination messages for ACK protocol
				if (key === 'sync-coordination' && value) {
					// Build composite key for sync-coordination storage
					const coordKey = this.buildSyncCoordinationKey(value.type, value.regionName, value.syncIndex);

					// Check for duplicates
					const existing = this.lastValues.get(coordKey);
					if (existing &&
						existing.type === value.type &&
						existing.syncIndex === value.syncIndex &&
						existing.regionName === value.regionName &&
						Math.abs(value.timestamp - existing.timestamp) <= 200) { // Within 200ms
						debug('Duplicate sync-coordination detected, skipping');
						return;
					}

					// Store with composite key
					this.lastValues.set(coordKey, value);
					debug('Stored sync-coordination with key: %s', coordKey);

					// Emit immediately for ACK protocol handling
					this.emitter.emit('value', { key, value });
					return;
				}

				// Handle elementState with composite keys
				if (key === 'elementState' && value) {
					// Build composite key for state-specific storage
					const stateKey = this.buildElementStateKey(value.regionName, value.syncIndex, value.state);

					// Check for duplicates using composite key
					const existing = this.lastValues.get(stateKey);
					if (existing &&
						existing.state === value.state &&
						existing.syncIndex === value.syncIndex &&
						existing.regionName === value.regionName &&
						Math.abs(value.timestamp - existing.timestamp) <= 200) { // Within 200ms
						debug('Duplicate elementState detected (same values, timestamps within 200ms), skipping');
						return; // Don't store or emit duplicate
					}

					// Store with composite key to prevent overwrites
					this.lastValues.set(stateKey, value);
					debug('Stored elementState with key: %s', stateKey);
				} else {
					// Store other values as before
					this.lastValues.set(key, value);
				}

				// Emit to listeners
				this.emitter.emit('value', { key, value });
			}
		});
	}
}
