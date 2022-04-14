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
} from '../../../models/playlistModels';
import { getFileName } from '../../files/tools';
import { DeviceModels } from '../../../enums/deviceEnums';
import Debug from 'debug';
import { RegionAttributes, RegionsObject } from '../../../models/xmlJsonModels';
import { XmlTags } from '../../../enums/xmlEnums';
import { SMILEnums, parentGenerationRemove } from '../../../enums/generalEnums';
import { parseNestedRegions } from '../../xmlParser/tools';
import { SMILAudio, SMILImage, SMILVideo, SMILWidget, VideoParams } from '../../../models/mediaModels';

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
						resultObject.width = Math.floor(document.documentElement.clientWidth * parseInt(resultObject.width) / 100);
						break;
					case 'height':
						resultObject.height = Math.floor(document.documentElement.clientHeight * parseInt(resultObject.height) / 100);
						break;
					case 'left':
						resultObject.left = Math.floor(document.documentElement.clientWidth * parseInt(resultObject.left) / 100);
						break;
					case 'top':
						resultObject.top = Math.floor(document.documentElement.clientHeight * parseInt(resultObject.top) / 100);
						break;
					case 'bottom':
						resultObject.top = Math.floor(document.documentElement.clientHeight -
							(document.documentElement.clientHeight * parseInt(resultObject.bottom) / 100 + parseInt(resultObject.height)));
						delete resultObject.bottom;
						break;
					case 'right':
						resultObject.left = Math.floor(document.documentElement.clientWidth -
							(document.documentElement.clientWidth * parseInt(resultObject.right) / 100 + parseInt(resultObject.width)));
						delete resultObject.right;
						break;
					default:
					// unhandled attribute
				}
				return;
			}

			switch (attr) {
				case 'bottom':
					resultObject.top = document.documentElement.clientHeight - (parseInt(resultObject.bottom) + parseInt(resultObject.height));
					delete resultObject.bottom;
					break;
				case 'right':
					resultObject.left = document.documentElement.clientWidth - (parseInt(resultObject.right) + parseInt(resultObject.width));
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
	let regionInfo = <RegionAttributes> get(regionObject.region, regionName, regionObject.rootLayout);
	// unify regionName for further uses in code ( xml:id -> regionName )
	if (regionInfo.hasOwnProperty(XmlTags.regionNameAlias)) {
		regionInfo.regionName = <string> regionInfo[XmlTags.regionNameAlias];
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
		...(!isNil(regionInfo.top) && {top: parseInt(String(regionInfo.top))}),
		...(!isNil(regionInfo.left) && {left: parseInt(String(regionInfo.left))}),
		width: parseInt(String(regionInfo.width)),
		height: parseInt(String(regionInfo.height)),
	};
	return regionInfo;
}

/**
 * extracts additional css tag which are stored directly in video, image etc.. and not in regionInfo
 * @param value - represents SMIL media file object
 */
export function extractAdditionalInfo(value: SMILVideo | SMILAudio | SMILWidget | SMILImage):
	SMILVideo | SMILAudio | SMILWidget | SMILImage {
	// extract additional css info which are not specified in region tag.
	Object.keys(value).forEach((attr: string) => {
		if (XmlTags.additionalCssExtract.includes(attr)) {
			value.regionInfo[attr] = get(value, attr);
		}
	});

	return value;
}

// seq-6a985ce1ebe94055895763ce85e1dcaf93cd9620
export function generateParentId(tagName: string, value: PlaylistElement): string {
	try {
		let clone = cloneDeep(value);
		removeNestedProperties(clone, parentGenerationRemove);
		return `${tagName}-${hashSortCoerce.hash(inspect(clone))}`;
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
	// no element was played before ( trigger case )
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

export async function sleep(ms: number): Promise<object> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}
