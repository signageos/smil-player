import { CurrentlyPlaying, CurrentlyPlayingPriority, CurrentlyPlayingRegion } from '../../../models/playlistModels';
import { Log } from '../../../logger';
import set = require('lodash/set');
import { ISos } from '../../../models/sosModels';
import { Synchronization } from '../../../models/syncModels';
import { DynamicPlaylist } from '../../../models/dynamicModels';
import { PlaylistTriggers } from '../playlistTriggers/playlistTriggers';
import { SyncGroup } from './SyncGroup';
import { getSyncGroup } from './syncTools';

const DYNAMIC_REGION_NAME = 'fullScreenTrigger';
const DYNAMIC_STALE_COORD_TYPES = [
	'cmd-prepare',
	'cmd-play',
	'cmd-finish',
	'signal-ready-prepared',
	'signal-ready-playing',
	'signal-ready-finished',
] as const;

/**
 * Clear stored sync-coordination messages for the dynamic-trigger region so
 * that the next cycle of the same emit doesn't consume cycle-N-1's commands.
 *
 * Why this is needed: the regular cycle-wrap clearing in updateSlavePosition
 * triggers when slave's syncIndex regresses (`syncIndex < prevSync`). The
 * dynamic playlist always uses syncIndex=1 within its `<seq>`, so wrap is
 * never detected and the cmd-play / cmd-finish / signal-ready-* messages
 * from cycle 1 sit in `lastValues` waiting to be matched by cycle 2's wait —
 * which they do (state+syncIndex match) and the slave proceeds early using
 * 12-second-old commands instead of the live ones the master is about to send.
 */
export function clearDynamicSyncCoordination(syncGroupName: string): void {
	const group = getSyncGroup(`${syncGroupName}-${DYNAMIC_REGION_NAME}`);
	if (!group) { return; }
	for (const type of DYNAMIC_STALE_COORD_TYPES) {
		group.clearSyncCoordinationMessage(type, DYNAMIC_REGION_NAME);
	}
}

/**
 * Built by createSyncTools(log): joinSyncGroup needs createSyncGroup and broadcastEndActionToAllDynamics needs
 * broadcastSyncValue, so the two modules form one factory and the cycle is closed by this parameter.
 */
export function createDynamicFns(
	log: Log,
	sync: { createSyncGroup: (sos: ISos, groupName: string, deviceId?: string) => Promise<SyncGroup> },
) {
	async function joinSyncGroup(sos: ISos, synchronization: Synchronization, groupName: string) {
		// Route through the syncGroups registry in syncTools so a repeat call for
		// a group we've already joined is a no-op. SocketSynchronizer's joinGroup
		// has no JS-level idempotency, so a duplicate 'join_group' to the sync
		// server is rejected as InternalSynchronizerError 51103.
		await sync.createSyncGroup(sos, groupName, synchronization.syncDeviceId);
	}

	async function broadcastSyncValue(
		sos: ISos,
		dynamicPlaylistConfig: Partial<DynamicPlaylist>,
		groupName: string,
		action: string,
	) {
		const requestUid = Math.random().toString(36).substr(2, 10);
		log.debug(`sending udp request ${action} ${dynamicPlaylistConfig.data ?? 'unknown'} ${Date.now()} with requestUid ${requestUid}`);
		await sos.sync.broadcastValue({
			groupName,
			key: 'myKey',
			value: {
				action,
				...dynamicPlaylistConfig,
				requestUid,
			},
		});
	}

	async function cancelDynamicPlaylistMaster(
		triggers: PlaylistTriggers,
		sos: ISos,
		currentlyPlaying: CurrentlyPlaying,
		synchronization: Synchronization,
		_currentlyPlayingPriority: CurrentlyPlayingPriority,
		dynamicValue: string,
		cancelAllInRegion: (regionName: string, filter?: (entry: CurrentlyPlayingRegion) => boolean) => void,
		notifyRegionChange?: () => void,
	) {
		const currentDynamicPlaylist = triggers?.dynamicPlaylist[dynamicValue];
		if (!currentDynamicPlaylist) {
			return;
		}
		clearInterval(currentDynamicPlaylist.intervalId);
		const regionName = currentDynamicPlaylist.regionInfo?.regionName;
		if (regionName) {
			set(currentlyPlaying, `${regionName}.playing`, false);
		}
		if (currentDynamicPlaylist.dynamicConfig) {
			await broadcastSyncValue(
				sos,
				currentDynamicPlaylist.dynamicConfig,
				`${synchronization.syncGroupName}-fullScreenTrigger`,
				'end',
			);
		}

		cancelAllInRegion(regionName);
		cancelAllInRegion(currentDynamicPlaylist.parentRegion, (e) => !!e.media.dynamicValue);

		// Clear stored cmd-*/signal-* for fullScreenTrigger so the next emit cycle
		// doesn't satisfy its sync waits with the just-finished cycle's broadcasts
		// (syncIndex=1 every cycle in the dynamic seq, so cycle-wrap detection
		// won't catch this).
		clearDynamicSyncCoordination(synchronization.syncGroupName);

		currentDynamicPlaylist.play = false;

		// Wake any element parked in handleTriggers → waitForRegionChange so the parent
		// region's autonomous content can resume. Without this, sibling content that
		// was waiting out the dynamic punch-in stays blocked indefinitely.
		notifyRegionChange?.();
	}

	return { joinSyncGroup, broadcastSyncValue, cancelDynamicPlaylistMaster };
}
