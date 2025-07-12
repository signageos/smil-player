import { EventEmitter } from 'events';
import Debug from 'debug';
import sos from "@signageos/front-applet";
import { generateRandomString } from '../util';
import { IMasterStatusProvider } from './IMasterStatusProvider';

export interface ISyncGroup {
	id: string;

	isMaster(): Promise<boolean>;
	broadcastValue(key: string, value: any): Promise<void>;
	onMasterChange(callback: (isMaster: boolean) => void): void;
	onStatus(callback: (peers: string[]) => void): void;
	onValue(callback: (args: { key: string, value?: any }) => void): void;
}

export class SyncGroup implements ISyncGroup, IMasterStatusProvider {

	public readonly id: string = generateRandomString(10);

	private masterStatus: boolean | null = null;
	private emitter: EventEmitter = new EventEmitter();
	private debug: Debug;

	constructor(
		public readonly groupName: string,
	) {
		this.debug = Debug(`sagenet-poc:SyncGroup:${groupName}`);

		this.monitorStatus();
		this.monitorValues();
	}

	public async join() {
		this.debug('join', this.id);

		await sos.sync.joinGroup({
			groupName: this.groupName,
			deviceIdentification: this.id,
		});
	}

	public async isMaster() {
		if (this.masterStatus === null) {
			this.masterStatus = await sos.sync.isMaster(this.groupName);
		}

		return this.masterStatus!;
	}

	public async broadcastValue(key: string, value?: any) {
		this.debug('broadcast value', { key, value });
		await sos.sync.broadcastValue({ groupName: this.groupName, key, value });
	}

	public onMasterChange(callback: (isMaster: boolean) => void) {
		this.emitter.on('master_changed', callback);
	}

	public onStatus(callback: (peers: string[]) => void) {
		this.emitter.on('status', callback);
	}

	public onValue(callback: (args: { key: string, value?: any }) => void) {
		this.emitter.on('value', callback);
	}

	private monitorStatus() {
		sos.sync.onStatus(({ isMaster, groupName, connectedPeers }) => {
			if (groupName === this.groupName) {
				this.debug('status', { connectedPeers });
				this.emitter.emit('status', connectedPeers);

				if (this.masterStatus !== isMaster) {
					this.debug(`became ${isMaster ? 'master' : 'slave'}`);

					this.masterStatus = isMaster;
					this.emitter.emit('master_changed', isMaster);
				}
			}
		});
	}

	private monitorValues() {
		sos.sync.onValue(async (key, value, groupName) => {
			if (groupName === this.groupName) {
				this.debug('value', value);
				this.emitter.emit('value', { key, value });
			}
		});
	}
}
