import { EventEmitter } from 'events';
import Debug from 'debug';
import { SyncGroup } from "../Sync/SyncGroup";
import { VideoPlayer } from "./VideoPlayer";
import { Video } from './video';
import { getNextState, isValidState, State, VideoPlayerState, VideoPlayingData, VideoPreparedData } from './videoPlayerStateMachine';
import { wait } from '../util';

export class VideoPlayerController {

	private state: State = { state: VideoPlayerState.Idle, data: null };
	private currentPlayingVideo: { endedTimestamp?: number } | null = null;
	private debug: Debug;

	private active: boolean = false;
	private broadcastInterval: NodeJS.Timeout | null = null;
	
	private emitter: EventEmitter = new EventEmitter();

	constructor(
		private videos: Video[],
		private videoPlayer: VideoPlayer,
		private syncGroup: SyncGroup,
		private isMaster: () => Promise<boolean>,
	) {
		this.debug = Debug(`sagenet-poc:VideoPlayerController:${syncGroup.groupName}`);
		this.monitorStateChanges();
	}

	public start() {
		if (!this.broadcastInterval) {
			this.broadcastInterval = setInterval(() => this.broadcastCurrentState(), 5000);
		}

		this.active = true;
	}

	public async stop() {
		this.active = false;

		if (this.broadcastInterval) {
			clearInterval(this.broadcastInterval);
			this.broadcastInterval = null;
		}

		await this.changeState({ state: VideoPlayerState.Idle, data: null });
	}

	public getState() {
		return this.state;
	}

	public onStateChange(callback: (newState: State, previousState: State) => void) {
		this.emitter.on('state_change', callback);
	}

	public async doNext() {
		const playingVideoEnded = await this.waitForPlayingVideoEnded();
		const nextState = getNextState({ state: this.state, videos: this.videos, playingVideoEnded });

		if (nextState !== this.state) {
			await this.changeState(nextState);
		}
	}

	private async broadcastCurrentState() {
		if (await this.isMaster()) {
			this.debug('broadcasting state', this.state);
			await this.syncGroup.broadcastValue('state', this.state);
		}
	}

	private monitorStateChanges() {
		this.syncGroup.onValue(async ({ key, value }) => {
			if (key === 'state' && this.active) {
				const isMaster = await this.isMaster();
				const isNewState = JSON.stringify(value) !== JSON.stringify(this.state);

				if (!isMaster && isNewState) {
					await this.changeState(value);
				}
			}
		});
	}

	private async changeState(state: State) {
		this.debug('new state', state.state);

		if (!isValidState(state.state)) {
			throw new Error('Invalid state: ' + state.state);
		}

		const previousState = this.state;
		this.state = state;
		await this.broadcastCurrentState();
		this.emitter.emit('state_change', state, previousState);

		switch (state.state) {
			case VideoPlayerState.Idle: {
				await this.videoPlayer.stop();
				this.currentPlayingVideo = null;
				break;
			}

			case VideoPlayerState.Prepared: {
				const { uid } = state.data as VideoPreparedData;

				const video = this.videos.find((video) => video.uid === uid);
				if (!video) {
					throw new Error(`Video with uid "${uid}" not found`);
				}

				await this.videoPlayer.prepareVideo(video);

				this.currentPlayingVideo = null;
				break;
			}

			case VideoPlayerState.Playing: {
				const { uid } = state.data as VideoPlayingData;

				const videoIndex = this.videos.findIndex((video) => video.uid === uid);
				if (videoIndex === -1) {
					throw new Error(`Video with uid "${uid}" not found`);
				}

				const video = this.videos[videoIndex];
				const durationMs = await video.getDuration();
				await this.videoPlayer.playVideo(video);
				this.currentPlayingVideo = durationMs > 0 ? { endedTimestamp: Date.now() + durationMs } : {};

				const nextVideoIndex = videoIndex + 1;
				const nextVideo = this.videos[nextVideoIndex];
				if (nextVideo) {
					await this.videoPlayer.prepareVideo(nextVideo);
				}

				break;
			}
		}
	}

	/**
	 * Tries to wait for the current playing video to end but only for a short time.
	 * 
	 * If the video doesn't end in time, it will be interrupted.
	 * This is based on the idea, that the video playback is driven by a state machine
	 * that needs to keep evaluating its state and react to changes.
	 * 
	 * @returns true if the video ended, false if it was interrupted
	 */
	private async waitForPlayingVideoEnded(): Promise<boolean> {
		if (this.state.state === VideoPlayerState.Playing) {
			const { uid } = this.state.data as VideoPlayingData;

			const video = this.videos.find((video) => video.uid === uid);
			if (!video) {
				throw new Error(`Video with uid "${uid}" not found but it should be playing`);
			}

			const promises: Promise<boolean>[] = [];

			const interruptedPromise = wait(100).then(() => false);
			promises.push(interruptedPromise);

			const videoEndedPromise = video.onceEnded().then(() => true);
			promises.push(videoEndedPromise);

			const endedTimestamp = this.currentPlayingVideo?.endedTimestamp;

			if (endedTimestamp) {
				// in case something goes wrong and the video doesn't end as expected,
				// this ensures that it will timeout shortly after the expected end time
				const safetyMargin = 10; // allow for proper ended event to be fired
				const remainingTime = Math.max(0, endedTimestamp - Date.now()) + safetyMargin;
				const timeoutPromise = wait(remainingTime).then(() => true);
				promises.push(timeoutPromise);
			}

			return await Promise.race(promises);
		}
	}
}
