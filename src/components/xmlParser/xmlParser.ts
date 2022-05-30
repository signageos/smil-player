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
import { TriggerList } from '../../models/triggerModels';
import { DownloadsList, SMILFileObject } from '../../models/filesModels';
import { XmlSmilObject } from '../../models/xmlJsonModels';
import { SMILPlaylist } from '../../models/playlistModels';
import { parseBooleans } from 'xml2js/lib/processors';
import { IXmlParser } from './IXmlParser';

export class XmlParser implements IXmlParser {
	private tagNameCounter: number = 0;

	public processSmilXml = async (xmlFile: string): Promise<SMILFileObject> => {
		// reset counter during media update
		this.tagNameCounter = 0;
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
			tagNameProcessors: [this.tagNameSuffix],
			attrValueProcessors: [parseBooleans],
		});

		debug('Xml file parsed to json object: %O', xmlObject);

		const regions = extractRegionInfo(xmlObject.smil.head.layout);
		const transitions = extractTransitionsInfo(xmlObject.smil.head.layout);

		parseHeadInfo(xmlObject.smil.head, regions, triggerList);
		playableMedia.playlist = xmlObject.smil.body as SMILPlaylist;

		// traverse json as tree of nodes
		extractDataFromPlaylist(playableMedia, downloads, triggerList);

		removeDataFromPlaylist(playableMedia);

		debug('Extracted transitions object: %O', transitions);
		debug('Extracted playableMedia object: %O', playableMedia);
		debug('Extracted downloads object: %O', downloads);

		return Object.assign({}, regions, playableMedia, downloads, triggerList, transitions);
	};

	/**
	 * adds unique number to each media attribute in json eg. video => video0
	 * @param tagName name of tag ( seq, par, video etc..)
	 */
	private tagNameSuffix = (tagName: string): string => {
		if (XmlTags.extractedElements.includes(tagName)) {
			return `${tagName}${this.tagNameCounter++}`;
		}
		return tagName;
	};
}
