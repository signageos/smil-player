import Debug from 'debug';
import { SyncGroupVideoPlayer } from "./SyncGroupVideoPlayer";
import { IMasterStatusProvider } from "./Sync/IMasterStatusProvider";
import { SyncGroup } from './Sync/SyncGroup';

const debug = Debug('sagenet-poc:PeriodicVideoPlayer');

enum State {
	Inactive = 'inactive',
	Playing = 'playing',
	Waiting = 'waiting',
}

export class PeriodicVideoPlayer {

	private active: boolean = false;
	private state: State = State.Inactive;
	private nextTimeout: NodeJS.Timeout | null = null;

	constructor(
		private player: SyncGroupVideoPlayer,
		private masterStatusProvider: IMasterStatusProvider,
		private syncGroup: SyncGroup,
		private periodMs: number,
		private onTimeoutReset?: (timeout: number) => void,
	) {
		this.monitorMasterChange();
		this.resetTimeoutOnPlayerFinished();
		this.periodicallyBroadcastState();
		this.listenToStateChanges();
	}

	public async start() {
		if (!this.active) {
			debug('start');
			this.active = true;

			if (await this.masterStatusProvider.isMaster()) {
				debug('started as master, changing to waiting');
				await this.changeState(State.Waiting);
			}
		}
	}

	public async stop() {
		if (this.active) {
			debug('stop');
			this.active = false;

			if (await this.masterStatusProvider.isMaster()) {
				debug('stopped as master, changing to inactive');
				await this.changeState(State.Inactive);
			}
		}
	}

	private periodicallyBroadcastState() {
		setInterval(() => this.broadcastState(), 1e3);
	}

	private async broadcastState() {
		if (await this.masterStatusProvider.isMaster()) {
			this.syncGroup.broadcastValue('periodicVideo.state', this.state);
		}
	}

	private listenToStateChanges() {
		this.syncGroup.onValue(async ({ key, value }) => {
			if (key === 'periodicVideo.state' && this.active && !await this.masterStatusProvider.isMaster()) {
				await this.changeState(value);
			}
		});
	}

	private monitorMasterChange() {
		this.masterStatusProvider.onMasterChange(async (isMaster) => {
			debug(isMaster ? 'became master' : 'became slave');

			switch (this.state) {
				case State.Inactive:
					if (isMaster && this.active) {
						debug('became active master but inactive, changing to playing');
						await this.changeState(State.Playing);
					}
					break;

				case State.Playing:
					if (isMaster) {
						if (!this.active) {
							debug('became master but not active, changing to inactive');
							await this.changeState(State.Inactive);
						} else if (this.player.isFinished()) {
							debug('became master and player finished, changing to waiting');
							await this.changeState(State.Waiting);
						}
					}
					break;

				case State.Waiting:
					if (isMaster) {
						debug('became master and waiting, start timeout');
						await this.playVideosAfterTimeout();
					} else {
						debug('became slave and waiting, clear timeout');
						this.clearNextTimeout();
					}
					break;
			}
		});
	}

	private resetTimeoutOnPlayerFinished() {
		this.player.onFinished(async () => {
			debug('player finished');

			if (await this.masterStatusProvider.isMaster()) {
				debug('player finished as master, changing to waiting');
				await this.changeState(State.Waiting);
			}
		});
	}

	private async playVideosAfterTimeout() {
		if (this.nextTimeout === null) {
			// start next period slightly earlier to give time for the first prepare
			const DELAY_AFTER_FIRST_PREPARE = 2e3;
			const timeout = this.periodMs - DELAY_AFTER_FIRST_PREPARE;

			debug('set next timeout', timeout);
			this.nextTimeout = setTimeout(
				async () => {
					this.nextTimeout = null;
					debug('timeout reached, changing to playing');
					await this.changeState(State.Playing);
				},
				timeout,
			);

			this.onTimeoutReset && this.onTimeoutReset(this.periodMs);
		}
	}

	private async changeState(newState: State) {
		const previousState = this.state;
		if (previousState === newState) {
			return;
		}

		debug('new state', newState);
		this.state = newState;
		await this.broadcastState();

		switch (newState) {
			case State.Inactive:
				this.clearNextTimeout();
				await this.player.stop();
				break;

			case State.Playing:
				await this.player.play();
				break;

			case State.Waiting:
				await this.player.stop();

				if (await this.masterStatusProvider.isMaster()) {
					await this.playVideosAfterTimeout();
				}
				break;
		}
	}

	private clearNextTimeout() {
		if (this.nextTimeout) {
			debug('clearing next timeout');
			clearTimeout(this.nextTimeout);
			this.nextTimeout = null;
		}
	}
}