import { PriorityObject } from './priorityModels';
import { SMILMedia, SMILVideo, SosHtmlElement } from './mediaModels';

export type PrefetchObject = {
	prefetch: {
		src: string,
	},
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
