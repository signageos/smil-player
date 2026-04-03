import { SMILMedia } from '../../../models/mediaModels';
import { PriorityObject } from '../../../models/priorityModels';
import { CurrentlyPlayingRegion } from '../../../models/playlistModels';
import { PlaylistTriggers } from '../playlistTriggers/playlistTriggers';

export interface IPlaylistPriority {
	priorityBehaviour: (
		value: SMILMedia,
		elementKey: string,
		version: number,
		parent: string,
		endTime: number,
		priorityObject: PriorityObject,
	) => Promise<{
		currentIndex: number;
		previousPlayingIndex: number;
	}>;
	handlePriorityWhenDone: (
		value: SMILMedia,
		priorityRegionName: string,
		currentIndex: number,
		endTime: number,
		isLast: boolean,
		version: number,
		currentVersion: number,
		triggers: PlaylistTriggers,
	) => void;
	cleanupPriorityTracking: (regionName: string, version: number, priorityLevel?: number) => void;
	cleanupExpiredPriority: (version: number, priorityLevel: number) => void;
	cancelAllInRegion: (regionName: string, filter?: (entry: CurrentlyPlayingRegion) => boolean) => void;
	setPlaying: (regionName: string, index: number) => void;
	aliasRegion: (fromRegion: string, toRegion: string) => void;
	cloneRegion: (fromRegion: string, toRegion: string) => void;
	waitUntil: (regionName: string, predicate: (entries: CurrentlyPlayingRegion[]) => boolean) => Promise<void>;
	waitForTurn: (regionName: string, predicate: (entries: CurrentlyPlayingRegion[]) => boolean, priorityLevel: number) => Promise<void>;
}
