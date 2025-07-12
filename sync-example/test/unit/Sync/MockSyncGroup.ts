import { EventEmitter } from 'events';
import { ISyncGroup } from '../../../src/VideoPlayback/Sync/SyncGroup';
import { generateRandomString } from '../../../src/VideoPlayback/util';

export class MockSyncGroup implements ISyncGroup {

	public readonly id: string;

	private masterStatus: boolean = true;
	private emitter: EventEmitter = new EventEmitter();

	constructor() {
		this.id = generateRandomString(10);
	}

	public async isMaster(): Promise<boolean> {
		return this.masterStatus;
	}

	public setMaster(isMaster: boolean) {
		this.masterStatus = isMaster;
	}

	public async broadcastValue(key: string, value: any): Promise<void> {
		this.emitter.emit('broadcast_value', { key, value });
	}

	public onBroadcastValue(callback: (args: { key: string; value: any }) => void): void {
		this.emitter.on('broadcast_value', callback);
	}

	public onMasterChange(callback: (isMaster: boolean) => void): void {
		this.emitter.on('master_changed', callback);
	}

	public onStatus(callback: (peers: string[]) => void): void {
		this.emitter.on('status', callback);
	}

	public onValue(callback: (args: { key: string; value?: any; }) => void): void {
		this.emitter.on('value', callback);
	}

	public emitMasterChange(isMaster: boolean) {
		this.emitter.emit('master_changed', isMaster);
	}

	public emitStatus(peers: string[]) {
		this.emitter.emit('status', peers);
	}

	public emitValue({ key, value }: { key: string; value: any }) {
		this.emitter.emit('value', { key, value });
	}
}