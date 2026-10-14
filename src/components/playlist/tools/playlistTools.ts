/* tslint:disable: missing whitespace */
import get = require('lodash/get');
import isNil = require('lodash/isNil');
import { Log } from '../../../logger';
import { CurrentlyPlayingRegion, PlaylistElement, RandomPlaylist } from '../../../models/playlistModels';
import { RegionAttributes, RegionsObject } from '../../../models/xmlJsonModels';
import { XmlTags } from '../../../enums/xmlEnums';
import { SMILEnums } from '../../../enums/generalEnums';
import { createXmlTools } from '../../xmlParser/tools';
import {
	fixVideoDimension,
	getNextElementToPlay,
	hashSortCoerce,
	pickRandomOne,
	projectForParentGeneration,
	shuffleObject,
} from './generalTools';

/** The logging helpers that used to live in generalTools. Pure helpers stay there as plain exports. */
export function createPlaylistTools(log: Log) {
	const { parseNestedRegions } = createXmlTools(log);

	function getRegionInfo(regionObject: RegionsObject, regionName: string): RegionAttributes {
		let regionInfo = <RegionAttributes>get(regionObject.region, regionName, regionObject.rootLayout);
		// unify regionName for further uses in code ( xml:id -> regionName )
		if (regionInfo.hasOwnProperty(XmlTags.regionNameAlias)) {
			regionInfo.regionName = <string>regionInfo[XmlTags.regionNameAlias];
			delete regionInfo[XmlTags.regionNameAlias];
		}

		regionInfo = fixVideoDimension(regionInfo);
		// fix nested regions and its values for dynamic use
		if (regionInfo.hasOwnProperty(SMILEnums.region)) {
			regionInfo = parseNestedRegions(regionInfo);
		}
		log.debug('[general] getting region info: region=%s', regionName);
		regionInfo = {
			...regionInfo,
			...(!isNil(regionInfo.top) && { top: parseInt(String(regionInfo.top)) }),
			...(!isNil(regionInfo.left) && { left: parseInt(String(regionInfo.left)) }),
			width: parseInt(String(regionInfo.width)),
			height: parseInt(String(regionInfo.height)),
		};
		return regionInfo;
	}

	// seq-6a985ce1ebe94055895763ce85e1dcaf93cd9620
	// Element identity — MUST be identical for the same SMIL element on every traversal
	// pass (priority peer detection). Device-local: sync coordination keys are built from
	// regionName + syncIndex, never from this hash.
	function generateParentId(tagName: string, value: PlaylistElement): string {
		try {
			return `${tagName}-${hashSortCoerce.hash(projectForParentGeneration(value))}`;
		} catch (err) {
			log.error('[general] error during parent generation: %O', err);
			// per-shape fallback — the old shared `${tagName}-undefined` collapsed ALL
			// failures into one identity
			return `${tagName}-fallback-${Object.keys(value || {}).join('.')}`;
		}
	}

	function getIndexOfPlayingMedia(currentlyPlaying: CurrentlyPlayingRegion[]): number {
		log.debug('[general] getting index of playing priority: %O', currentlyPlaying);
		// no element was played before ( trigger/dynamic playlist case )
		if (isNil(currentlyPlaying)) {
			return 0;
		}
		return currentlyPlaying.findIndex((element) => {
			return element.player?.playing === true;
		});
	}

	function processRandomPlayMode(
		playlist: { [key in string]: string },
		randomPlaylistInfo: RandomPlaylist,
		parent: string,
	) {
		switch (playlist.playMode.toLowerCase()) {
			case 'random':
				return shuffleObject(playlist);
			case 'random_one':
				return pickRandomOne(playlist);
			case 'one':
				return getNextElementToPlay(playlist, randomPlaylistInfo, parent);
			default:
				log.debug('[general] no valid playMode, returning original: playMode=%s', playlist.playmode);
				return playlist;
		}
	}

	return { getRegionInfo, generateParentId, getIndexOfPlayingMedia, processRandomPlayMode };
}
export type PlaylistTools = ReturnType<typeof createPlaylistTools>;
