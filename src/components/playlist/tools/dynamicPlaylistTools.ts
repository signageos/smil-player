import { DynamicPlaylist } from '../../../models/dynamicModels';
import { SMILFileObject } from '../../../models/filesModels';
import { DynamicPlaylistObject } from '../../../models/triggerModels';
import { PlaylistElement } from '../../../models/playlistModels';
import { isObject } from 'lodash';
import { removeDigits } from './generalTools';
import { SMILDynamicEnum } from '../../../enums/dynamicEnums';

export function getDynamicPlaylistAndId(
	dynamicPlaylistConfig: DynamicPlaylist,
	smilObject: SMILFileObject,
): {
	dynamicPlaylistId: string | undefined;
	dynamicMedia: DynamicPlaylistObject | undefined;
} {
	const dynamicConfigArray = dynamicPlaylistConfig.data.split(',');
	let dynamicPlaylistId = undefined;
	let dynamicMedia = undefined;

	for (const config of dynamicConfigArray) {
		if (smilObject.dynamic[config]) {
			dynamicPlaylistId = config;
			dynamicMedia = smilObject.dynamic[config];
		}
	}

	return {
		dynamicPlaylistId,
		dynamicMedia,
	};
}

export function getDynamicTagsFromPlaylist(playlist: PlaylistElement | PlaylistElement[], _dynamicTags: string[] = []) {
	const dynamicTags = _dynamicTags;
	for (let [key, loopValue] of Object.entries(playlist)) {
		let value = loopValue as {
			data: string;
		};
		if (!isObject(value)) {
			continue;
		}
		if (removeDigits(key) === SMILDynamicEnum.emitDynamic) {
			dynamicTags.push(value.data);
		}
		getDynamicTagsFromPlaylist(value as PlaylistElement | PlaylistElement[], dynamicTags);
	}

	return dynamicTags;
}
