import FrontApplet from '@signageos/front-applet/es6/FrontApplet/FrontApplet';
import { Synchronization } from '../../../models/syncModels';
import { SyncEngine } from '@signageos/front-applet/es6/FrontApplet/Sync/Sync';
import { debug, sleep } from './generalTools';
import { isArray, isNil } from 'lodash';
import { broadcastSyncValue, joinSyncGroup } from './dynamicTools';
import { SMILFileObject } from '../../../models/filesModels';
import { getDynamicTagsFromPlaylist } from './dynamicPlaylistTools';
import { DynamicPlaylist } from '../../../models/dynamicModels';

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
				{
					data: dynamicId,
				} as DynamicPlaylist,
				`${synchronization.syncGroupName}-fullScreenTrigger`,
				'end',
			);
		}
	}
}

export async function joinAllSyncGroupsOnSmilStart(
	sos: FrontApplet,
	synchronization: Synchronization,
	smilObject: SMILFileObject,
): Promise<void> {
	let initCalled = false;

	synchronization.syncGroupName = sos.config.syncGroupName ?? 'testingSmilGroup';
	synchronization.syncGroupIds = sos.config.syncGroupIds?.split(',') ?? [];
	synchronization.syncDeviceId = sos.config.syncDeviceId;
	synchronization.syncGroupIds.sort();
	for (let [key, value] of Object.entries(smilObject.region)) {
		if (!isNil(value.region)) {
			if (!isArray(value.region)) {
				value.region = [value.region];
			}
			for (let [, nestedValue] of Object.entries(value.region)) {
				if (nestedValue.sync) {
					// has to be initialized by value because it iterates over array
					debug(
						'Initializing sync server group on start dynamic: %s with deviceSyncId: %s',
						`${synchronization.syncGroupName}-${nestedValue.regionName}`,
						synchronization.syncDeviceId,
					);
					await joinSyncGroup(
						sos,
						synchronization,
						`${synchronization.syncGroupName}-${nestedValue.regionName}`,
					);
					initCalled = true;
				}
			}
		}
		if (value.sync) {
			debug(
				'Initializing sync server group regular: %s with deviceSyncId: %s',
				`${synchronization.syncGroupName}-${key}`,
				synchronization.syncDeviceId,
			);
			await joinSyncGroup(sos, synchronization, `${synchronization.syncGroupName}-${key}`);
			initCalled = true;
		}
	}
	if (!initCalled) {
		debug(
			'Initializing sync server group: %s with deviceSyncId: %s',
			`${synchronization.syncGroupName}`,
			synchronization.syncDeviceId,
		);
		await joinSyncGroup(sos, synchronization, `${synchronization.syncGroupName}`);
	} else {
		// smil has some sync region, turn on sync
		debug('Sync groups joined, turning sync on');
		synchronization.shouldSync = true;
		debug('sync object: %O', synchronization);
	}

	// TODO: testing, join synchronization group for syncing start of priority
	await joinSyncGroup(sos, synchronization, `prioritySync`);
}

export async function connectSyncSafe(sos: FrontApplet, retryCount: number = 3) {
	try {
		await sos.sync.connect({ engine: SyncEngine.P2PLocal });
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
