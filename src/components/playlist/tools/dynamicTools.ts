import { PlaylistElement } from '../../../models/playlistModels';
import { removeDigits } from './generalTools';
import { isObject } from 'lodash';
import FrontApplet from '@signageos/front-applet/es6/FrontApplet/FrontApplet';
import { Synchronization } from '../../../models/syncModels';

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
