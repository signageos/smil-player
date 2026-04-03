import { SMILMedia } from '../../../models/mediaModels';
import { PriorityObject } from '../../../models/priorityModels';
import { PlaylistTriggers } from '../playlistTriggers/playlistTriggers';
import { PriorityStateManager } from './priorityStateManager';

export interface IPlaylistPriority {
	readonly stateManager: PriorityStateManager;
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
	) => Promise<void>;
}
