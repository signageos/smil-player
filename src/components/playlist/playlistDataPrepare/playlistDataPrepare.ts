import { PlaylistElement, PlaylistOptions } from "../../../models/playlistModels";
import { TriggerList } from "../../../models/triggerModels";
import { SMILFileObject } from "../../../models/filesModels";
import { IStorageUnit, IVideoFile } from "@signageos/front-applet/es6/FrontApplet/FileSystem/types";
import { SMILTriggersEnum } from "../../../enums/triggerEnums";
import { XmlTags } from "../../../enums/xmlEnums";
import { extractAdditionalInfo, getRegionInfo, removeDigits } from "../tools/generalTools";
import { FileStructure } from "../../../enums/fileEnums";
import { HtmlEnum } from "../../../enums/htmlEnums";
import { SMILEnums } from "../../../enums/generalEnums";
import { convertRelativePathToAbsolute, getFileName, getProtocol } from "../../files/tools";
import { createDomElement } from "../tools/htmlTools";
import { isNil, isObject } from "lodash";
import FrontApplet from "@signageos/front-applet/es6/FrontApplet/FrontApplet";
import { FilesManager } from "../../files/filesManager";
import Debug from "debug";
import { PlaylistCommon } from "../playlistCommon/playlistCommon";
import { IPlaylistDataPrepare } from "./IPlaylistDataPrepare";

const debug = Debug('@signageos/smil-player:playlistDataPrepare');

export class PlaylistDataPrepare extends PlaylistCommon implements IPlaylistDataPrepare {

	constructor(sos: FrontApplet, files: FilesManager, options: PlaylistOptions) {
		super(sos, files, options);
	}

	/**
	 * recursively traverses through playlist and gets additional info for all media  specified in smil file
	 * @param playlist - smil file playlist, set of rules which media should be played and when
	 * @param smilObject
	 * @param internalStorageUnit - persistent storage unit
	 * @param smilUrl
	 * @param isTrigger - boolean value determining if function is processing trigger playlist or ordinary playlist
	 * @param triggerName - name of the trigger element
	 */
	public getAllInfo = async (
		playlist: PlaylistElement | PlaylistElement[] | TriggerList, smilObject: SMILFileObject, internalStorageUnit: IStorageUnit,
		smilUrl: string, isTrigger: boolean = false, triggerName: string = '',
	): Promise<void> => {
		let widgetRootFile: string = '';
		let fileStructure: string = '';
		let htmlElement: string = '';
		const regionSyncIndex: { [key: string]: number } = {};
		for (let [key, loopValue] of Object.entries(playlist)) {
			triggerName = (key === 'begin' && loopValue.startsWith(SMILTriggersEnum.triggerFormat)) ? loopValue : triggerName;
			// skip processing string values like "repeatCount": "indefinite"
			if (!isObject(loopValue)) {
				continue;
			}

			let value: PlaylistElement | PlaylistElement[] = loopValue;
			if (XmlTags.extractedElements.includes(removeDigits(key))) {
				debug('found %s element, getting all info', key);
				if (!Array.isArray(value)) {
					value = [value];
				}

				switch (removeDigits(key)) {
					case 'video':
						fileStructure = FileStructure.videos;
						break;
					case 'ref':
						widgetRootFile = HtmlEnum.widgetRoot;
						fileStructure = FileStructure.extracted;
						htmlElement = HtmlEnum.ref;
						break;
					case SMILEnums.img:
						fileStructure = FileStructure.images;
						htmlElement = HtmlEnum.img;
						break;
					case 'audio':
						fileStructure = FileStructure.audios;
						break;
					default:
						debug(`Sorry, we are out of ${key}.`);
				}

				for (const elem of value) {
					// relative path for triggers has to be fixed here, because trigger media objects are not included in parallel download
					if (isTrigger) {
						elem.src = convertRelativePathToAbsolute(elem.src, smilUrl);
					}

					const mediaFile = <IVideoFile> await this.sos.fileSystem.getFile({
						storageUnit: internalStorageUnit,
						filePath: `${fileStructure}/${getFileName(elem.src)}${widgetRootFile}`,
					});
					// in case of web page as widget, leave localFilePath blank
					elem.localFilePath = mediaFile ? mediaFile.localUri : '';

					// check if video has duration defined due to webos bug
					// only for videos downloaded to local storage ( not for streams )
					if (key.startsWith('video')) {
						if (mediaFile) {
							elem.fullVideoDuration = mediaFile.videoDurationMs ? mediaFile.videoDurationMs : SMILEnums.defaultVideoDuration;
						}

						// extract protocol for video streams
						if (elem.hasOwnProperty('isStream')) {
							elem.protocol = getProtocol(elem.src);
						}
					}

					elem.regionInfo = getRegionInfo(smilObject, elem.region);

					if (isNil(regionSyncIndex[elem.regionInfo.regionName])) {
						regionSyncIndex[elem.regionInfo.regionName] = 0;
					}

					regionSyncIndex[elem.regionInfo.regionName]++;
					elem.syncIndex = regionSyncIndex[elem.regionInfo.regionName];
					extractAdditionalInfo(elem);

					if ((key.startsWith(SMILEnums.img) || key.startsWith('ref')) && elem.hasOwnProperty(SMILEnums.transitionType)) {
						if (!isNil(smilObject.transition[elem.transIn])) {
							elem.transitionInfo = smilObject.transition[elem.transIn];
						} else {
							debug(`No corresponding transition found for element: %O, with transitionType: %s`, elem, elem.transIn);
						}
					}

					// element will be played only on trigger emit in nested region
					if (isTrigger && triggerName !== '') {
						elem.triggerValue = triggerName;
					}

					// create placeholders in DOM for images and widgets to speedup playlist processing
					if (key.startsWith(SMILEnums.img) || key.startsWith('ref')) {
						elem.id = createDomElement(elem, htmlElement, key, isTrigger);
					}
				}
				// reset widget expression for next elements
				widgetRootFile = '';
			} else {
				await this.getAllInfo(value, smilObject, internalStorageUnit, smilUrl, isTrigger, triggerName);
			}
		}
	}

	/**
	 * Performs all necessary actions needed to process playlist ( delete unused files, extract widgets, extract regionInfo for each media )
	 * @param smilObject - JSON representation of parsed smil file
	 * @param internalStorageUnit - persistent storage unit
	 * @param smilUrl - url for SMIL file so its not deleted as unused file ( actual smil file url is not present in smil file itself )
	 */
	public manageFilesAndInfo = async (smilObject: SMILFileObject, internalStorageUnit: IStorageUnit, smilUrl: string) => {
		await this.files.currentFilesSetup(smilObject.ref, internalStorageUnit, smilObject, smilUrl);

		// has to before getAllInfo for generic playlist, because src attribute for triggers is specified during intro
		await this.getAllInfo(smilObject.triggers, smilObject, internalStorageUnit, smilUrl, true);
		debug('All triggers info extracted');

		// extracts region info for all medias in playlist
		await this.getAllInfo(smilObject.playlist, smilObject, internalStorageUnit, smilUrl);
		debug('All elements info extracted');
	}
}
