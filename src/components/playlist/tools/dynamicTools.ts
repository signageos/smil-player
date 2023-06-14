import { PlaylistElement } from '../../../models/playlistModels';
import { removeDigits } from './generalTools';
import { isObject } from 'lodash';
import FrontApplet from '@signageos/front-applet/es6/FrontApplet/FrontApplet';
import { Synchronization } from '../../../models/syncModels';
import { DynamicPlaylist } from '../../../models/dynamicModels';

export function getDynamicTagsFromPlaylist(playlist: PlaylistElement | PlaylistElement[], _dynamicTags: string[] = []) {
	const dynamicTags = _dynamicTags;
	for (let [key, loopValue] of Object.entries(playlist)) {
		let value = loopValue as {
			data: string;
		};
		if (!isObject(value)) {
			continue;
		}
		console.log('key', key);
		if (removeDigits(key) === 'EXPERIMENTAL_emitDynamic') {
			dynamicTags.push(value.data);
		}
		getDynamicTagsFromPlaylist(value as PlaylistElement | PlaylistElement[], dynamicTags);
	}

	return dynamicTags;
}

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
	console.log(
		`sending udp request ${action} ${dynamicPlaylistConfig.data} ${Date.now()} with requestUid ${requestUid}`,
	);
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
