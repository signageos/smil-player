/* tslint:disable:Unnecessary semicolon missing whitespace */
import Debug from 'debug';
// @ts-ignore no ts declaration
import { JefNode } from 'json-easy-filter';
import isNil from 'lodash/isNil';
import get from 'lodash/get';
import merge from 'lodash/merge';
import isUrl from 'is-url-superb';

import { XmlTags } from '../../../enums/xmlEnums';
import { HtmlEnum } from '../../../enums/htmlEnums';
import {
	RegionAttributes,
	RegionsObject,
	RootLayout,
	SMILMetaObject,
	TransitionAttributes,
	TransitionsObject,
	XmlHeadObject,
} from '../../../models/xmlJsonModels';
import { SMILMediaSingle } from '../../../models/mediaModels';
import { SMILPlaylist } from '../../../models/playlistModels';
import { DownloadsList } from '../../../models/filesModels';
import {
	DynamicPlaylistList,
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
import { SMILDynamicEnum } from '../../../enums/dynamicEnums';
import { smilLogging } from '../../../enums/fileEnums';
import cloneDeep = require('lodash/cloneDeep');
import { SMILScheduleEnum } from '../../../enums/scheduleEnums';

export const debug = Debug('@signageos/smil-player:xmlParser');

export function containsElement(arr: SMILMediaSingle[], fileSrc: string): boolean {
	return (
		arr.filter(function (elem: SMILMediaSingle) {
			return 'src' in elem && elem.src === fileSrc;
		}).length > 0
	);
}

export function parseNestedRegions(paramValue: RegionAttributes): RegionAttributes {
	if (!Array.isArray(paramValue.region)) {
		paramValue.region = [paramValue.region];
	}
	const value = cloneDeep(paramValue);
	for (let [, innerValue] of Object.entries(value.region)) {
		for (let [innerRegionKey] of Object.entries(innerValue)) {
			// if top and left do not exist on nested region, set default value 0
			innerValue.top = innerValue.top || 0;
			innerValue.left = innerValue.left || 0;
			if (XmlTags.cssElementsPosition.includes(innerRegionKey)) {
				switch (innerRegionKey) {
					case HtmlEnum.width:
						if (innerValue.width.indexOf('%') > -1) {
							innerValue.width = Math.floor((value.width * parseInt(innerValue.width)) / 100);
							break;
						}
						innerValue.width = parseInt(innerValue.width);
						break;
					case HtmlEnum.height:
						if (innerValue.height.indexOf('%') > -1) {
							innerValue.height = Math.floor((value.height * parseInt(innerValue.height)) / 100);
							break;
						}
						innerValue.height = parseInt(innerValue.height);
						break;
					case HtmlEnum.left:
						if (innerValue.left.indexOf('%') > -1) {
							innerValue.left =
								Math.floor((value.width * parseInt(innerValue.left)) / 100) +
								parseInt(String(value.left));
							break;
						}
						innerValue.left = parseInt(String(value.left)) + parseInt(innerValue.left) || 0;
						break;
					case HtmlEnum.top:
						if (innerValue.top.indexOf('%') > -1) {
							innerValue.top =
								Math.floor((value.height * parseInt(innerValue.top)) / 100) +
								parseInt(String(value.top));
							break;
						}
						innerValue.top = parseInt(String(value.top)) + parseInt(innerValue.top) || 0;
						break;
					case HtmlEnum.bottom:
						if (innerValue.bottom.indexOf('%') > -1) {
							if (innerValue.height.indexOf('%') > -1) {
								innerValue.height = String((value.height * parseInt(innerValue.height)) / 100);
							}
							innerValue.top = Math.max(
								value.top,
								Math.floor(
									value.height -
										((value.height * parseInt(innerValue.bottom)) / 100 +
											parseInt(innerValue.height)) +
										parseInt(String(value.top)),
								),
							);
							delete innerValue.bottom;
							break;
						}
						innerValue.top = Math.max(
							value.top,
							value.height -
								(parseInt(innerValue.bottom) + parseInt(innerValue.height)) +
								parseInt(String(value.top)),
						);
						delete innerValue.bottom;
						break;
					case HtmlEnum.right:
						if (innerValue.right.indexOf('%') > -1) {
							if (innerValue.width.indexOf('%') > -1) {
								innerValue.width = String((value.width * parseInt(innerValue.width)) / 100);
							}
							innerValue.left = Math.max(
								value.left,
								Math.floor(
									value.width -
										((value.width * parseInt(innerValue.right)) / 100 +
											parseInt(innerValue.width)) +
										parseInt(String(value.left)),
								),
							);
							delete innerValue.right;
							break;
						}
						innerValue.left = Math.max(
							value.left,
							value.width - (parseInt(innerValue.right) + parseInt(innerValue.width)),
						);
						delete innerValue.right;
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
		(node: { key: string; value: any; parent: { key: string; value: any } }) => {
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

			// delete dynamic playlists from playlist, triggers are played on demand
			if (get(node.value, 'begin', 'default').startsWith(SMILDynamicEnum.dynamicFormat)) {
				return node;
			}

			// delete elements which dont have correct src (url or relative path) eg: adapi:blankScreen
			if (
				(!isUrl(get(node.value, 'src', 'default')) &&
					!isRelativePath(get(node.value, 'src', 'default')) &&
					get(node.value, 'isStream') !== true) ||
				get(node.value, 'src', 'default') === ''
			) {
				return node;
			}
		},
	);

	new JefNode(playableMedia.playlist).remove(
		(node: { key: string; value: any; parent: { key: string; value: any } }) => {
			// remove all infinite loops from playlist
			if (!isNil(node.key) && XmlTags.structureTags.includes(removeDigits(node.key))) {
				foundMedia = removeNodes(node);
				if (!foundMedia) {
					return node.parent;
				}
			}
		},
	);

	new JefNode(playableMedia.playlist).remove(
		(node: { key: string; value: any; parent: { key: string; value: any } }) => {
			// remove all infinite loops from playlist
			if (node.key === 'begin' || (node.key === 'repeatCount' && node.value === 'indefinite')) {
				foundMedia = removeNodes(node);
				if (!foundMedia) {
					return node.parent;
				}
			}
		},
	);

	new JefNode(playableMedia.playlist).remove((node: { key: string; value: any }) => {
		if (node.key === 'ticker') {
			if (!node.value?.text?.some((text: any) => typeof text === 'string')) {
				console.warn('Ticker component must have "text" array with one string at least');
				return node;
			}
		}
	});
}

function removeNodes(node: { key: string; value: any; parent: { key: string; value: any } }): boolean {
	let foundMedia = false;
	new JefNode(node.parent.value).filter(
		(introNode: { key: string; value: any; parent: { key: string; value: any } }) => {
			if (
				!isNil(introNode.key) &&
				XmlTags.extractedElements
					.concat(XmlTags.textElements)
					.concat(XmlTags.dynamicPlaylist)
					.includes(removeDigits(introNode.key))
			) {
				foundMedia = true;
			}
		},
	);
	return foundMedia;
}

/**
 * traverse json object represented as tree and extracts data for media downloads and trigger objects
 * @param playableMedia
 * @param downloads
 * @param triggerList
 * @param dynamicList
 */
export function extractDataFromPlaylist(
	playableMedia: SMILPlaylist,
	downloads: DownloadsList,
	triggerList: TriggerList,
	dynamicList: DynamicPlaylistList,
) {
	new JefNode(playableMedia.playlist).filter(
		(node: { key: string; value: any; parent: { key: string; value: any } }) => {
			// detect intro element, may not exist
			if (node.key === 'end' && node.value === '__prefetchEnd.endEvent') {
				new JefNode(node.parent.value).filter(
					(introNode: { key: string; value: any; parent: { key: string; value: any } }) => {
						if (!isNil(introNode.key) && XmlTags.extractedElements.includes(removeDigits(introNode.key))) {
							debug('Intro element found: %O', introNode.parent.value);
							downloads.intro.push(introNode.parent.value);
						}
					},
				);
			}

			if (!isNil(node.key) && XmlTags.extractedElements.includes(removeDigits(node.key))) {
				// create media arrays for easy download/update check
				if (!Array.isArray(node.value)) {
					node.value = [node.value];
				}
				node.value.forEach((element: SMILMediaSingle) => {
					if (
						'src' in element &&
						!containsElement(downloads[removeDigits(node.key)], element.src as string)
					) {
						// @ts-ignore
						downloads[removeDigits(node.key)].push(element);
					}
				});
			}

			if (get(node.value, 'begin', 'default').startsWith(SMILTriggersEnum.triggerFormat)) {
				triggerList.triggers[node.value.begin] = merge(
					triggerList.triggers[node.value.begin],
					node.parent.value,
				);
			}

			if (get(node.value, 'begin', 'default').startsWith(SMILDynamicEnum.dynamicFormat)) {
				// TODO: find a better way to parse arrays and object of dynamic playlist
				if (Array.isArray(node.parent.value)) {
					dynamicList.dynamic[node.value.begin] = {
						seq: node.value,
					};
				} else {
					// one dynamic playlist in smil file, not grouped in array
					dynamicList.dynamic[node.value.begin] = merge(
						dynamicList.dynamic[node.value.begin],
						node.parent.value,
					);
				}
			}
		},
	);
}

export function parseHeadInfo(metaObjects: XmlHeadObject, regions: RegionsObject, triggerList: TriggerList) {
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
		if (
			metaRecord.hasOwnProperty(SMILEnums.metaContent) ||
			metaRecord.hasOwnProperty(SMILEnums.metaContentRefresh)
		) {
			// Support both content and contentRefresh parameters
			const refreshValue = metaRecord.contentRefresh || metaRecord.content;
			regions.refresh.refreshInterval = refreshValue
				? (parseInt(refreshValue) || SMILEnums.defaultRefresh) * 1000
				: SMILEnums.defaultRefresh * 1000;
			regions.refresh.expr = 'expr' in metaRecord ? metaRecord.expr : undefined;
			// timeout for last-modified header check
			regions.refresh.timeOut = parseInt(metaRecord.timeOut!) || SMILScheduleEnum.fileCheckTimeout;
			regions.refresh.fallbackToPreviousPlaylist = metaRecord.fallbackToPreviousPlaylist === true;
		}

		if (metaRecord.hasOwnProperty(SMILEnums.metaSmilRefresh)) {
			regions.refresh.smilFileRefresh = metaRecord.smilFileRefresh
				? (parseInt(metaRecord.smilFileRefresh) || regions.refresh.refreshInterval) * 1000
				: regions.refresh.refreshInterval;
		}

		if (metaRecord.hasOwnProperty(SMILEnums.onlySmilUpdate)) {
			regions.onlySmilFileUpdate = metaRecord.onlySmilUpdate === true;
		}
		if (metaRecord.hasOwnProperty(SMILEnums.metaLog)) {
			regions.logger = {
				enabled: metaRecord.log === true,
				type: metaRecord.type === smilLogging.proofOfPlay ? smilLogging.proofOfPlay : smilLogging.standard,
				endpoint: metaRecord.endpoint,
			};
		}
		if (metaRecord.hasOwnProperty(SMILEnums.syncServer)) {
			regions.syncServerUrl = metaRecord.syncServerUrl;
		}
		if (metaRecord.hasOwnProperty(SMILEnums.defaultRepeatCount)) {
			regions.defaultRepeatCount = metaRecord.defaultRepeatCount;
		}
		if (metaRecord.hasOwnProperty(SMILEnums.defaultTransition)) {
			regions.defaultTransition = metaRecord.defaultTransition;
		}
	}
}

function parseSensorsInfo(sensors: SMILSensors): ParsedSensor[] {
	const finalSensors = [];
	if (!Array.isArray(sensors.sensor)) {
		sensors.sensor = [sensors.sensor];
	}
	for (const sensor of sensors.sensor) {
		const picked: ParsedSensor = (({ type, id, driver }) => ({ type, id, driver }))(sensor);
		// value saved in _ prefix
		if (!Array.isArray(sensor.option)) {
			sensor.option = [sensor.option];
		}
		for (const option of sensor.option) {
			picked[<string>option.name] = option._;
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

			finalTriggers[`${condition.origin}${dataSuffix}`] = isNil(finalTriggers[`${condition.origin}${dataSuffix}`])
				? {}
				: finalTriggers[`${condition.origin}${dataSuffix}`];

			finalTriggers[`${condition.origin}${dataSuffix}`].trigger = trigger.id;
			finalTriggers[`${condition.origin}${dataSuffix}`].stringCondition = stringCondition;

			finalTriggers[`${condition.origin}${dataSuffix}`].condition = isNil(
				finalTriggers[`${condition.origin}${dataSuffix}`].condition,
			)
				? []
				: finalTriggers[`${condition.origin}${dataSuffix}`].condition;

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
		refresh: {
			refreshInterval: SMILEnums.defaultRefresh * 1000,
			smilFileRefresh: SMILEnums.defaultRefresh * 1000,
			timeOut: SMILScheduleEnum.fileCheckTimeout as number,
			fallbackToPreviousPlaylist: false,
		},
		onlySmilFileUpdate: false,
		logger: {
			enabled: false,
			type: smilLogging.standard,
		},
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
					regionsObject.region[xmlObject[rootKey][index].regionName] = <RegionAttributes>(
						xmlObject[rootKey][index]
					);
				} else {
					regionsObject.region[xmlObject[rootKey][index][XmlTags.regionNameAlias]] = <RegionAttributes>(
						xmlObject[rootKey][index]
					);
				}
			});
		} else {
			// only one region/rootLayout in layout element
			if (rootKey === SMILEnums.rootLayout) {
				regionsObject.rootLayout = <RootLayout>xmlObject[rootKey];
				// add left and top values for intro play
				regionsObject.rootLayout.top = '0';
				regionsObject.rootLayout.left = '0';
				regionsObject.rootLayout.regionName = 'rootLayout';
			}

			if (rootKey === SMILEnums.region) {
				if (xmlObject[rootKey].hasOwnProperty('regionName')) {
					regionsObject.region[xmlObject[rootKey].regionName] = <RegionAttributes>xmlObject[rootKey];
				} else {
					regionsObject.region[xmlObject[rootKey][XmlTags.regionNameAlias]] = <RegionAttributes>(
						xmlObject[rootKey]
					);
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
	Object.keys(xmlObject).forEach((rootKey: string) => {
		if (rootKey === SMILEnums.transition) {
			// multiple regions in layout element
			if (Array.isArray(xmlObject[rootKey])) {
				// iterate over array of objects
				Object.keys(xmlObject[rootKey]).forEach((index: string) => {
					if (xmlObject[rootKey][index].hasOwnProperty('transitionName')) {
						transitionsObject.transition[xmlObject[rootKey][index].transitionName] = <TransitionAttributes>(
							xmlObject[rootKey][index]
						);
					} else {
						transitionsObject.transition[xmlObject[rootKey][index][XmlTags.regionNameAlias]] = <
							TransitionAttributes
						>xmlObject[rootKey][index];
					}
				});
			} else {
				if (xmlObject[rootKey].hasOwnProperty('transitionName')) {
					transitionsObject.transition[xmlObject[rootKey].transitionName] = <TransitionAttributes>(
						xmlObject[rootKey]
					);
				} else {
					transitionsObject.transition[xmlObject[rootKey][XmlTags.regionNameAlias]] = <TransitionAttributes>(
						xmlObject[rootKey]
					);
				}
			}
		}
	});

	return transitionsObject;
}
