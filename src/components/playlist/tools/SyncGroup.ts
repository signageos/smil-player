import { EventEmitter } from 'events';
import Debug from 'debug';
import FrontApplet from '@signageos/front-applet/es6/FrontApplet/FrontApplet';
import { IMasterStatusProvider } from './IMasterStatusProvider';

const debug = Debug('@signageos/smil-player:syncGroup');

export interface ISyncGroup {
	id: string;
	isMaster(): Promise<boolean>;
	broadcastValue(key: string, value: any): Promise<void>;
	onMasterChange(callback: (isMaster: boolean) => void): void;
	onStatus(callback: (peers: string[]) => void): void;
	onValue(callback: (args: { key: string, value?: any }) => void): void;
}

export class SyncGroup implements ISyncGroup, IMasterStatusProvider {
	public readonly id: string;
	
	private masterStatus: boolean | null = null;
	private emitter: EventEmitter = new EventEmitter();
	
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
	
	public onMasterChange(callback: (isMaster: boolean) => void): void {
		this.emitter.on('master_changed', callback);
	}
	
	public onStatus(callback: (peers: string[]) => void): void {
		this.emitter.on('status', callback);
	}
	
	public onValue(callback: (args: { key: string, value?: any }) => void): void {
		this.emitter.on('value', callback);
	}
	
	private monitorStatus() {
		this.sos.sync.onStatus(({ isMaster, groupName, connectedPeers }) => {
			if (groupName === this.groupName) {
				debug('Status update for %s - peers: %O', this.groupName, connectedPeers);
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
				this.emitter.emit('value', { key, value });
			}
		});
	}
}