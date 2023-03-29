import { DynamicPlaylist } from '../../../models/dynamicModels';
import { SMILFileObject } from '../../../models/filesModels';
import { DynamicPlaylistObject } from '../../../models/triggerModels';

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
