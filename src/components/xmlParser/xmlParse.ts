import * as xml2js from 'xml2js';
// @ts-ignore
import { JefNode } from 'json-easy-filter';
import get from 'lodash/get';
import merge from 'lodash/merge';
import {
	RegionAttributes,
	RegionsObject,
	RootLayout,
	DownloadsList,
	SMILFileObject,
	XmlSmilObject,
	SMILMediaSingle,
	XmlHeadObject,
	SMILPlaylist,
	SMILSensors,
	SMILTriggers,
	SMILTriggerCondition, SMILMetaObject, ParsedSensor, ParsedTriggerInfo, TriggerList,
} from '../../models';
import { SMILEnums, SMILTriggersEnum, XmlTags } from '../../enums';
import { debug, containsElement } from './tools';
import isNil = require('lodash/isNil');

async function parseXml(xmlFile: string): Promise<SMILFileObject> {
	const downloads: DownloadsList = {
		video: [],
		img: [],
		ref: [],
		audio: [],
		intro: [],
	};
	const playableMedia = {
		playlist: {},
	};
	const triggerList: TriggerList = {
		sensors: [],
		triggerSensorInfo: {},
		triggers: {},
	};
	debug('Parsing xml string to json : %O', xmlFile);
	const xmlObject: XmlSmilObject = await xml2js.parseStringPromise(xmlFile, {
		mergeAttrs: true,
		explicitArray: false,
	});

	debug('Xml file parsed to json object: %O', xmlObject);

	const regions = <RegionsObject> extractRegionInfo(xmlObject.smil.head.layout);

	parseHeadInfo(xmlObject.smil.head, regions, triggerList);
	playableMedia.playlist = <SMILPlaylist> xmlObject.smil.body;

	// traverse json as tree of nodes
	new JefNode(playableMedia.playlist).filter(
		(node: { key: string; value: any; parent: { key: string; value: any; } }) => {
		// detect intro element, may not exist
		if (node.key === 'end' && node.value === '__prefetchEnd.endEvent') {
			new JefNode(node.parent.value).filter((introNode: { key: string; value: any; parent: { key: string; value: any; } }) => {
				if (XmlTags.extractedElements.includes(introNode.key)) {
					debug('Intro element found: %O', introNode.parent.value);
					downloads.intro.push(introNode.parent.value);
				}
			});
		}
		if (XmlTags.extractedElements.includes(node.key)) {
			// create media arrays for easy download/update check
			if (!Array.isArray(node.value)) {
				node.value = [node.value];

			}
			node.value.forEach((element: SMILMediaSingle) => {
				if (!containsElement(downloads[node.key], <string> element.src)) {
					// @ts-ignore
					downloads[node.key].push(element);
				}
			});
		}

		if (get(node.value, 'begin', 'default').startsWith(SMILTriggersEnum.triggerFormat)) {
			triggerList.triggers![node.value.begin!] = merge(triggerList.triggers![node.value.begin!], node.value);
		}
	});

	debug('Extracted regions object: %O', regions);
	debug('Extracted playableMedia object: %O', playableMedia);
	debug('Extracted downloads object: %O', downloads);

	return Object.assign({}, regions, playableMedia, downloads, triggerList);
}

function parseHeadInfo(metaObjects: XmlHeadObject, regions: RegionsObject, triggerList: TriggerList) {
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
		if (metaRecord.hasOwnProperty(SMILTriggersEnum.metaContent)) {
			regions.refresh = parseInt(metaRecord.content) || SMILEnums.defaultRefresh;
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
			finalTriggers[`${condition.origin}-${condition.data}`]
				= isNil(finalTriggers[`${condition.origin}-${condition.data}`]) ? {} : finalTriggers[`${condition.origin}-${condition.data}`];

			finalTriggers[`${condition.origin}-${condition.data}`].trigger = trigger.id;
			finalTriggers[`${condition.origin}-${condition.data}`].stringCondition = stringCondition;

			finalTriggers[`${condition.origin}-${condition.data}`].condition
				= isNil(finalTriggers[`${condition.origin}-${condition.data}`].condition) ?
				[] : finalTriggers[`${condition.origin}-${condition.data}`].condition;

			finalTriggers[`${condition.origin}-${condition.data}`].condition.push({
				action: condition.action,
			});
		}
	}
	return finalTriggers;
}

function extractRegionInfo(xmlObject: RegionsObject): RegionsObject {
	const regionsObject: RegionsObject = {
		region: {},
		refresh: 0,
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

export async function processSmil(xmlFile: string): Promise<SMILFileObject> {
	return await parseXml(xmlFile);
}
