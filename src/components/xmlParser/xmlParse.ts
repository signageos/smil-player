import * as xml2js from 'xml2js';
// @ts-ignore
import { JefNode } from 'json-easy-filter';
import { DOMParser } from 'xmldom';
import {
	RegionAttributes,
	RegionsObject,
	RootLayout,
	DownloadsList,
	SMILFileObject,
	SMILPlaylist,
	XmlSmilObject, SMILMedia,
} from '../../models';
import { SMILEnums, XmlTags } from '../../enums';
import { debug, containsElement } from './tools';

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
	const xmlFileSerialized: Document = new DOMParser().parseFromString(xmlFile, "text/xml");
	debug('Xml string serialized : %O', xmlFileSerialized);
	const xmlObject: XmlSmilObject = await xml2js.parseStringPromise(xmlFileSerialized, {
		mergeAttrs: true,
		explicitArray: false,
	});

	debug('Xml file parsed to json object: %O', xmlObject);

	const regions = <RegionsObject> extractRegionInfo(xmlObject.smil.head.layout);
	regions.refresh = parseInt(xmlObject.smil.head.meta.content) || SMILEnums.defaultRefresh;
	playableMedia.playlist = <SMILPlaylist> xmlObject.smil.body;

	// traverse json as tree of nodes
	new JefNode(playableMedia.playlist).filter(function (node: { key: string; value: any; parent: { key: string; value: any; } }) {
		// detect intro element, may not exist
		if (node.key === 'end' && node.value === '__prefetchEnd.endEvent') {
			new JefNode(node.parent.value).filter(function (introNode: { key: string; value: any; parent: { key: string; value: any; } }) {
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
			node.value.forEach((element: SMILMedia) => {
				if (!containsElement(downloads[node.key], element.src)) {
					// @ts-ignore
					downloads[node.key].push(element);
				}
			});
		}
	});

	debug('Extracted regions object: %O', regions);
	debug('Extracted playableMedia object: %O', playableMedia);
	debug('Extracted downloads object: %O', downloads);

	return Object.assign({}, regions, playableMedia, downloads);
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
	const smilObject = await parseXml(xmlFile);
	return smilObject;
}
