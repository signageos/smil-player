import { CurrentlyPlaying, CurrentlyPlayingPriority } from '../../../models/playlistModels';
import { debug } from './generalTools';
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
	dynamicPlaylistConfig: DynamicPlaylist,
	groupName: string,
	action: string,
) {
	const requestUid = Math.random().toString(36).substr(2, 10);
	debug(`sending udp request ${action} ${dynamicPlaylistConfig.data} ${Date.now()} with requestUid ${requestUid}`);
	await sos.sync.broadcastValue({
		groupName,
		key: 'myKey',
		value: {
			...dynamicPlaylistConfig,
			action,
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
	const currentDynamicPlaylist = triggers?.dynamicPlaylist[dynamicValue]!;
	clearInterval(currentDynamicPlaylist.intervalId);
	set(currentlyPlaying, `${currentDynamicPlaylist.regionInfo.regionName}.playing`, false);
	await broadcastSyncValue(
		sos,
		currentDynamicPlaylist.dynamicConfig,
		`${synchronization.syncGroupName}-fullScreenTrigger`,
		'end',
	);

	for (const elem of currentlyPlayingPriority[currentDynamicPlaylist.regionInfo.regionName]) {
		elem.player.playing = false;
	}

	currentDynamicPlaylist.play = false;
	for (const elem of currentlyPlayingPriority[currentDynamicPlaylist.parentRegion]) {
		if (elem.media.dynamicValue) {
			elem.player.playing = false;
		}
	}
}
