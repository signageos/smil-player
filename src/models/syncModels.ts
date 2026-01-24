export type ISyncStatus = {
	connectedPeers: string[];
};

export type SyncElementState = 'idle' | 'prepared' | 'playing' | 'finished';

export interface SyncStateEvent {
	regionName: string;
	syncIndex: number;
	state: SyncElementState;
	timestamp: number;
	elementId?: string;
}

export interface SyncNavigationEvent {
	regionName: string;
	syncIndex: number;
	action: 'navigate' | 'prepare' | 'play' | 'finish';
	timestamp: number;
}

// type MultiLevelSync = {
// 	before: number | undefined;
// 	after: number | undefined;
// };

// Acknowledgment Protocol Types
export type SyncMessageType =
	| 'cmd-prepare'           // Master commands slaves to prepare
	| 'cmd-play'              // Master commands slaves to play
	| 'cmd-finish'            // Master commands slaves to finish
	| 'signal-ready-prepared' // Master signals all devices ready after prepare phase
	| 'signal-ready-playing'  // Master signals all devices ready after play phase
	| 'signal-ready-finished' // Master signals all devices ready after finish phase
	| 'ack-prepared'          // Slave acknowledges preparation complete
	| 'ack-playing'           // Slave acknowledges playing started
	| 'ack-finished';         // Slave acknowledges element finished

export interface SyncMessage {
	type: SyncMessageType;
	regionName: string;
	syncIndex: number;
	timestamp: number;
	priorityLevel?: number;  // Priority level of current content (optional for playlists without priorityClass)
}

export type Synchronization = {
	shouldSync: boolean;
	syncGroupIds: string[];
	syncGroupName: string;
	syncDeviceId: string;
	syncingInAction: boolean;
	movingForward: boolean;
	shouldCancelAll: boolean;
	resyncTargets?: {
		prepare?: number;  // Target syncIndex for preparation phase
		play?: number;     // Target syncIndex for playing phase
		finish?: number;   // Target syncIndex for finish phase
	};
	maxSyncIndexPerRegion?: { [regionName: string]: number };
};
