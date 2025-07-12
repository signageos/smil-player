import { EventEmitter } from 'events';
import Debug from 'debug';
import { VideoPlayerController } from "./Player/VideoPlayerController";
import { VideoPlayerState } from "./Player/videoPlayerStateMachine";
import { wait } from "./util";
import { IMasterStatusProvider } from './Sync/IMasterStatusProvider';

const debug = Debug('sagenet-poc:SyncGroupVideoPlayer');

function setMasterStyle(isMaster: boolean) {
	if (isMaster) {
		document.body.classList.add('master');
	} else {
		document.body.classList.remove('master');
	}
}

const DELAY_AFTER_FIRST_PREPARE = 2e3;

export class SyncGroupVideoPlayer {

	private playing: boolean = false;
	private finished: boolean = false;
	private emitter: EventEmitter = new EventEmitter();

	constructor(
		private masterStatusProvider: IMasterStatusProvider,
		private videoPlayerController: VideoPlayerController,
		private debugMode: boolean,
	) {
		this.monitorMasterChange();
		this.monitorStateChange();
	}

	public isPlaying() {
		// TODO probably delete this method
		return this.videoPlayerController.getState().state !== VideoPlayerState.Idle;
	}

	public isFinished() {
		return this.finished;
	}

	public async play() {
		if (this.playing && !this.finished) {
			return;
		}

		debug('play');
		this.playing = true;
		this.finished = false;

		this.videoPlayerController.start();

		if (await this.masterStatusProvider.isMaster()) {
			this.debugMode && setMasterStyle(true);
			this.playVideos();
		}
	}

	public async stop() {
		debug('stop');
		this.playing = false;
		await this.videoPlayerController.stop();
	}

	public onFinished(callback: () => void) {
		this.emitter.on('finished', callback);
	}

	private monitorMasterChange() {
		this.masterStatusProvider.onMasterChange(async (isMaster) => {
			if (!this.playing) {
				return;
			}

			debug('master change', isMaster);
			this.debugMode && setMasterStyle(isMaster);

			if (isMaster && !this.finished) {
				this.playVideos();
			}
		});
	}

	private monitorStateChange() {
		this.videoPlayerController.onStateChange((newState, previousState) => {
			if (newState.state === VideoPlayerState.Idle && previousState.state !== VideoPlayerState.Idle) {
				debug('finished');
				this.finished = true;
				this.emitter.emit('finished');
			}
		});
	}

	private async playVideos() {
		debug('play videos');

		const startingState = this.videoPlayerController.getState();

		// the only time it won't be idle is when the master changed mid-play
		let startedPlaying = startingState.state !== VideoPlayerState.Idle;

		while (await this.masterStatusProvider.isMaster()) {
			const state = this.videoPlayerController.getState();

			if (startedPlaying && state.state === VideoPlayerState.Idle) {
				// finished playing all videos
				break;
			}

			if (state.state === VideoPlayerState.Prepared) {
				// first prepare will happen a bit early and then give some time to everybody to prepare so the first play is in sync
				await wait(DELAY_AFTER_FIRST_PREPARE);
			}

			await this.videoPlayerController.doNext();
			startedPlaying = true;
		}

		debug('finished playing videos');
	}
}
