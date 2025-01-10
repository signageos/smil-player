export type ISyncStatus = {
	connectedPeers: string[];
};

// type MultiLevelSync = {
// 	before: number | undefined;
// 	after: number | undefined;
// };

export type Synchronization = {
	syncValue: number | undefined;
	shouldSync: boolean;
	syncGroupIds: string[];
	syncGroupName: string;
	syncDeviceId: string;
	syncingInAction: boolean;
	movingForward: boolean;
	shouldCancelAll: boolean;
};
