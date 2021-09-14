import Debug from 'debug';
// @ts-ignore no ts declaration
import { JefNode } from 'json-easy-filter';
import isNil from 'lodash/isNil';
import cloneDeep = require('lodash/cloneDeep');
import get from 'lodash/get';
import merge from 'lodash/merge';
import isUrl from "is-url-superb";

import { XmlTags } from '../../../enums/xmlEnums';
import { HtmlEnum } from '../../../enums/htmlEnums';
import {
	RegionAttributes,
	RegionsObject,
	RootLayout,
	SMILMetaObject, TransitionAttributes, TransitionsObject,
	XmlHeadObject,
} from '../../../models/xmlJsonModels';
import { SMILMediaSingle } from '../../../models/mediaModels';
import { SMILPlaylist } from '../../../models/playlistModels';
import { DownloadsList } from '../../../models/filesModels';
import {
	ParsedSensor,
	ParsedTriggerInfo,
	SMILSensors,
	SMILTriggerCondition,
	SMILTriggers,
	TriggerList,
} from '../../../models/triggerModels';
import { SMILTriggersEnum } from '../../../enums/triggerEnums';
import { SMILEnums } from '../../../enums/generalEnums';
import { removeDigits } from '../../playlist/tools/generalTools';
import { isRelativePath } from '../../files/tools';

export const debug = Debug('@signageos/smil-player:xmlParseModule');

export function containsElement(arr: SMILMediaSingle[], fileSrc: string): boolean  {
	return arr.filter(function (elem: SMILMediaSingle) {
		return elem.src === fileSrc;
	}).length > 0;
}

export function parseNestedRegions(paramValue: RegionAttributes): RegionAttributes {
	if (!Array.isArray(paramValue.region)) {
		paramValue.region = [paramValue.region];
	}
	const value = cloneDeep(paramValue);
	for (let [, innerValue] of Object.entries(value.region)) {
		for (let [innerRegionKey, ] of Object.entries(<RegionAttributes> innerValue)) {
			// if top and left do not exist on nested region, set default value 0
			innerValue.top = innerValue.top || 0;
			innerValue.left = innerValue.left || 0;
			if (XmlTags.cssElementsPosition.includes(innerRegionKey)) {
				switch (innerRegionKey) {
					case HtmlEnum.width:
						if (innerValue.width.indexOf('%') > -1 ) {
							innerValue.width = Math.floor(value.width * parseInt(innerValue.width) / 100);
							break;
						}
						innerValue.width = parseInt(innerValue.width);
						break;
					case HtmlEnum.height:
						if (innerValue.height.indexOf('%') > -1 ) {
							innerValue.height = Math.floor(value.height * parseInt(innerValue.height) / 100);
							break;
						}
						innerValue.height = parseInt(innerValue.height);
						break;
					case HtmlEnum.left:
						if (innerValue.left.indexOf('%') > -1 ) {
							innerValue.left = Math.floor(value.width * parseInt(innerValue.left) / 100) + parseInt(String(value.left));
							break;
						}
						innerValue.left = parseInt(String(value.left)) + parseInt(innerValue.left) || 0;
						break;
					case HtmlEnum.top:
						if (innerValue.top.indexOf('%') > -1 ) {
							innerValue.top = Math.floor(value.height * parseInt(innerValue.top) / 100) + parseInt(String(value.top));
							break;
						}
						innerValue.top = parseInt(String(value.top)) + parseInt(innerValue.top) || 0;
						break;
					default:
						debug('Unhandled attribute found during nestedRegion parsing: %s', innerRegionKey);
				}
			}
		}
	}

	return value;
}

/**
 * removes unnecessary data from playlist ( intro, infinite loops, triggers ) so we dont need to worry about it later in the code
 * @param playableMedia
 */
export function removeDataFromPlaylist(playableMedia: SMILPlaylist) {
	let foundMedia = false;
	new JefNode(playableMedia.playlist).remove(
		(node: { key: string; value: any; parent: { key: string; value: any; } }) => {
			// delete intro from playlist, may not exist
			if (node.key === 'end' && node.value === '__prefetchEnd.endEvent') {
				return node.parent;
			}

			// delete prefetch object from playlist, may not exist
			if (node.key === 'prefetch') {
				return node.parent;
			}

			// delete triggers from playlist, triggers are played on demand
			if (get(node.value, 'begin', 'default').startsWith(SMILTriggersEnum.triggerFormat)) {
				return node;
			}

			// delete elements which dont have correct src (url or relative path) eg: adapi:blankScreen
			if ((!isUrl(get(node.value, 'src', 'default')) && !isRelativePath(get(node.value, 'src', 'default')))
			|| get(node.value, 'src', 'default') === '') {
				return node;
			}
		});

	new JefNode(playableMedia.playlist).remove(
		(node: { key: string; value: any; parent: { key: string; value: any; } }) => {
			// remove all infinite loops from playlist
			if (!isNil(node.key) && XmlTags.structureTags.includes(node.key)) {
				foundMedia = removeNodes(node);
				if (!foundMedia) {
					return node.parent;
				}
			}
		});

	new JefNode(playableMedia.playlist).remove(
		(node: { key: string; value: any; parent: { key: string; value: any; } }) => {
			// remove all infinite loops from playlist
			if (node.key === 'begin' || (node.key === 'repeatCount' && node.value === 'indefinite')) {
				foundMedia = removeNodes(node);
				if (!foundMedia) {
					return node.parent;
				}
			}
		});
}

function removeNodes(node: { key: string; value: any; parent: { key: string; value: any; } }): boolean {
	let foundMedia = false;
	new JefNode(node.parent.value).filter((introNode: { key: string; value: any; parent: { key: string; value: any; } }) => {
		if (!isNil(introNode.key)
			&& XmlTags.extractedElements.includes(removeDigits(introNode.key))) {
			foundMedia = true;
		}
	});
	return foundMedia;
}

/**
 * traverse json object represented as tree and extracts data for media downloads and trigger objects
 * @param playableMedia
 * @param downloads
 * @param triggerList
 */
export function extractDataFromPlaylist(playableMedia: SMILPlaylist, downloads: DownloadsList, triggerList: TriggerList) {
	new JefNode(playableMedia.playlist).filter(
		(node: { key: string; value: any; parent: { key: string; value: any; } }) => {
			// detect intro element, may not exist
			if (node.key === 'end' && node.value === '__prefetchEnd.endEvent') {
				new JefNode(node.parent.value).filter((introNode: { key: string; value: any; parent: { key: string; value: any; } }) => {
					if (!isNil(introNode.key)
						&& XmlTags.extractedElements.includes(removeDigits(introNode.key))) {
						debug('Intro element found: %O', introNode.parent.value);
						downloads.intro.push(introNode.parent.value);
					}
				});
			}

			if (!isNil(node.key)
				&& XmlTags.extractedElements.includes(removeDigits(node.key))) {
				// create media arrays for easy download/update check
				if (!Array.isArray(node.value)) {
					node.value = [node.value];

				}
				node.value.forEach((element: SMILMediaSingle) => {
					if (!containsElement(downloads[removeDigits(node.key)], <string> element.src)) {
						// @ts-ignore
						downloads[removeDigits(node.key)].push(element);
					}
				});
			}

			if (get(node.value, 'begin', 'default').startsWith(SMILTriggersEnum.triggerFormat)) {
				triggerList.triggers![node.value.begin!] = merge(triggerList.triggers![node.value.begin!], node.parent.value);
			}
		});
}

export function parseHeadInfo(metaObjects: XmlHeadObject, regions: RegionsObject, triggerList: TriggerList) {
	// use default value at start
	regions.refresh = SMILEnums.defaultRefresh;

	if (!isNil(metaObjects.meta)) {
		parseMetaInfo(metaObjects.meta, regions);
	}

	if (!isNil(metaObjects.sensors)) {
		triggerList.sensors = parseSensorsInfo(metaObjects.sensors);
	}

	if (!isNil(metaObjects.triggers)) {
		triggerList.triggerSensorInfo = parseTriggersInfo(metaObjects.triggers);
	}
}

function parseMetaInfo(meta: SMILMetaObject[], regions: RegionsObject) {
	if (!Array.isArray(meta)) {
		meta = [meta];
	}
	for (const metaRecord of meta) {
		if (metaRecord.hasOwnProperty(SMILEnums.metaContent)) {
			regions.refresh = parseInt(metaRecord.content) || SMILEnums.defaultRefresh;
		}
		if (metaRecord.hasOwnProperty(SMILEnums.onlySmilUpdate)) {
			regions.onlySmilFileUpdate = metaRecord.onlySmilUpdate.toLowerCase().trim() === 'true';
		}
		if (metaRecord.hasOwnProperty(SMILEnums.metaLog)) {
			regions.log = metaRecord.log === 'true';
		}
	}
}

function parseSensorsInfo(sensors: SMILSensors): ParsedSensor[] {
	const finalSensors = [];
	if (!Array.isArray(sensors.sensor)) {
		sensors.sensor = [sensors.sensor];
	}
	for (const sensor of sensors.sensor) {
		const picked: ParsedSensor = (({type, id, driver}) => ({type, id, driver}))(sensor);
		// value saved in _ prefix
		if (!Array.isArray(sensor.option)) {
			sensor.option = [sensor.option];
		}
		for (const option of sensor.option) {
			picked[<string> option.name] = option._;
		}
		finalSensors.push(picked);
	}
	return finalSensors;
}

function parseTriggersInfo(triggers: SMILTriggers): ParsedTriggerInfo {
	const finalTriggers: any = {};
	if (!Array.isArray(triggers.trigger)) {
		triggers.trigger = [triggers.trigger];
	}
	for (const trigger of triggers.trigger) {
		let stringCondition = '';
		for (const condition of trigger.condition as Array<SMILTriggerCondition>) {
			if (typeof condition === 'string') {
				stringCondition = condition;
				continue;
			}

			const dataSuffix = !isNil(condition.data) ? `-${condition.data}` : '';

			finalTriggers[`${condition.origin}${dataSuffix}`]
				= isNil(finalTriggers[`${condition.origin}${dataSuffix}`]) ? {} : finalTriggers[`${condition.origin}${dataSuffix}`];

			finalTriggers[`${condition.origin}${dataSuffix}`].trigger = trigger.id;
			finalTriggers[`${condition.origin}${dataSuffix}`].stringCondition = stringCondition;

			finalTriggers[`${condition.origin}${dataSuffix}`].condition
				= isNil(finalTriggers[`${condition.origin}${dataSuffix}`].condition) ?
				[] : finalTriggers[`${condition.origin}${dataSuffix}`].condition;

			finalTriggers[`${condition.origin}${dataSuffix}`].condition.push({
				action: condition.action,
			});
		}
	}
	return finalTriggers;
}

export function extractRegionInfo(xmlObject: RegionsObject): RegionsObject {
	const regionsObject: RegionsObject = {
		region: {},
		refresh: 0,
		onlySmilFileUpdate: false,
		log: false,
	};
	Object.keys(xmlObject).forEach((rootKey: any) => {
		// multiple regions in layout element
		if (Array.isArray(xmlObject[rootKey])) {
			// iterate over array of objects
			Object.keys(xmlObject[rootKey]).forEach((index: any) => {
				//creates structure like this
				// {
				//     "region": {
				//         "video": {
				//             "regionName": "video",
				//                 "left": "0",
				//                 "top": "0",
				//                 "width": "1080",
				//                 "height": "1920",
				//                 "z-index": "1",
				//                 "backgroundColor": "#FFFFFF",
				//                 "mediaAlign": "center"
				//         },
				//         "custom": {
				//             "regionName": "custom",
				//                 "left": "0",
				//                 "top": "0",
				//                 "width": "1080",
				//                 "height": "1920",
				//                 "z-index": "1",
				//                 "backgroundColor": "#FFFFFF",
				//                 "mediaAlign": "center"
				//         }
				//     }
				// }
				if (xmlObject[rootKey][index].hasOwnProperty('regionName')) {
					regionsObject.region[xmlObject[rootKey][index].regionName] = <RegionAttributes> xmlObject[rootKey][index];
				} else {
					regionsObject.region[xmlObject[rootKey][index][XmlTags.regionNameAlias]] = <RegionAttributes> xmlObject[rootKey][index];

				}
			});
		} else {
			// only one region/rootLayout in layout element
			if (rootKey === SMILEnums.rootLayout) {
				regionsObject.rootLayout = <RootLayout> xmlObject[rootKey];
				// add left and top values for intro play
				regionsObject.rootLayout.top = '0';
				regionsObject.rootLayout.left = '0';
				regionsObject.rootLayout.regionName = 'rootLayout';
			}

			if (rootKey === SMILEnums.region) {
				if (xmlObject[rootKey].hasOwnProperty('regionName')) {
					regionsObject.region[xmlObject[rootKey].regionName] = <RegionAttributes> xmlObject[rootKey];
				} else {
					regionsObject.region[xmlObject[rootKey][XmlTags.regionNameAlias]] = <RegionAttributes> xmlObject[rootKey];

				}
			}
		}
	});

	return regionsObject;
}

export function extractTransitionsInfo(xmlObject: RegionsObject): TransitionsObject {
	const transitionsObject: TransitionsObject = {
		transition: {},
	};
	Object.keys(xmlObject).forEach((rootKey: any) => {
		if (rootKey === SMILEnums.transition) {
			// multiple regions in layout element
			if (Array.isArray(xmlObject[rootKey])) {
				// iterate over array of objects
				Object.keys(xmlObject[rootKey]).forEach((index: any) => {
					if (xmlObject[rootKey][index].hasOwnProperty('transitionName')) {
						transitionsObject.transition[xmlObject[rootKey][index].regionName] = <TransitionAttributes> xmlObject[rootKey][index];
					} else {
						transitionsObject.transition[xmlObject[rootKey][index][XmlTags.regionNameAlias]] = <TransitionAttributes> xmlObject[rootKey][index];

					}
				});
			} else {
				if (xmlObject[rootKey].hasOwnProperty('transitionName')) {
					transitionsObject.transition[xmlObject[rootKey].transition] = <TransitionAttributes> xmlObject[rootKey];
				} else {
					transitionsObject.transition[xmlObject[rootKey][XmlTags.regionNameAlias]] = <TransitionAttributes> xmlObject[rootKey];
				}
			}
		}
	});

	return transitionsObject;
}
