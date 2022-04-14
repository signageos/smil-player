import { Synchronization } from '../../../models/syncModels';

// sets synchronization object to its starting values
export function initSyncObject(): Synchronization {
	return {
		syncValue: undefined,
		shouldSync: false,
		syncGroupIds: [],
		syncGroupName: '',
		syncDeviceId: '',
		syncingInAction: false,
		movingForward: false,
		shouldCancelAll: true,
	};
}
