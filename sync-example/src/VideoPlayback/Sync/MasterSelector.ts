import { EventEmitter } from 'events';
import Debug from 'debug';
import { ISyncGroup } from "./SyncGroup";
import { IMasterStatusProvider } from './IMasterStatusProvider';

const debug = Debug('sagenet-poc:MasterSelector');

type Peer = {
	id: string;
	joinedAt: number;
	hasPriority: boolean;
}

export class MasterSelector implements IMasterStatusProvider {

	private me: Peer;
	private peers: Map<string, Peer> = new Map();
	private master: Peer;

	private emitter: EventEmitter = new EventEmitter();

	constructor(private syncGroup: ISyncGroup, hasPriority: boolean) {
		this.me = {
			id: syncGroup.id,
			joinedAt: Date.now(),
			hasPriority,
		};

		this.master = this.me;
		debug('became master');
		this.listenToPeers();
	}

	public async isMaster() {
		return this.master.id === this.me.id;
	}

	public onMasterChange(callback: (isMaster: boolean) => void) {
		this.emitter.on('master_changed', callback);
	}

	public async start() {
		await this.advertiseToTheSyncGroup();

		let i = 0;
		setInterval(() => {
			// when there are no peers, advertise myself more often
			if (this.peers.size === 0 || i++ % 30 > 0) {
				this.advertiseToTheSyncGroup();
			}
		}, 1e3);
	}

	private async advertiseToTheSyncGroup() {
		// debug('announce myself', this.me);
		await this.syncGroup.broadcastValue('announce', this.me);
	}

	private listenToPeers() {
		this.syncGroup.onValue(async ({ key, value }) => {
			if (key === 'announce') {
				await this.onAnnounce(value);
			}
		});

		this.syncGroup.onStatus((peers) => this.onStatus(peers));
	}

	private async onAnnounce(peer: Peer) {
		if (peer.id === this.me.id) {
			return;
		}

		// debug('peer announced', peer);

		if (!this.peers.has(peer.id)) {
			// if I haven't seen this peer before, I should advertise myself to them
			await this.advertiseToTheSyncGroup();
		}

		this.peers.set(peer.id, peer);

		this.peersChanged();
	}

	private async onStatus(peerIds: string[]) {
		const deadPeers: Peer[] = [];
		let gotNewPeers = false;

		for (const peerId of this.peers.keys()) {
			if (peerId === this.me.id) {
				continue;
			} else if (!peerIds.includes(peerId)) {
				// exclude any peers that are no longer reported in the group
				deadPeers.push(this.peers.get(peerId)!);
				this.peers.delete(peerId);
			} else if (!this.peers.has(peerId)) {
				gotNewPeers = true;
			}
		}

		if (deadPeers.length > 0) {
			debug('dropped dead peers', deadPeers);
		}

		if (gotNewPeers) {
			// if I got new peers, I should advertise myself to them
			await this.advertiseToTheSyncGroup();
		}

		this.peersChanged();
	}

	private peersChanged() {
		// debug('peers', Array.from(this.peers.values()));
		this.selectMaster();
	}

	private selectMaster() {
		const peers = Array.from(this.peers.values());
		peers.push(this.me);

		peers.sort((a, b) => {
			if (a.hasPriority !== b.hasPriority) {
				return a.hasPriority ? -1 : 1;
			}

			return a.joinedAt - b.joinedAt;
		});

		const oldMaster = this.master;
		this.master = peers[0];

		if (oldMaster.id !== this.master.id) {
			const amIMaster = this.master.id === this.me.id;

			if (oldMaster.id === this.me.id || this.master.id === this.me.id) {
				debug(amIMaster ? 'became master' : 'became slave');
			}

			this.emitter.emit('master_changed', amIMaster);
		}
	}
}
