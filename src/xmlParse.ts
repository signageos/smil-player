import * as xml2js from 'xml2js';
import * as _ from 'lodash';
import { promises as fsPromise } from 'fs';
import {
	RegionAttributes,
	RegionsObject,
	RootLayout,
	DownloadsList,
	SMILFileObject,
	SMILPlaylist,
} from './models';
import { SMILEnemus } from './enums';
import { JefNode } from 'json-easy-filter';
import * as deepmerge from 'deepmerge';
import { defaults as config } from './config';

export async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function flatten(arr) {
	return arr.reduce(function (flat, toFlatten) {
		return flat.concat(Array.isArray(toFlatten) ? flatten(toFlatten) : toFlatten);
	}, []);
}

const overwriteMerge = (destinationArray, sourceArray, options) => sourceArray;

function mergeObjects(array) {
	return deepmerge.all(array, {arrayMerge: overwriteMerge});
}

async function parseXml(xmlFile: string): Promise<SMILFileObject> {
	const downloads: DownloadsList = {
		video: [],
		img: [],
		ref: [],
		audio: [],
	};
	// const xmlFile: string = await fsPromise.readFile('./SMIL/99.smil', 'utf8');
	const xmlObject: any = await xml2js.parseStringPromise(xmlFile, {
		mergeAttrs: true,
		explicitArray: false,
	});

	const regions = <RegionsObject>extractRegionInfo(xmlObject.smil.head.layout);
	const playableMedia = <SMILPlaylist>extractBodyContent(xmlObject.smil.body);

	new JefNode(playableMedia.playlist).filter(function (node) {
		if (config.constants.extractedElements.includes(node.key)) {
			// create media arrays for easy download/update check
			if (Array.isArray(node.value)) {
				downloads[node.key] = downloads[node.key].concat(node.value)
			} else {
				downloads[node.key].push(node.value);
			}
		}
	});

	return Object.assign({}, regions, playableMedia, downloads);
}

function extractRegionInfo(xmlObject: object): RegionsObject {
	const regionsObject: RegionsObject = {
		region: {},
	};
	Object.keys(xmlObject).forEach((rootKey) => {
		// multiple regions in layout element
		if (Array.isArray(xmlObject[rootKey])) {
			// iterate over array of objects
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
				regionsObject.region[xmlObject[rootKey][index].regionName] = <RegionAttributes>xmlObject[rootKey][index];
			});
		} else {
			// only one region/root-layout in layout element
			if (rootKey === SMILEnemus.rootLayout) {
				regionsObject[rootKey] = <RootLayout>xmlObject[rootKey];
			}

			if (rootKey === SMILEnemus.region) {
				regionsObject.region[xmlObject[rootKey].regionName] = <RegionAttributes>xmlObject[rootKey];
			}
		}
	});

	return regionsObject;
}

function pickDeep(collection, element) {
	const picked = _.pick(collection, element);
	const collections = _.pickBy(collection, _.isObject);

	_.each(collections, function (item, key, collection) {
		let object;
		if (Array.isArray(item)) {
			object = _.reduce(item, function (result, value) {
				const picked = pickDeep(value, element);
				if (!_.isEmpty(picked)) {
					result.push(picked);
				}
				return result;
			}, []);
		} else {
			object = pickDeep(item, element);
		}

		if (!_.isEmpty(object)) {
			picked[key] = object;
		}

	});
	return picked;
}

function extractBodyContent(xmlObject: object): SMILPlaylist {
	const playlist: SMILPlaylist = {
		playlist: {},
	};
	playlist.playlist = pickDeep(xmlObject, config.constants.extractedElements);
	return playlist;
}

export async function processSmil(xmlFile: string): Promise<SMILFileObject> {
	const smilObject = await parseXml(xmlFile);
	return smilObject;
}
