import Debug from 'debug';
import sos from '@signageos/front-applet';
import { IFile } from '@signageos/front-applet/es6/FrontApplet/FileSystem/types';

/**
 * Wrapper over single video to keep the state and provide simple API for video playback
 */
export class Video {
	public readonly uid: string;
	public readonly uri: string;
	public readonly file: IFile;

	private debugMode: boolean;
	private debug: Debug;

	constructor({ uid, uri, file, debugMode }: {
		uid: string;
		uri: string;
		file: IFile;
		debugMode: boolean;
	}) {
		this.uid = uid;
		this.uri = uri;
		this.file = file;
		this.debugMode = debugMode;

		this.debug = Debug(`sagenet-poc:Video:${uid}`);
		this.logEvents();
	}

	public async getDuration(): Promise<number> {
		if ('videoDurationMs' in this.file) {
			return this.file.videoDurationMs as number;
		}

		return 0;
	}

	public async prepare(): Promise<void> {
		this.debug('prepare');
		const args = this.getFullScreenArgs();
		await sos.video.prepare(...args);
	}

	public async play(): Promise<void> {
		this.debug('play');
		const args = this.getFullScreenArgs();
		await sos.video.play(...args);
	}

	public async pause() {
		this.debug('pause');
		const args = this.getFullScreenArgs();
		await sos.video.pause(...args);
	}

	public async stop(): Promise<void> {
		this.debug('stop');
		const args = this.getFullScreenArgs();
		await sos.video.stop(...args);
	}

	/**
	 * Returns a promise that resolves when the video ends
	 * 
	 * @see https://developers.signageos.io/sdk/content/js-video#event-onceended
	 */
	public async onceEnded(): Promise<void> {
		const args = this.getFullScreenArgs();
		await sos.video.onceEnded(...args);
	}

	private getFullScreenArgs(): [string, number, number, number, number] {
		const borderSize = this.debugMode ? 5 : 0;

		const x = borderSize;
		const y = borderSize;
		const width = document.documentElement.clientWidth - borderSize * 2;
		const height = document.documentElement.clientHeight - borderSize * 2;

		return [this.file.localUri, x, y, width, height];
	}

	private logEvents() {
		sos.video.onEnded(({ srcArguments }) => {
			if (srcArguments.uri === this.file.localUri) {
				this.debug('ended');
			}
		});
	}
};

/**
 * Load videos from the internet and store them to offline storage
 *
 * @see https://developers.signageos.io/sdk/content/js-offline-cache-media-files
 */
export async function loadVideos(videoUris: string[], uidPostfix: string, debugMode: boolean) {
	const debug = Debug('sagenet-poc:loadVideos');

	let result: Video[] = [];
	let counter = 0;

	for (const uri of videoUris) {
		const uid = `video-${++counter}${uidPostfix}`;
		const filePath = await getFullFilePath(uid);

		try {
			await sos.fileSystem.downloadFile(filePath, uri);
		} catch (error) {
			// if download fails but the file exists then failover to the already downloaded version
			if (!await sos.fileSystem.exists(filePath)) {
				throw new Error(`Failed to download video from ${uri}`);
			}
		}

		const file = await sos.fileSystem.getFile(filePath);
		if (!file) {
			throw new Error(`Missing expected video file: ${filePath}`);
		}

		debug(`loaded video ${uid} from ${uri}`, { duration: 'videoDurationMs' in file && file.videoDurationMs || undefined });

		const video = new Video({ uid, uri, file, debugMode });
		result.push(video);
	}

	return result;
}

async function getFullFilePath(filePath: string) {
	const storageUnits = await sos.fileSystem.listStorageUnits();
	const internalStorageUnit = storageUnits.find(unit => !unit.removable);
	if (!internalStorageUnit) {
		throw new Error('Internal storage unit not found');
	}

	return { filePath, storageUnit: internalStorageUnit };
}
