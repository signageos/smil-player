/* tslint:disable:Unnecessary semicolon */
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
import { DynamicPlaylistList, TriggerList } from '../../models/triggerModels';
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

		const dynamicList: DynamicPlaylistList = {
			dynamic: {},
		};

		debug('[xml] parsing SMIL XML to JSON');
		const xmlObject: XmlSmilObject = await xml2js.parseStringPromise(xmlFile, {
			mergeAttrs: true,
			explicitArray: false,
			tagNameProcessors: [this.tagNameSuffix],
			attrValueProcessors: [parseBooleans],
		});

		debug('[xml] parsed XML to JSON: %O', xmlObject);

		const regions = extractRegionInfo(xmlObject.smil.head.layout);
		const transitions = extractTransitionsInfo(xmlObject.smil.head.layout);

		parseHeadInfo(xmlObject.smil.head, regions, triggerList);
		playableMedia.playlist = xmlObject.smil.body as SMILPlaylist;

		// traverse json as tree of nodes
		extractDataFromPlaylist(playableMedia, downloads, triggerList, dynamicList);

		removeDataFromPlaylist(playableMedia);

		debug('[xml] extracted regions: count=%d', Object.keys(regions.region || {}).length);
		debug('[xml] extracted transitions: count=%d', Object.keys(transitions.transition || {}).length);
		debug('[xml] extracted playable media');
		debug('[xml] extracted downloads: video=%d, img=%d, ref=%d, audio=%d', downloads.video.length, downloads.img.length, downloads.ref.length, downloads.audio.length);

		return Object.assign({}, regions, playableMedia, downloads, triggerList, transitions, dynamicList);
	};

	/**
	 * adds unique number to each media attribute in json eg. video => video0
	 * @param tagName name of tag ( seq, par, video etc..)
	 */
	private tagNameSuffix = (tagName: string): string => {
		if (
			[
				...XmlTags.extractedElements,
				...XmlTags.textElements,
				...XmlTags.dynamicPlaylist,
				// ...XmlTags.indexedStructureTags,
			].includes(tagName)
		) {
			return `${tagName}${this.tagNameCounter++}`;
		}
		return tagName;
	};
}
