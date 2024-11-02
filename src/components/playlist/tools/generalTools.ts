/* tslint:disable: missing whitespace */
import get = require('lodash/get');
import isNil = require('lodash/isNil');
import unset = require('lodash/unset');
import isObject = require('lodash/isObject');
import { inspect } from 'util';
import cloneDeep = require('lodash/cloneDeep');
import moment from 'moment';

const hasher = require('node-object-hash');

import {
	BackupPlaylist,
	CurrentlyPlayingRegion,
	PlaylistElement,
	RandomPlaylist,
} from '../../../models/playlistModels';
import { getFileName } from '../../files/tools';
import { DeviceModels } from '../../../enums/deviceEnums';
import Debug from 'debug';
import { RegionAttributes, RegionsObject } from '../../../models/xmlJsonModels';
import { XmlTags } from '../../../enums/xmlEnums';
import { SMILEnums, parentGenerationRemove, randomPlaylistPlayableTagsRegex } from '../../../enums/generalEnums';
import { parseNestedRegions } from '../../xmlParser/tools';
import { SMILAudio, SMILImage, SMILVideo, SMILWidget, VideoParams } from '../../../models/mediaModels';
import { difference, omit } from 'lodash';

export const debug = Debug('@signageos/smil-player:playlistProcessor');
export const hashSortCoerce = hasher({ alg: 'md5' });

export function generateElementId(filepath: string, regionName: string, key: string): string {
	return `${getFileName(filepath)}-${regionName}-${key}`;
}

export function getStringToIntDefault(value: string): number {
	return parseInt(value) || 0;
}

export function removeWhitespace(str: string) {
	return str.replace(/\s/g, '');
}

export function checkSlowDevice(deviceType: string): boolean {
	for (const type of DeviceModels.slowerDevices) {
		if (deviceType.startsWith(type)) {
			return true;
		}
	}
	return false;
}

export function getLastArrayItem(array: any[]): any {
	return array[array.length - 1];
}

export function removeLastArrayItem(array: any[]): any[] {
	return array.slice(0, array.length - 1);
}

/**
 * set correct dimensions to work on all displays correctly, changes values from % to fix numbers ( 50% -> 800px )
 * recalculates bottom position to top to work properly with signageOs videos
 * @param regionInfo - represents object with information about dimensions of region specified in smil file
 */
export function fixVideoDimension(regionInfo: RegionAttributes): RegionAttributes {
	const resultObject: any = cloneDeep(regionInfo);
	Object.keys(resultObject).forEach((attr: string) => {
		// sos video does not support values in %
		if (XmlTags.cssElementsPosition.includes(attr)) {
			if (resultObject[attr].indexOf('%') > 0) {
				switch (attr) {
					case 'width':
						resultObject.width = Math.floor(
							(document.documentElement.clientWidth * parseInt(resultObject.width)) / 100,
						);
						break;
					case 'height':
						resultObject.height = Math.floor(
							(document.documentElement.clientHeight * parseInt(resultObject.height)) / 100,
						);
						break;
					case 'left':
						resultObject.left = Math.floor(
							(document.documentElement.clientWidth * parseInt(resultObject.left)) / 100,
						);
						break;
					case 'top':
						resultObject.top = Math.floor(
							(document.documentElement.clientHeight * parseInt(resultObject.top)) / 100,
						);
						break;
					case 'bottom':
						resultObject.top = Math.floor(
							document.documentElement.clientHeight -
								((document.documentElement.clientHeight * parseInt(resultObject.bottom)) / 100 +
									parseInt(resultObject.height)),
						);
						delete resultObject.bottom;
						break;
					case 'right':
						resultObject.left = Math.floor(
							document.documentElement.clientWidth -
								((document.documentElement.clientWidth * parseInt(resultObject.right)) / 100 +
									parseInt(resultObject.width)),
						);
						delete resultObject.right;
						break;
					default:
					// unhandled attribute
				}
				return;
			}

			switch (attr) {
				case 'bottom':
					resultObject.top =
						document.documentElement.clientHeight -
						(parseInt(resultObject.bottom) + parseInt(resultObject.height));
					delete resultObject.bottom;
					break;
				case 'right':
					resultObject.left =
						document.documentElement.clientWidth -
						(parseInt(resultObject.right) + parseInt(resultObject.width));
					delete resultObject.right;
					break;
				default:
				// unhandled attribute
			}
		}
	});

	return resultObject;
}

export function getRegionInfo(regionObject: RegionsObject, regionName: string): RegionAttributes {
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
	debug('Getting region info: %O for region name: %s', regionInfo, regionName);
	regionInfo = {
		...regionInfo,
		...(!isNil(regionInfo.top) && { top: parseInt(String(regionInfo.top)) }),
		...(!isNil(regionInfo.left) && { left: parseInt(String(regionInfo.left)) }),
		width: parseInt(String(regionInfo.width)),
		height: parseInt(String(regionInfo.height)),
	};
	return regionInfo;
}

/**
 * extracts additional css tag which are stored directly in video, image etc.. and not in regionInfo
 * @param value - represents SMIL media file object
 */
export function extractAdditionalInfo(
	value: SMILVideo | SMILAudio | SMILWidget | SMILImage,
): SMILVideo | SMILAudio | SMILWidget | SMILImage {
	// extract additional css info which are not specified in region tag.
	Object.keys(value).forEach((attr: string) => {
		if (XmlTags.additionalCssExtract.includes(attr)) {
			value.regionInfo[attr] = get(value, attr);
		}
	});

	return value;
}

/**
 * There are two ways of computing sync index for elements in playlist: For dynamic playlists
 * it takes local localRegionSyncIndex meaning that it is increment
 * for each seq tag separately. For generic playlists it takes globalRegionSyncIndex which is incremented for each region separately.
 * @param regionSyncIndex
 * @param regionName
 */
export function computeSyncIndex(
	regionSyncIndex: { [key: string]: number },
	regionName: string,
): { [key: string]: number } {
	if (isNil(regionSyncIndex[regionName])) {
		regionSyncIndex[regionName] = 0;
	}

	regionSyncIndex[regionName]++;
	return regionSyncIndex;
}

// seq-6a985ce1ebe94055895763ce85e1dcaf93cd9620
export function generateParentId(tagName: string, value: PlaylistElement): string {
	try {
		debug('Generating parent id for: %s', tagName, value);
		let clone = cloneDeep(value);
		clone = orderJsonObject(clone);
		removeNestedProperties(clone, parentGenerationRemove);
		const parent = `${tagName}-${hashSortCoerce.hash(inspect(clone))}`;
		debug('Generated parent id: %s', parent);
		return parent;
	} catch (err) {
		debug('Error during parent generation: %O', err);
		return `${tagName}-undefined`;
	}
}

export function removeNestedProperties(object: PlaylistElement, propertiesArray: string[]): void {
	for (let [objKey, objValue] of Object.entries(object)) {
		if (propertiesArray.includes(objKey)) {
			unset(object, objKey);
		}
		if (isObject(objValue)) {
			removeNestedProperties(objValue, propertiesArray);
		}
	}
}

export function generateBackupImagePlaylist(imageUrl: string, repeatCount: string): BackupPlaylist {
	return {
		seq: {
			repeatCount: repeatCount,
			img: {
				src: imageUrl,
				dur: '10',
				localFilePath: '',
			},
		},
	};
}

export function getDefaultRegion() {
	return {
		rootLayout: {
			width: `${document.documentElement.clientWidth}`,
			height: `${document.documentElement.clientHeight}`,
			top: `0`,
			left: `0`,
			regionName: SMILEnums.defaultRegion,
		},
	};
}

export function getDefaultVideoParams(): VideoParams {
	return ['', 0, 0, 0, 0, 'RTP'];
}

export function getIndexOfPlayingMedia(currentlyPlaying: CurrentlyPlayingRegion[]): number {
	debug('getting index of currently playing priority: %O ', currentlyPlaying);
	// no element was played before ( trigger/dynamic playlist case )
	if (isNil(currentlyPlaying)) {
		return 0;
	}
	return currentlyPlaying.findIndex((element) => {
		return element.player?.playing === true;
	});
}

export function generateCurrentDate(utc: boolean) {
	if (utc) {
		return moment().utc();
	}
	return moment();
}

export function removeDigits(expr: string): string {
	return expr.replace(/[0-9]/g, '');
}

export async function sleep(ms: number): Promise<void> {
	let timeoutId;
	await new Promise((resolve) => {
		timeoutId = setTimeout(resolve, ms);
	});

	clearTimeout(timeoutId);
}

export function orderJsonObject(jsonObject: { [key in string]: unknown }): { [key in string]: unknown } {
	const ordered = Object.keys(jsonObject)
		.sort()
		.reduce((obj: { [objKey in string]: unknown }, key) => {
			obj[key] = jsonObject[key];
			return obj;
		}, {});

	return ordered;
}

export function shuffleObject(playlist: { [key in string]: unknown }): { [key in string]: unknown } {
	let shuffledPlaylist: {
		[key in string]: unknown;
	} = {};
	let keys = Object.keys(playlist);
	keys.sort(() => Math.random() - 0.5);
	keys.forEach((key) => {
		shuffledPlaylist[key] = playlist[key];
	});
	return shuffledPlaylist;
}

export function pickRandomOne(playlist: { [key in string]: unknown }) {
	const localPlaylist = cloneDeep(playlist);
	const playableParts = Object.keys(localPlaylist).filter((v) => randomPlaylistPlayableTagsRegex.test(v));
	let picked = playableParts[Math.floor(Math.random() * playableParts.length)];
	// case playmode is set seq/par containing other seq/par tags and not directly img, video etc...
	if (Array.isArray(localPlaylist[picked])) {
		const pickedWithIndex = `${picked}[${Math.floor(
			Math.random() * (localPlaylist[picked] as Array<{ [key in string]: unknown }>).length,
		)}]`;
		const finalObject: { [key in string]: unknown } = omit(localPlaylist, pickedWithIndex);
		finalObject[picked] = (finalObject[picked] as Array<{ [key in string]: unknown }>).filter((elem) => elem);
		return finalObject;
	}
	const diff = difference(playableParts, [picked]);
	return omit(localPlaylist, diff);
}

export function getNextElementToPlay(
	playlist: { [key in string]: unknown },
	randomPlaylistInfo: RandomPlaylist,
	parent: string,
) {
	if (!randomPlaylistInfo[parent]) {
		randomPlaylistInfo[parent] = {
			previousIndex: 0,
		};
	}
	const localPlaylist = cloneDeep(playlist);
	const playableParts = Object.keys(localPlaylist).filter((v) => randomPlaylistPlayableTagsRegex.test(v));
	const picked = playableParts[randomPlaylistInfo[parent].previousIndex++ % playableParts.length];
	const diff = difference(playableParts, [picked]);
	return omit(localPlaylist, diff);
}

export function processRandomPlayMode(
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
			debug('No valid playMode specified, returning original object, playMode: %s', playlist.playmode);
			return playlist;
	}
}
