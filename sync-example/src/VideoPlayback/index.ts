import Debug from 'debug';
import sos from '@signageos/front-applet';
import { SyncEngine } from '@signageos/front-applet/es6/FrontApplet/Sync/Sync';
import { loadVideos } from './Player/video';
import { SyncGroup } from './Sync/SyncGroup';
import { VideoPlayer } from './Player/VideoPlayer';
import { VideoPlayerController } from './Player/VideoPlayerController';
import { wait } from './util';
import { SyncGroupVideoPlayer } from './SyncGroupVideoPlayer';
import { MasterSelector } from './Sync/MasterSelector';
import { PeriodicVideoPlayer } from './PeriodicVideoPlayer';
import { TriggeredVideoPlayer } from './TriggeredVideoPlayer';

const debug = Debug('sagenet-poc:VideoPlayback');

export type PeriodicVideoConfig = {
	groupName: string;
	videoUrls: string[];
	periodMs: number;

	/** for debug */
	onTimeoutReset?: (timeout: number) => void;
};

export type TriggeredVideoConfig = {
	groupName: string;
	videoUrls: string[];
};

export interface VideoPlaybackAPI {
	startPeriodicVideo: () => Promise<void>;
	stopPeriodicVideo: () => Promise<void>;
	playTriggeredVideo: () => Promise<void>;
}

export async function start({
	syncEngine,
	periodicVideo: periodicVideoArgs,
	triggeredVideo: triggeredVideoArgs,
	debugMode,
}: {
	syncEngine?: SyncEngine;

	periodicVideo: PeriodicVideoConfig;
	triggeredVideo?: TriggeredVideoConfig;

	/** if true, will display videos with a border couple of pixels wide */
	debugMode?: boolean;
}) {
	await sos.sync.connect({ engine: syncEngine });

	const periodicVideo = await createPeriodicVideo({
		...periodicVideoArgs,
		hasPriorityForMasterSelection: !triggeredVideoArgs,
		debugMode,
	});

	let triggeredVideo: Awaited<ReturnType<typeof createTriggeredVideo>> | null = null;
	if (triggeredVideoArgs) {
		triggeredVideo = await createTriggeredVideo(triggeredVideoArgs, debugMode);

		// link video players
		triggeredVideo.player.onBeforeStarted(() => periodicVideo.player.stop());
		triggeredVideo.player.onAfterFinished(() => periodicVideo.player.start());
	}

	await Promise.all([periodicVideo.init(), triggeredVideo?.init()]);

	await wait(5e3); // allow time for master selection

	return {
		startPeriodicVideo: () => periodicVideo.player.start(),
		stopPeriodicVideo: () => periodicVideo.player.stop(),

		playTriggeredVideo: async () => {
			if (!triggeredVideo) {
				throw new Error('Triggered video playback is not configured');
			}

			await triggeredVideo.player.triggerContent();
		},
	};
}

async function createPeriodicVideo({
	groupName,
	periodMs,
	videoUrls,
	onTimeoutReset,
	hasPriorityForMasterSelection,
	debugMode,
}: PeriodicVideoConfig & {
	hasPriorityForMasterSelection: boolean;
	debugMode?: boolean;
}) {
	const videoList = await loadVideos(videoUrls, '-periodic', debugMode);

	const syncGroup = new SyncGroup(groupName);
	const masterSelector = new MasterSelector(syncGroup, hasPriorityForMasterSelection);
	const isMaster = () => masterSelector.isMaster();
	const videoPlayer = new VideoPlayer();
	const controller = new VideoPlayerController(videoList, videoPlayer, syncGroup, isMaster);
	const syncGroupVideoPlayer = new SyncGroupVideoPlayer(masterSelector, controller, debugMode);
	const periodicVideoPlayer = new PeriodicVideoPlayer(
		syncGroupVideoPlayer,
		masterSelector,
		syncGroup,
		periodMs,
		onTimeoutReset,
	);

	return {
		player: periodicVideoPlayer,

		async init() {
			debug('init periodic video');
			controller.start();
			await syncGroup.join();
			await masterSelector.start();
		},
	};
}

async function createTriggeredVideo({ groupName, videoUrls }: TriggeredVideoConfig, debugMode?: boolean) {
	const videoList = await loadVideos(videoUrls, '-triggered', debugMode);

	const syncGroup = new SyncGroup(groupName);
	const isMaster = () => syncGroup.isMaster();
	const videoPlayer = new VideoPlayer();
	const controller = new VideoPlayerController(videoList, videoPlayer, syncGroup, isMaster);
	const syncGroupVideoPlayer = new SyncGroupVideoPlayer(syncGroup, controller, debugMode);
	const triggeredVideoPlayer = new TriggeredVideoPlayer(syncGroupVideoPlayer, syncGroup);

	return {
		player: triggeredVideoPlayer,

		async init() {
			debug('init triggered video');
			controller.start();
			await syncGroup.join();
		},
	};
}
