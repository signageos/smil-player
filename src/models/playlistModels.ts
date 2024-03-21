import { PriorityObject } from './priorityModels';
import { SMILMedia, SMILVideo, SosHtmlElement } from './mediaModels';
import { Synchronization } from './syncModels';

export type PrefetchObject = {
	prefetch: {
		src: string;
	};
};

export type PlaylistOptions = {
	cancelFunction: boolean[];
	currentlyPlaying: CurrentlyPlaying;
	promiseAwaiting: PromiseAwaiting;
	currentlyPlayingPriority: CurrentlyPlayingPriority;
	synchronization: Synchronization;
	videoPreparing: VideoPreparing;
	randomPlaylist: RandomPlaylist;
};

export type RandomPlaylist = {
	[playlistParentName: string]: IndexRecord;
};

export type IndexRecord = {
	previousIndex: number;
};

export type BackupElement = {
	repeatCount: string;
	img: {
		src: string;
		dur: string;
		localFilePath: string;
	};
};

export type BackupPlaylist = {
	seq: BackupElement;
};

export type PlaylistElement = {
	playMode?: string;
	expr?: string;
	begin?: string;
	end?: string;
	repeatCount?: number | string;
	seq?: PlaylistElement;
	par?: PlaylistElement;
	excl?: PlaylistElement;
	priorityClass?: PlaylistElement;
};

export type CurrentlyPlaying = {
	[regionName: string]: PlayingInfo;
};

export type PlayingInfo = {
	player?: string;
	promiseFunction?: Function[];
	nextElement: (SosHtmlElement | SMILMedia) & {
		type?: string;
	};
} & SosHtmlElement &
	SMILMedia;

export type CurrentlyPlayingPriority = {
	[regionName: string]: CurrentlyPlayingRegion[];
};

export type CurrentlyPlayingRegion = {
	media: SMILMedia;
	priority: PriorityObject;
	player: {
		contentPause: number;
		stop: boolean;
		endTime: number;
		playing: boolean;
		timesPlayed: number;
	};
	parent: string;
	behaviour: string;
	version: number;
	controlledPlaylist: number | null;
	isFirstInPlaylist: SMILMedia;
};

export type PromiseAwaiting = {
	[regionName: string]: (SMILMedia | SosHtmlElement) & {
		promiseFunction?: Promise<void>[];
	};
};

export type VideoPreparing = {
	[regionName: string]: SMILVideo;
};

export type SMILPlaylist = {
	playlist: { [key: string]: PlaylistElement | PlaylistElement[] };
};
