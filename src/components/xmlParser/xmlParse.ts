import * as xml2js from 'xml2js';
import * as _ from 'lodash';
// @ts-ignore
import { JefNode } from 'json-easy-filter';
// import { promises as fsPromise } from 'fs';
import {
	RegionAttributes,
	RegionsObject,
	RootLayout,
	DownloadsList,
	SMILFileObject,
	SMILPlaylist,
} from '../../models';
import { SMILEnemus } from '../../enums';
import { defaults as config } from '../../config';
import Debug from 'debug';

const debug = Debug('xmlParseModule');

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

	debug('Xml file parsed to json object: %O', xmlObject);

	const regions = <RegionsObject>extractRegionInfo(xmlObject.smil.head.layout);
	const playableMedia = <SMILPlaylist>extractBodyContent(xmlObject.smil.body);

	new JefNode(playableMedia.playlist).filter(function (node: { key: string; value: any; }) {
		if (config.constants.extractedElements.includes(node.key)) {
			// create media arrays for easy download/update check
			if (Array.isArray(node.value)) {
				// @ts-ignore
				downloads[node.key] = downloads[node.key].concat(node.value)
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
				regionsObject.region[xmlObject[rootKey][index].regionName] = <RegionAttributes>xmlObject[rootKey][index];
			});
		} else {
			// only one region/rootLayout in layout element
			if (rootKey === SMILEnemus.rootLayout) {
				// @ts-ignore
				regionsObject.rootLayout = <RootLayout>xmlObject[rootKey];
			}

			if (rootKey === SMILEnemus.region) {
				// @ts-ignore
				regionsObject.region[xmlObject[rootKey].regionName] = <RegionAttributes>xmlObject[rootKey];
			}
		}
	});

	return regionsObject;
}

function pickDeep(collection: object, element: string[]) {
	const picked = _.pick(collection, element);
	const collections = _.pickBy(collection, _.isObject);

	_.each(collections, function (item, key) {
		let object;
		if (Array.isArray(item)) {
			object = _.reduce(item, function (result: any[], value) {
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
	playlist.playlist = <SMILPlaylist>pickDeep(xmlObject, config.constants.extractedElements);
	return playlist;
}

export async function processSmil(xmlFile: string): Promise<SMILFileObject> {
	const smilObject = await parseXml(xmlFile);
	return smilObject;
}
