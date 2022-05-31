export type ISyncStatus = {
	connectedPeers: string[];
};

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
