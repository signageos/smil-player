import { PriorityObject } from './priorityModels';
import { SMILMedia, SMILVideo, SosHtmlElement } from './mediaModels';
import { Synchronization } from './syncModels';
import { Deferred } from '../components/playlist/tools/Deferred';
import { PriorityBehaviour } from '../enums/priorityEnums';

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
	// runtime unavailable-content flag set by the fetch strategies — see UpdateChecks.skipContentMark
	skipContentMark?: boolean;
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
		playingCompletionDeferred?: Deferred<void>;
		/**
		 * One-shot: the SAME playlist re-registered this slot (exact/parent match in
		 * registerOrUpdate) while it was playing — i.e. the next repeatCount pass has
		 * claimed it during the current pass (traverser lookahead). Consumed by
		 * markFinished (hold the slot instead of releasing it between passes) and
		 * cleared when the successor reaches "ready to play", so a slot's own
		 * registration is never mistaken for a successor when it finishes.
		 */
		successorRegistered?: boolean;
	};
	parent: string;
	behaviour: PriorityBehaviour;
	version: number;
	/**
	 * Indexes of entries in the same region this entry paused (higher/peer="pause").
	 * A list, not a single pointer: while a wallclock campaign window holds the
	 * region, EVERY lower sibling playlist that attempts to play gets paused —
	 * releasing only the most recent victim would leave the others frozen at the
	 * pause gate forever.
	 */
	controlledPlaylists: number[];
	isFirstInPlaylist: SMILMedia;
};

export type PromiseAwaitingEntry = {
	promiseFunction?: Promise<void>[];
	version?: number;
	highestProcessingPriority?: number;
	triggerValue?: string;
};

export type PromiseAwaiting = {
	[regionName: string]: PromiseAwaitingEntry;
};

export type VideoPreparing = {
	[regionName: string]: SMILVideo;
};

export type SMILPlaylist = {
	playlist: { [key: string]: PlaylistElement | PlaylistElement[] };
};
