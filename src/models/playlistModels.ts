import { PriorityObject } from './priorityModels';
import { SMILMedia, SMILVideo, SosHtmlElement } from './mediaModels';

export type PrefetchObject = {
	prefetch: {
		src: string,
	},
};

export type BackupElement = {
	repeatCount: string,
	img: {
		src: string,
		dur: string,
		localFilePath: string;
	},
};

export type BackupPlaylist = {
	seq: BackupElement,
};

export type PlaylistElement = {
	expr?: string,
	begin?: string,
	end?: string,
	repeatCount?: number | string,
	seq?: PlaylistElement,
	par?: PlaylistElement,
	excl?: PlaylistElement,
	priorityClass?: PlaylistElement,
};

export type CurrentlyPlaying = {
	[regionName: string]: PlayingInfo,
};

export type PlayingInfo = {
	player?: string,
	promiseFunction?: any[],
	nextElement?: any,
} & SosHtmlElement & SMILVideo;

export type CurrentlyPlayingPriority = {
	[regionName: string]: CurrentlyPlayingRegion[],
};

export type CurrentlyPlayingRegion = {
	media: SMILMedia,
	priority: PriorityObject,
	player: {
		contentPause: number,
		stop: boolean,
		endTime: number,
		playing: boolean,
		timesPlayed: number,
	},
	parent: string,
	behaviour: string,
	controlledPlaylist: number | null,
	isFirstInPlaylist: SMILMedia;
};

export type SMILPlaylist = {
	playlist: { [key: string]: PlaylistElement | PlaylistElement[] },
};

export type InfiniteLoopObject = {
	[key in 'seq' | 'par']: PrefetchObject[];
};
