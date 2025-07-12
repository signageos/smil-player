import { Video } from "./video";

export enum VideoPlayerState {
	Idle = 'idle',
	Prepared = 'prepared',
	Playing = 'playing',
}

export function isValidState(state: unknown): state is VideoPlayerState {
	const states = Object.values(VideoPlayerState);
	return states.includes(state as VideoPlayerState);
}

export type State = {
	state: VideoPlayerState;
	data: unknown;
};

export type VideoPreparedData = {
	uid: string;
};

export type VideoPlayingData = {
	uid: string;
};

export function getNextState({ state, videos, playingVideoEnded }: {
	state: State;
	videos: Video[];
	playingVideoEnded: boolean;
}) {
	if (state.state === VideoPlayerState.Idle) {
		return {
			state: VideoPlayerState.Prepared,
			data: { uid: videos[0].uid } satisfies VideoPreparedData,
		};
	}

	if (state.state === VideoPlayerState.Prepared) {
		const preparedData = state.data as VideoPreparedData;
		return {
			state: VideoPlayerState.Playing,
			data: { uid: preparedData.uid } satisfies VideoPlayingData,
		};
	}

	if (state.state === VideoPlayerState.Playing) {
		if (!playingVideoEnded) {
			return state;
		}

		const playingData = state.data as VideoPlayingData;

		const currentVideoIndex = videos.findIndex((video) => video.uid === playingData.uid);
		if (currentVideoIndex === -1) {
			throw new Error(`Video with uid "${playingData.uid}" not found`);
		}

		const nextVideoIndex = currentVideoIndex + 1;
		const nextVideo = videos[nextVideoIndex];

		if (nextVideo) {
			return {
				state: VideoPlayerState.Playing,
				data: { uid: nextVideo.uid } satisfies VideoPreparedData,
			};
		}
	}

	return {
		state: VideoPlayerState.Idle,
		data: null,
	};
}