import * as xml2js from 'xml2js';
import {
	debug,
	extractDataFromPlaylist,
	extractRegionInfo,
	extractTransitionsInfo,
	parseHeadInfo,
	removeDataFromPlaylist,
} from './tools';
import { XmlTags } from '../../enums/xmlEnums';
import { TriggerList, } from '../../models/triggerModels';
import { DownloadsList, SMILFileObject } from '../../models/filesModels';
import { RegionsObject, TransitionsObject, XmlSmilObject } from '../../models/xmlJsonModels';
import { SMILPlaylist } from '../../models/playlistModels';

let tagNameCounter = 0;

/**
 * adds unique number to each media attribute in json eg. video => video0
 * @param tagName name of tag ( seq, par, video etc..)
 */
export function tagNameSuffix(tagName: string): string {
	if (XmlTags.extractedElements.includes(tagName)) {
		return `${tagName}${tagNameCounter++}`;
	}
	return tagName;
}

async function parseXml(xmlFile: string): Promise<SMILFileObject> {
	// reset counter during media update
	tagNameCounter = 0;
	const downloads: DownloadsList = {
		video: [],
		img: [],
		ref: [],
		audio: [],
		intro: [],
	};
	const playableMedia: SMILPlaylist = {
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
		tagNameProcessors: [tagNameSuffix],
	});

	debug('Xml file parsed to json object: %O', xmlObject);

	const regions = <RegionsObject> extractRegionInfo(xmlObject.smil.head.layout);
	const transitions = <TransitionsObject> extractTransitionsInfo(xmlObject.smil.head.layout);

	parseHeadInfo(xmlObject.smil.head, regions, triggerList);
	playableMedia.playlist = <SMILPlaylist> xmlObject.smil.body;

	// traverse json as tree of nodes
	extractDataFromPlaylist(playableMedia, downloads, triggerList);

	removeDataFromPlaylist(playableMedia);

	debug('Extracted transitions object: %O', transitions);
	debug('Extracted playableMedia object: %O', playableMedia);
	debug('Extracted downloads object: %O', downloads);

	return Object.assign({}, regions, playableMedia, downloads, triggerList, transitions);
}

export async function processSmil(xmlFile: string): Promise<SMILFileObject> {
	return await parseXml(xmlFile);
}
