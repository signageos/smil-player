import { SMILMedia } from '../../../models/mediaModels';
import { PriorityObject } from '../../../models/priorityModels';

export interface IPlaylistPriority {
	priorityBehaviour: (
		value: SMILMedia,
		version: number,
		parent: string,
		endTime: number,
		priorityObject: PriorityObject,
	) => Promise<{
		currentIndex: number;
		previousPlayingIndex: number;
	}>;
	handlePriorityWhenDone: (
		priorityRegionName: string,
		currentIndex: number,
		endTime: number,
		isLast: boolean,
		version: number,
		currentVersion: number,
	) => void;
}
