import { VideoPlaybackAPI } from "./VideoPlayback";

let playingVideo = true;
let pendingToggle = false;

export async function toggleVideoPlayback(videoPlayer: VideoPlaybackAPI) {
	if (pendingToggle) {
		return;
	}

	pendingToggle = true;

	try {
		if (playingVideo) {
			console.info('Stopping playback');
			videoPlayer.stopPeriodicVideo();
			playingVideo = false;
		} else {
			console.info('Starting playback');
			videoPlayer.startPeriodicVideo();
			playingVideo = true;
		}
	} finally {
		pendingToggle = false;
	}
}