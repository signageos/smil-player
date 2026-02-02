import FrontApplet from '@signageos/front-applet/es6/FrontApplet/FrontApplet';
import { Synchronization } from '../../../models/syncModels';
import { SyncEngine } from '@signageos/front-applet/es6/FrontApplet/Sync/Sync';
import { debug, getConfigString, sleep } from './generalTools';
import { isArray, isNil } from 'lodash';
import { broadcastSyncValue } from './dynamicTools';
import { SMILFileObject } from '../../../models/filesModels';
import { getDynamicTagsFromPlaylist } from './dynamicPlaylistTools';
import { ParsedTriggerInfo } from '../../../models/triggerModels';
import { SyncGroup } from './SyncGroup';

// sets synchronization object to its starting values
export function initSyncObject(): Synchronization {
	return {
		shouldSync: false,
		syncGroupIds: [],
		syncGroupName: '',
		syncDeviceId: '',
		syncingInAction: false,
		movingForward: false,
		shouldCancelAll: true,
	};
}

export async function broadcastEndActionToAllDynamics(
	sos: FrontApplet,
	synchronization: Synchronization,
	smilObject: SMILFileObject,
) {
	const dynamicInPlaylist = getDynamicTagsFromPlaylist(smilObject.playlist);
	debug('Dynamic tags in playlist: %O', dynamicInPlaylist);
	for (let dynamicId in smilObject.dynamic) {
		if (dynamicInPlaylist.includes(dynamicId)) {
			debug('Dynamic tag %s is in playlist, sending end event', dynamicId);
			await broadcastSyncValue(
				sos,
				{ data: dynamicId },
				`${synchronization.syncGroupName}-fullScreenTrigger`,
				'end',
			);
		}
	}
}

// Global registry for sync groups
const syncGroups = new Map<string, SyncGroup>();

export async function joinAllSyncGroupsOnSmilStart(
	sos: FrontApplet,
	synchronization: Synchronization,
	smilObject: SMILFileObject,
): Promise<void> {
	synchronization.syncGroupName = getConfigString(sos.config, 'syncGroupName') ?? '';
	synchronization.syncGroupIds = getConfigString(sos.config, 'syncGroupIds')?.split(',') ?? [];
	synchronization.syncDeviceId = getConfigString(sos.config, 'syncDeviceId') ?? '';
	synchronization.syncGroupIds.sort();

	const triggerSync = await createTriggerSyncGroups(sos, synchronization, smilObject.triggerSensorInfo);
	const regionSync = await createRegionSyncGroups(sos, synchronization, smilObject);

	if (triggerSync || regionSync) {
		// smil has some sync region, turn on sync
		debug('Event-based sync groups created, turning sync on');
		synchronization.shouldSync = true;
		debug('sync object: %O', synchronization);

		// Create priority sync groups using event-based approach
		// await createSyncGroup(sos, `${synchronization.syncGroupName}-prioritySync`);
		// await createSyncGroup(sos, `${synchronization.syncGroupName}-idlePrioritySync`);
	} else {
		debug('No sync groups found, turning sync off');
	}
}

export function getSyncGroup(groupName: string): SyncGroup | undefined {
	return syncGroups.get(groupName);
}

async function createSyncGroup(sos: FrontApplet, groupName: string): Promise<SyncGroup> {
	if (syncGroups.has(groupName)) {
		return syncGroups.get(groupName)!;
	}

	debug('Creating and joining event-based sync group: %s', groupName);
	const syncGroup = new SyncGroup(sos, groupName);
	await syncGroup.join();
	syncGroups.set(groupName, syncGroup);
	return syncGroup;
}

async function createTriggerSyncGroups(
	sos: FrontApplet,
	synchronization: Synchronization,
	triggerInfo: ParsedTriggerInfo,
): Promise<boolean> {
	for (let [key] of Object.entries(triggerInfo)) {
		if (key.startsWith('sync-')) {
			debug(
				'Creating event-based sync group for sync triggers: %s with deviceSyncId: %s',
				`${synchronization.syncGroupName}`,
				synchronization.syncDeviceId,
			);

			await createSyncGroup(sos, `${synchronization.syncGroupName}`);
			// create just once is enough for sync triggers since all share same sync group
			return true;
		}
	}
	return false;
}

async function createRegionSyncGroups(sos: FrontApplet, synchronization: Synchronization, smilObject: SMILFileObject) {
	let result = false;
	for (let [key, value] of Object.entries(smilObject.region)) {
		if (!isNil(value.region)) {
			if (!isArray(value.region)) {
				value.region = [value.region];
			}
			for (let [, nestedValue] of Object.entries(value.region)) {
				if (nestedValue.sync) {
					debug(
						'Creating event-based sync group for nested region: %s with deviceSyncId: %s',
						`${synchronization.syncGroupName}-${nestedValue.regionName}`,
						synchronization.syncDeviceId,
					);
					await createSyncGroup(sos, `${synchronization.syncGroupName}-${nestedValue.regionName}-before`);
					// await createSyncGroup(
					// 	sos,
					// 	`${synchronization.syncGroupName}-${nestedValue.regionName}-after`,
					// );
					result = true;
				}
			}
		}
		if (value.sync) {
			debug(
				'Creating event-based sync groups for region: %s with deviceSyncId: %s',
				`${synchronization.syncGroupName}-${key}`,
				synchronization.syncDeviceId,
			);
			await createSyncGroup(sos, `${synchronization.syncGroupName}-${key}-before`);
			// await createSyncGroup(sos, `${synchronization.syncGroupName}-${key}-after`);
			result = true;

			debug('Event-based sync groups created for region: %s', `${synchronization.syncGroupName}-${key}`);
		}
	}
	return result;
}

export async function connectSyncSafe(sos: FrontApplet, retryCount: number = 3) {
	try {
		const options = sos.config.syncServerUrl
			? {
					engine: SyncEngine.SyncServer,
					uri: getConfigString(sos.config, 'syncServerUrl')!,
					config: {
						allowSlaveBroadcast: true,
					},
			  }
			: {
					engine: SyncEngine.P2PLocal,
			  };
		debug('Connecting to sync server with engine: %O', options);
		await sos.sync.connect(options);
		resetAppRestartCount();
	} catch (error) {
		debug('Error occurred during sync connection: %O', error);
		const nextTryMultiplier = 1 / (Math.log(retryCount) + 1);
		await sleep(nextTryMultiplier * 2000);
		if (retryCount > 0) {
			await connectSyncSafe(sos, retryCount - 1);
		} else {
			// restart app only on Samsung devices
			if ((await sos.management.getBrand()).toLowerCase().indexOf('samsung') > -1) {
				await limitedAppRestart(sos);
			}
			throw error;
		}
	}
}

export function hasDynamicContent(smilObject: SMILFileObject): boolean {
	return Object.keys(smilObject.dynamic).length > 0;
}

async function limitedAppRestart(sos: FrontApplet) {
	const restartCounter = getAppRestartCount();
	if (restartCounter <= 3) {
		incrementAppRestartCount();
		await sos.management.power.appRestart();
	}
}

const APP_RESTART_COUNTER_KEY = '__smil_player_app_restart_counter__';

function getAppRestartCount() {
	return parseInt(localStorage.getItem(APP_RESTART_COUNTER_KEY) || '0');
}

function incrementAppRestartCount() {
	const count = getAppRestartCount();
	localStorage.setItem(APP_RESTART_COUNTER_KEY, (count + 1).toString());
}

function resetAppRestartCount() {
	localStorage.removeItem(APP_RESTART_COUNTER_KEY);
}
