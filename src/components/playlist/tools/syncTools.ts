import { Log } from '../../../logger';
import { ISos } from '../../../models/sosModels';
import { Synchronization } from '../../../models/syncModels';
import { SyncEngine } from '@signageos/front-applet/es6/FrontApplet/Sync/Sync';
import { getConfigString, sleep } from './generalTools';
import { isArray, isNil } from 'lodash';
import { createDynamicFns } from './dynamicTools';
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
		shouldCancelAll: true,
	};
}

export function createSyncTools(log: Log) {
	async function createSyncGroup(sos: ISos, groupName: string, deviceId?: string): Promise<SyncGroup> {
		if (syncGroups.has(groupName)) {
			return syncGroups.get(groupName)!;
		}

		log.debug('[sync] creating sync group: name=%s, deviceId=%s', groupName, deviceId);
		const syncGroup = new SyncGroup(sos, groupName, deviceId, log.child('syncGroup'));
		await syncGroup.join();
		syncGroups.set(groupName, syncGroup);
		return syncGroup;
	}

	async function createTriggerSyncGroups(
		sos: ISos,
		synchronization: Synchronization,
		triggerInfo: ParsedTriggerInfo,
	): Promise<boolean> {
		for (let [key] of Object.entries(triggerInfo)) {
			if (key.startsWith('sync-')) {
				log.debug(
					'[sync] creating trigger sync group: name=%s, deviceId=%s',
					`${synchronization.syncGroupName}`,
					synchronization.syncDeviceId,
				);

				await createSyncGroup(sos, `${synchronization.syncGroupName}`, synchronization.syncDeviceId);
				// create just once is enough for sync triggers since all share same sync group
				return true;
			}
		}
		return false;
	}

	async function createRegionSyncGroups(sos: ISos, synchronization: Synchronization, smilObject: SMILFileObject) {
		let result = false;
		for (let [key, value] of Object.entries(smilObject.region)) {
			if (!isNil(value.region)) {
				if (!isArray(value.region)) {
					value.region = [value.region];
				}
				for (let [, nestedValue] of Object.entries(value.region)) {
					if (nestedValue.sync) {
						log.debug(
							'[sync] creating nested region sync group: name=%s, deviceId=%s',
							`${synchronization.syncGroupName}-${nestedValue.regionName}`,
							synchronization.syncDeviceId,
						);
						await createSyncGroup(
							sos,
							`${synchronization.syncGroupName}-${nestedValue.regionName}`,
							synchronization.syncDeviceId,
						);
						result = true;
					}
				}
			}
			if (value.sync) {
				log.debug(
					'[sync] creating region sync group: name=%s, deviceId=%s',
					`${synchronization.syncGroupName}-${key}`,
					synchronization.syncDeviceId,
				);
				await createSyncGroup(sos, `${synchronization.syncGroupName}-${key}`, synchronization.syncDeviceId);
				result = true;

				log.debug('[sync] sync groups created for region: %s', `${synchronization.syncGroupName}-${key}`);
			}
		}
		return result;
	}

	async function joinAllSyncGroupsOnSmilStart(
		sos: ISos,
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
			log.debug('[sync] sync enabled: event-based groups created');
			synchronization.shouldSync = true;
			log.debug('[sync] sync config: group=%s, deviceId=%s', synchronization.syncGroupName, synchronization.syncDeviceId);
		} else {
			log.debug('[sync] sync disabled: no groups found');
		}
	}

	async function connectSyncSafe(sos: ISos, retryCount: number = 3) {
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
			log.debug('[sync] connecting to sync server');
			await sos.sync.connect(options);
			resetAppRestartCount();
		} catch (error) {
			log.error('[sync] connection error: %O', error);
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

	async function broadcastEndActionToAllDynamics(
		sos: ISos,
		synchronization: Synchronization,
		smilObject: SMILFileObject,
	) {
		const dynamicInPlaylist = getDynamicTagsFromPlaylist(smilObject.playlist);
		log.debug('[sync] dynamic tags in playlist: count=%d', dynamicInPlaylist.length);
		for (let dynamicId in smilObject.dynamic) {
			if (dynamicInPlaylist.includes(dynamicId)) {
				log.debug('[sync] sending end event for dynamic tag: id=%s', dynamicId);
				await dynamic.broadcastSyncValue(
					sos,
					{ data: dynamicId },
					`${synchronization.syncGroupName}-fullScreenTrigger`,
					'end',
				);
			}
		}
	}

	const dynamic = createDynamicFns(log, { createSyncGroup });

	return { ...dynamic, createSyncGroup, joinAllSyncGroupsOnSmilStart, connectSyncSafe, broadcastEndActionToAllDynamics };
}
export type SyncTools = ReturnType<typeof createSyncTools>;

// Global registry for sync groups
const syncGroups = new Map<string, SyncGroup>();

export function getSyncGroup(groupName: string): SyncGroup | undefined {
	return syncGroups.get(groupName);
}

export function hasDynamicContent(smilObject: SMILFileObject): boolean {
	return Object.keys(smilObject.dynamic).length > 0;
}

async function limitedAppRestart(sos: ISos) {
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
