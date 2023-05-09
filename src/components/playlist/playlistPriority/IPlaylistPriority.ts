import { SMILMedia } from '../../../models/mediaModels';
import { PriorityObject } from '../../../models/priorityModels';
import { PlaylistTriggers } from '../playlistTriggers/playlistTriggers';
import { VideoPreparing } from '../../../models/playlistModels';

export interface IPlaylistPriority {
	priorityBehaviour: (
		value: SMILMedia,
		version: number,
		parent: string,
		endTime: number,
		priorityObject: PriorityObject,
		videoPreparing: VideoPreparing,
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
}
