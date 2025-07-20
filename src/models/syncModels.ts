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
	| 'cmd-prepare'    // Master commands slaves to prepare
	| 'cmd-play'       // Master commands slaves to play
	| 'signal-ready'   // Master signals all devices ready to proceed
	| 'ack-prepared'   // Slave acknowledges preparation complete
	| 'ack-playing';   // Slave acknowledges playing started

export interface SyncMessage {
	type: SyncMessageType;
	regionName: string;
	syncIndex: number;
	timestamp: number;
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
	};
	maxSyncIndexPerRegion?: { [regionName: string]: number };
};
