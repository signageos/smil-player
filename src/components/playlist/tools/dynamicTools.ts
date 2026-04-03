import { CurrentlyPlaying, CurrentlyPlayingPriority, CurrentlyPlayingRegion } from '../../../models/playlistModels';
import { debug } from './generalTools';
import set = require('lodash/set');
import { ISos } from '../../../models/sosModels';
import { Synchronization } from '../../../models/syncModels';
import { DynamicPlaylist } from '../../../models/dynamicModels';
import { PlaylistTriggers } from '../playlistTriggers/playlistTriggers';

export async function joinSyncGroup(sos: ISos, synchronization: Synchronization, groupName: string) {
	await sos.sync.joinGroup({
		groupName,
		...(synchronization.syncDeviceId ? { deviceIdentification: synchronization.syncDeviceId } : {}),
	});
}

export async function broadcastSyncValue(
	sos: ISos,
	dynamicPlaylistConfig: Partial<DynamicPlaylist>,
	groupName: string,
	action: string,
) {
	const requestUid = Math.random().toString(36).substr(2, 10);
	debug(`sending udp request ${action} ${dynamicPlaylistConfig.data ?? 'unknown'} ${Date.now()} with requestUid ${requestUid}`);
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

export async function cancelDynamicPlaylistMaster(
	triggers: PlaylistTriggers,
	sos: ISos,
	currentlyPlaying: CurrentlyPlaying,
	synchronization: Synchronization,
	_currentlyPlayingPriority: CurrentlyPlayingPriority,
	dynamicValue: string,
	cancelAllInRegion: (regionName: string, filter?: (entry: CurrentlyPlayingRegion) => boolean) => void,
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

	currentDynamicPlaylist.play = false;
}
