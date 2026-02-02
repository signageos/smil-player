import { CurrentlyPlaying, CurrentlyPlayingPriority } from '../../../models/playlistModels';
import { debug } from './generalTools';
import { resolvePlayingDeferred } from './deferredTools';
import set = require('lodash/set');
import FrontApplet from '@signageos/front-applet/es6/FrontApplet/FrontApplet';
import { Synchronization } from '../../../models/syncModels';
import { DynamicPlaylist } from '../../../models/dynamicModels';
import { PlaylistTriggers } from '../playlistTriggers/playlistTriggers';

export async function joinSyncGroup(sos: FrontApplet, synchronization: Synchronization, groupName: string) {
	await sos.sync.joinGroup({
		groupName,
		...(synchronization.syncDeviceId ? { deviceIdentification: synchronization.syncDeviceId } : {}),
	});
}

export async function broadcastSyncValue(
	sos: FrontApplet,
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
	sos: FrontApplet,
	currentlyPlaying: CurrentlyPlaying,
	synchronization: Synchronization,
	currentlyPlayingPriority: CurrentlyPlayingPriority,
	dynamicValue: string,
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

	for (const elem of currentlyPlayingPriority[regionName] ?? []) {
		elem.player.playing = false;
		resolvePlayingDeferred(elem.player);
	}

	currentDynamicPlaylist.play = false;
	for (const elem of currentlyPlayingPriority[currentDynamicPlaylist.parentRegion] ?? []) {
		if (elem.media.dynamicValue) {
			elem.player.playing = false;
			resolvePlayingDeferred(elem.player);
		}
	}
}
