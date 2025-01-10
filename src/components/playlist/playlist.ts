import { initSyncObject } from './tools/syncTools';
import { PlaylistProcessor } from './playlistProcessor/playlistProcessor';
import FrontApplet from '@signageos/front-applet/es6/FrontApplet/FrontApplet';
import { FilesManager } from '../files/filesManager';
import { PlaylistDataPrepare } from './playlistDataPrepare/playlistDataPrepare';
import { PlaylistOptions } from '../../models/playlistModels';

export class SmilPlayerPlaylist {
	public readonly processor: PlaylistProcessor;
	public readonly dataPrepare: PlaylistDataPrepare;
	private options: PlaylistOptions = {
		cancelFunction: [],
		currentlyPlaying: {},
		promiseAwaiting: {},
		currentlyPlayingPriority: {},
		synchronization: initSyncObject(),
		videoPreparing: {},
		randomPlaylist: {},
	};

	constructor(sos: FrontApplet, files: FilesManager) {
		this.processor = new PlaylistProcessor(sos, files, this.options);
		this.dataPrepare = new PlaylistDataPrepare(sos, files, this.options);
	}
}
