import { EventEmitter } from 'events';
import Debug from 'debug';
import { ISos } from '../../../models/sosModels';
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
		private sos: ISos,
		public readonly groupName: string,
		deviceId?: string,
	) {
		// Use provided deviceId or generate a unique one
		this.id = deviceId || `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		debug('[syncGroup] creating: group=%s, id=%s', groupName, this.id);

		this.monitorStatus();
		this.monitorValues();
	}

	public async join() {
		debug('[syncGroup] joining: group=%s, id=%s', this.groupName, this.id);

		await this.sos.sync.joinGroup({
			groupName: this.groupName,
			deviceIdentification: this.id,
		});
	}

	public async isMaster(): Promise<boolean> {
		if (this.masterStatus === null) {
			this.masterStatus = await this.sos.sync.isMaster(this.groupName);
			debug('[syncGroup] initial master status: group=%s, isMaster=%s', this.groupName, this.masterStatus);
		}

		return this.masterStatus!;
	}

	public async broadcastValue(key: string, value?: any): Promise<void> {
		debug('[syncGroup] broadcasting: group=%s, key=%s', this.groupName, key);
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
		debug('[syncGroup] cleared value: group=%s, key=%s', this.groupName, key);
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
				debug('[syncGroup] found elementState: group=%s, region=%s, syncIndex=%d, state=%s', this.groupName, regionName, syncIndex, state);
				return value;
			}
		}
		return null;
	}

	// Clear specific elementState
	public clearElementState(regionName: string, syncIndex: number, state: string): void {
		const key = this.buildElementStateKey(regionName, syncIndex, state);
		this.lastValues.delete(key);
		debug('[syncGroup] cleared elementState: group=%s, key=%s', this.groupName, key);
	}

	// Build composite key for sync-coordination storage
	// Only uses type and regionName to store the latest message per type/region
	public buildSyncCoordinationKey(type: string, regionName: string): string {
		return `sync-coord-${type}-${regionName}`;
	}

	// Get latest sync-coordination message for a type/region combination
	public getSyncCoordinationMessage(type: string, regionName: string): any {
		const key = this.buildSyncCoordinationKey(type, regionName);
		return this.lastValues.get(key);
	}

	// Clear sync-coordination message for a type/region combination
	public clearSyncCoordinationMessage(type: string, regionName: string): void {
		const key = this.buildSyncCoordinationKey(type, regionName);
		this.lastValues.delete(key);
		debug('[syncGroup] cleared sync-coordination: group=%s, key=%s', this.groupName, key);
	}

	private monitorStatus() {
		this.sos.sync.onStatus(({ isMaster, groupName, connectedPeers }) => {
			if (groupName === this.groupName) {
				debug('[syncGroup] status update: group=%s, peerCount=%d', this.groupName, (connectedPeers || []).length);
				this.connectedPeers = connectedPeers || [];
				this.emitter.emit('status', connectedPeers);

				if (this.masterStatus !== isMaster) {
					debug('[syncGroup] master status changed: group=%s, %s -> %s', this.groupName, this.masterStatus, isMaster);
					this.masterStatus = isMaster;
					this.emitter.emit('master_changed', isMaster);
				}
			}
		});
	}

	private monitorValues() {
		this.sos.sync.onValue(async (key, value, groupName) => {
			if (groupName === this.groupName) {
				// Handle sync-coordination messages for ACK protocol
				if (key === 'sync-coordination' && value) {
					// Extract action from type (e.g., 'cmd-prepare' -> 'prepare', 'ack-playing' -> 'playing')
					const action = value.type.replace('cmd-', '').replace('ack-', '').replace('signal-', '');
					const messageCategory = value.type.startsWith('cmd-') ? 'COMMAND' : 
					                       value.type.startsWith('ack-') ? 'ACK' : 
					                       value.type.startsWith('signal-') ? 'SIGNAL' : 'OTHER';
					
					debug('[syncGroup] received %s: group=%s, type=%s, action=%s, syncIndex=%d, region=%s',
						messageCategory, this.groupName, value.type, action, value.syncIndex, value.regionName);
					
					// Build composite key for sync-coordination storage (type + region only)
					const coordKey = this.buildSyncCoordinationKey(value.type, value.regionName);

					// No need to check for duplicates anymore - we want the latest message
					// Store with composite key - this will overwrite any previous message of same type/region
					this.lastValues.set(coordKey, value);
					debug('[syncGroup] stored sync-coordination: group=%s, key=%s, type=%s, syncIndex=%d, region=%s',
						this.groupName, coordKey, value.type, value.syncIndex, value.regionName);

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
						debug('[syncGroup] duplicate elementState, skipping: group=%s, state=%s, syncIndex=%d, region=%s',
							this.groupName, value.state, value.syncIndex, value.regionName);
						return; // Don't store or emit duplicate
					}

					// Store with composite key to prevent overwrites
					this.lastValues.set(stateKey, value);
					debug('[syncGroup] stored elementState: group=%s, key=%s, state=%s, syncIndex=%d, region=%s',
						this.groupName, stateKey, value.state, value.syncIndex, value.regionName);
				} else {
					// Store other values as before
					debug('[syncGroup] received value: group=%s, key=%s', this.groupName, key);
					this.lastValues.set(key, value);
				}

				// Emit to listeners
				this.emitter.emit('value', { key, value });
			}
		});
	}
}
