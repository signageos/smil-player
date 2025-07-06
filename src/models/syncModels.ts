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

export type Synchronization = {
	shouldSync: boolean;
	syncGroupIds: string[];
	syncGroupName: string;
	syncDeviceId: string;
	syncingInAction: boolean;
	movingForward: boolean;
	shouldCancelAll: boolean;
	targetSyncIndex?: number;
	targetRegionName?: string;
};
