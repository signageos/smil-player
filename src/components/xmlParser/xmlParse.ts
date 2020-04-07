import * as xml2js from 'xml2js';
import pick = require('lodash/pick');
import pickBy = require('lodash/pickBy');
import isObject = require('lodash/isObject');
import each = require('lodash/each');
import reduce = require('lodash/reduce');
import isEmpty = require('lodash/isEmpty');
// @ts-ignore
import { JefNode } from 'json-easy-filter';
import { DOMParser } from 'xmldom';
// import { promises as fsPromise } from 'fs';
import {
	RegionAttributes,
	RegionsObject,
	RootLayout,
	DownloadsList,
	SMILFileObject,
	SMILPlaylist,
	XmlSmilObject,
} from '../../models';
import { SMILEnemus } from '../../enums';
import { defaults as config } from '../../config';
import { debug } from './tools';

async function parseXml(xmlFile: string): Promise<SMILFileObject> {
	const downloads: DownloadsList = {
		video: [],
		img: [],
		ref: [],
		audio: [],
	};
	// const xmlFile: string = await fsPromise.readFile('./SMIL/99.smil', 'utf8');
	const xmlFileSerialized: Document = new DOMParser().parseFromString(xmlFile, "text/xml");
	debug('Xml string serialized : %O', xmlFileSerialized);
	const xmlObject: XmlSmilObject = await xml2js.parseStringPromise(xmlFileSerialized, {
		mergeAttrs: true,
		explicitArray: false,
	});

	debug('Xml file parsed to json object: %O', xmlObject);

	const regions = <RegionsObject> extractRegionInfo(xmlObject.smil.head.layout);
	const playableMedia = <SMILPlaylist> extractBodyContent(xmlObject.smil.body);

	new JefNode(playableMedia.playlist).filter(function (node: { key: string; value: any; }) {
		if (config.constants.extractedElements.includes(node.key)) {
			// create media arrays for easy download/update check
			if (Array.isArray(node.value)) {
				// @ts-ignore
				downloads[node.key] = downloads[node.key].concat(node.value);
			} else {
				// @ts-ignore
				downloads[node.key].push(node.value);
			}
		}
	});

	debug('Extracted regions object: %O', regions);
	debug('Extracted playableMedia object: %O', playableMedia);

	return Object.assign({}, regions, playableMedia, downloads);
}

function extractRegionInfo(xmlObject: object): RegionsObject {
	const regionsObject: RegionsObject = {
		region: {},
	};
	Object.keys(xmlObject).forEach((rootKey) => {
		// multiple regions in layout element
		// @ts-ignore
		if (Array.isArray(xmlObject[rootKey])) {
			// iterate over array of objects
			// @ts-ignore
			Object.keys(xmlObject[rootKey]).forEach((index) => {
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
				// @ts-ignore
				if (xmlObject[rootKey][index].hasOwnProperty('regionName')) {
					// @ts-ignore
					regionsObject.region[xmlObject[rootKey][index].regionName] = <RegionAttributes> xmlObject[rootKey][index];
				} else {
					// @ts-ignore
					regionsObject.region[xmlObject[rootKey][index]['xml:id']] = <RegionAttributes> xmlObject[rootKey][index];

				}
			});
		} else {
			// only one region/rootLayout in layout element
			if (rootKey === SMILEnemus.rootLayout) {
				// @ts-ignore
				regionsObject.rootLayout = <RootLayout> xmlObject[rootKey];
			}

			if (rootKey === SMILEnemus.region) {
				// @ts-ignore
				if (xmlObject[rootKey].hasOwnProperty('regionName')) {
					// @ts-ignore
					regionsObject.region[xmlObject[rootKey].regionName] = <RegionAttributes> xmlObject[rootKey];
				} else {
					// @ts-ignore
					regionsObject.region[xmlObject[rootKey]['xml:id']] = <RegionAttributes> xmlObject[rootKey];

				}
			}
		}
	});

	return regionsObject;
}

function pickDeep(collection: object, element: string[]) {
	const picked = pick(collection, element);
	const collections = pickBy(collection, isObject);

	each(collections, (item, key) => {
		let object;
		if (Array.isArray(item)) {
			object = reduce(
				item,
				(result: any[], value) => {
					const pickedDeep = pickDeep(value, element);
					if (!isEmpty(pickedDeep)) {
						result.push(pickedDeep);
					}
					return result;
				},
				[],
			);
		} else {
			object = pickDeep(item, element);
		}

		if (!isEmpty(object)) {
			// @ts-ignore
			picked[key] = object;
		}

	});
	return picked;
}

function extractBodyContent(xmlObject: object): SMILPlaylist {
	const playlist = {
		playlist: {},
	};
	playlist.playlist = <SMILPlaylist> pickDeep(xmlObject, config.constants.extractedElements);
	return playlist;
}

export async function processSmil(xmlFile: string): Promise<SMILFileObject> {
	const smilObject = await parseXml(xmlFile);
	return smilObject;
}
