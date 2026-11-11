import { HandlePriorityWhenDoneOptions, PriorityBehaviourOptions } from './playlistPriority';
import { PriorityStateManager } from './priorityStateManager';

export interface IPlaylistPriority {
	readonly stateManager: PriorityStateManager;
	priorityBehaviour: (options: PriorityBehaviourOptions) => Promise<{
		currentIndex: number;
		previousPlayingIndex: number;
	}>;
	handlePriorityWhenDone: (options: HandlePriorityWhenDoneOptions) => Promise<void>;
}
