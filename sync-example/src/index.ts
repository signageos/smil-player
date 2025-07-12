require('./index.css');

import sos from '@signageos/front-applet';
import { getConfig } from './config';
import { start, VideoPlaybackAPI } from './VideoPlayback';
import { toggleVideoPlayback } from './playbackControl';

const contentElement = document.getElementById("status");
// const websiteIframe = document.getElementById("website") as HTMLIFrameElement;
const timeoutElement = document.getElementById("timeout");
const playButton = document.getElementById("play-other-video") as HTMLButtonElement;

function setStatus(status: string) {
	console.info(`Status: ${status}`);
	contentElement.innerHTML = status;
}

// Wait on sos data are ready (https://docs.signageos.io/api/js/content/latest/js-applet-basics#onready)
sos.onReady().then(async () => {
	try {
		const config = getConfig();

		// websiteIframe.src = config.webpageUrl;
		// websiteIframe.style.visibility = 'visible';

		if (config.triggeredVideo) {
			document.body.classList.add('triggered');
		}

		const videoPlayback = await start({
			syncEngine: config.syncEngine,
			periodicVideo: {
				...config.periodicVideo,
				onTimeoutReset,
			},
			triggeredVideo: config.triggeredVideo,
			debugMode: config.debugMode,
		});

		await videoPlayback.startPeriodicVideo();

		(window as any).toggleVideoPlayback = () => toggleVideoPlayback(videoPlayback);

		if (config.triggeredVideo) {
			playButton.style.visibility = 'visible';
			playButton.addEventListener('click', () => onPlayButtonClick(videoPlayback));
		}
	} catch (error) {
		setStatus(`Error: ${error.message}`);
	}
});

function onTimeoutReset(timeout: number) {
	let leftSeconds = timeout / 1000;

	const updateTimeout = () => {
		if (leftSeconds > 0) {
			timeoutElement.innerHTML = `${leftSeconds} sec until next video`;
		} else {
			timeoutElement.innerHTML = '';
		}
	}

	updateTimeout();

	const interval = setInterval(() => {
		leftSeconds--;
		updateTimeout();

		if (leftSeconds <= 0) {
			clearInterval(interval);
		}
	}, 1000);
}

async function onPlayButtonClick(videoPlayback: VideoPlaybackAPI) {
	playButton.disabled = true;

	try {
		await videoPlayback.playTriggeredVideo();
	} finally {
		playButton.disabled = false;
	}
}
