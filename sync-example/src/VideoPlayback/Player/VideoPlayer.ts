import Debug from 'debug';
import AsyncLock from 'async-lock';
import { Video } from "./video";

const debug = Debug('sagenet-poc:VideoPlayer');

export enum VideoState {
	Idle = 'idle',
	Prepared = 'prepared',
	Playing = 'playing',
}

export class VideoPlayer {

	private preparedVideo: Video | null = null;
	private playingVideo: Video | null = null;
	private endedVideo: Video | null = null;
	private state: VideoState = VideoState.Idle;
	private lock: AsyncLock = new AsyncLock();

	public getPreparedVideo() {
		return this.preparedVideo;
	}

	public getPlayingVideo() {
		return this.playingVideo || this.endedVideo;
	}

	public getState() {
		return this.state;
	}

	public async prepareVideo(video: Video) {
		await this.lock.acquire('', async () => {
			debug('prepare video', video.uid);

			// do nothing if the video is already prepared
			if (this.preparedVideo === video) {
				return;
			}

			// if there's another prepared video already, stop it and replace it
			if (this.preparedVideo) {
				await this.preparedVideo.stop();
			}

			await video.prepare();
			this.preparedVideo = video;
			this.state = VideoState.Prepared;
		});
	}

	public async playVideo(video: Video) {
		await this.lock.acquire('', async () => {
			debug('play video', video.uid);

			let unfinishedVideo: Video | null = null;

			if (this.preparedVideo !== video) {
				// if the video isn't prepared, ignore it because it wouldn't play in sync
				return;
			}

			if (this.playingVideo) {
				if (this.playingVideo === video) {
					// idempotent for the same video, i.e. do nothing on repeated play
					return;
				} else {
					// got play before the previous video ended, need to pause it and then stop it after the new video starts
					await this.playingVideo.pause();
					unfinishedVideo = this.playingVideo;
				}
			}

			await video.play();
			this.playingVideo = video;

			if (unfinishedVideo) {
				await unfinishedVideo.stop();
			}

			if (this.endedVideo) {
				await this.endedVideo.stop();
				this.endedVideo = null;
			}

			video.onceEnded().then(() => {
				debug('video ended', video.uid);
				this.endedVideo = video;
				this.playingVideo = null;
			});

			if (video === this.preparedVideo) {
				this.preparedVideo = null;
			}

			this.state = VideoState.Playing;
		});
	}

	public async stop() {
		await this.lock.acquire('', async () => {
			debug('stop');

			if (this.playingVideo) {
				debug('stop playing video');
				await this.playingVideo.stop();
				this.playingVideo = null;
			}

			if (this.endedVideo) {
				debug('stop ended video');
				await this.endedVideo.stop();
				this.endedVideo = null;
			}

			if (this.preparedVideo) {
				debug('stop prepared video');
				await this.preparedVideo.stop();
				this.preparedVideo = null;
			}

			this.state = VideoState.Idle;
		});
	}
}
