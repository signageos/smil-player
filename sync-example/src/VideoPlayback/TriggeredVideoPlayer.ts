import Debug from 'debug';
import { SyncGroup } from "./Sync/SyncGroup";
import { SyncGroupVideoPlayer } from "./SyncGroupVideoPlayer";

const debug = Debug('sagenet-poc:TriggeredVideoPlayer');

export class TriggeredVideoPlayer {
	private playingTriggeredContent: boolean = false;

	private onBeforeStartedCallbacks: (() => Promise<void>)[] = [];
	private onAfterFinishedCallbacks: (() => Promise<void>)[] = [];

	constructor(
		private triggeredVideoPlayer: SyncGroupVideoPlayer,
		private triggeredSyncGroup: SyncGroup,
	) {
		this.listenToTrigger();
		this.listenToTriggeredContentFinished();
		this.monitorState();
		this.monitorMasterChange();
		this.periodicallyBroadcastState();
	}

	public async triggerContent() {
		if (this.playingTriggeredContent) {
			return;
		}

		debug('trigger content');

		if (await this.triggeredSyncGroup.isMaster()) {
			debug('I am master, playing triggered content now');
			await this.playTriggeredContent();
		} else {
			debug('I am not master, broadcasting trigger');
			await this.triggeredSyncGroup.broadcastValue('triggered.start');
		}
	}

	public onBeforeStarted(callback: () => Promise<void>) {
		this.onBeforeStartedCallbacks.push(callback);
	}

	public onAfterFinished(callback: () => Promise<void>) {
		this.onAfterFinishedCallbacks.push(callback);
	}

	private listenToTrigger() {
		this.triggeredSyncGroup.onValue(async ({ key }) => {
			if (key === 'triggered.start' && await this.triggeredSyncGroup.isMaster()) {
				debug('trigger received, playing content');
				await this.playTriggeredContent();
			}
		});
	}

	private listenToTriggeredContentFinished() {
		this.triggeredVideoPlayer.onFinished(async () => {
			if (await this.triggeredSyncGroup.isMaster()) {
				debug('content finished, stopping');
				await this.stopTriggeredContent();
			}
		});
	}

	private monitorState() {
		this.triggeredSyncGroup.onValue(async ({ key, value }) => {
			if (key === 'triggered.state' && value !== this.playingTriggeredContent) {
				if (value) {
					debug('received state change, playing content');
					await this.playTriggeredContent();
				} else {
					debug('received state change, stopping content');
					await this.stopTriggeredContent();
				}
			}
		});
	}

	private monitorMasterChange() {
		this.triggeredSyncGroup.onMasterChange(async (isMaster) => {
			if (isMaster && this.playingTriggeredContent && this.triggeredVideoPlayer.isFinished()) {
				debug('master change, content finished, stopping');
				await this.stopTriggeredContent();
			}
		});
	}

	private periodicallyBroadcastState() {
		setInterval(() => this.broadcastState(), 1e3);
	}

	private async broadcastState() {
		if (await this.triggeredSyncGroup.isMaster()) {
			this.triggeredSyncGroup.broadcastValue('triggered.state', this.playingTriggeredContent);
		}
	}

	private async playTriggeredContent() {
		if (!this.playingTriggeredContent) {
			debug('play triggered content');
			this.playingTriggeredContent = true;
			await this.broadcastState();

			for (const callback of this.onBeforeStartedCallbacks) {
				await callback();
			}

			await this.triggeredVideoPlayer.play();
		}
	}

	private async stopTriggeredContent() {
		if (this.playingTriggeredContent) {
			debug('stop triggered content');
			this.playingTriggeredContent = false;
			await this.broadcastState();
			await this.triggeredVideoPlayer.stop();

			for (const callback of this.onAfterFinishedCallbacks) {
				await callback();
			}
		}
	}
}