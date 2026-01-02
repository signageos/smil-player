/* tslint:disable:Unnecessary semicolon missing whitespace */
import { PlaylistElement, PlaylistOptions } from '../../../models/playlistModels';
import { TriggerList } from '../../../models/triggerModels';
import { SMILFileObject } from '../../../models/filesModels';
import { IStorageUnit, IVideoFile } from '@signageos/front-applet/es6/FrontApplet/FileSystem/types';
import { SMILTriggersEnum } from '../../../enums/triggerEnums';
import { XmlTags } from '../../../enums/xmlEnums';
import { computeSyncIndex, extractAdditionalInfo, getRegionInfo, removeDigits } from '../tools/generalTools';
import { FileStructure } from '../../../enums/fileEnums';
import { HtmlEnum } from '../../../enums/htmlEnums';
import { SMILEnums } from '../../../enums/generalEnums';
import { convertRelativePathToAbsolute, getProtocol } from '../../files/tools';
import { createTickerElement } from '../tools/tickerTools';
import { createDomElement } from '../tools/htmlTools';
import { isNil, isObject } from 'lodash';
import FrontApplet from '@signageos/front-applet/es6/FrontApplet/FrontApplet';
import { FilesManager } from '../../files/filesManager';
import Debug from 'debug';
import { PlaylistCommon } from '../playlistCommon/playlistCommon';
import { IPlaylistDataPrepare } from './IPlaylistDataPrepare';
import { SMILDynamicEnum } from '../../../enums/dynamicEnums';

const debug = Debug('@signageos/smil-player:playlistDataPrepare');

export class PlaylistDataPrepare extends PlaylistCommon implements IPlaylistDataPrepare {
	private globalRegionSyncIndex: { [key: string]: number } = {};

	constructor(sos: FrontApplet, files: FilesManager, options: PlaylistOptions) {
		super(sos, files, options);
	}

	/**
	 * recursively traverses through playlist and gets additional info for all media  specified in smil file
	 * @param playlist - smil file playlist, set of rules which media should be played and when
	 * @param smilObject
	 * @param internalStorageUnit - persistent storage unit
	 * @param smilUrl
	 * @param isSpecial - boolean value determining if function is processing trigger playlist, dynamic playlist or ordinary playlist
	 * @param specialName - name of the trigger or dynamic element
	 */
	public getAllInfo = async (
		playlist: PlaylistElement | PlaylistElement[] | TriggerList,
		smilObject: SMILFileObject,
		internalStorageUnit: IStorageUnit,
		smilUrl: string,
		isSpecial: boolean = false,
		specialName: string = '',
	): Promise<void> => {
		let widgetRootFile: string = '';
		let fileStructure: string = '';
		let htmlElement: string = '';
		let localRegionSyncIndex: { [key: string]: number } = {};
		for (let [key, loopValue] of Object.entries(playlist)) {
			specialName =
				key === 'begin' &&
				(loopValue.startsWith(SMILTriggersEnum.triggerFormat) ||
					loopValue.startsWith(SMILDynamicEnum.dynamicFormat))
					? loopValue
					: specialName;
			// skip processing string values like "repeatCount": "indefinite"
			if (!isObject(loopValue)) {
				continue;
			}

			let value: PlaylistElement | PlaylistElement[] = loopValue;

			if (XmlTags.extractedElements.concat(XmlTags.textElements).includes(removeDigits(key))) {
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
					case 'ticker':
						htmlElement = HtmlEnum.ticker;
						break;
					default:
						debug(`Sorry, we are out of ${key}.`);
				}

				for (const elem of value) {
					elem.regionInfo = getRegionInfo(smilObject, elem.region);
					extractAdditionalInfo(elem);
					// relative path for triggers has to be fixed here, because trigger media objects are not included in parallel download
					// there are two ways of computing sync index, more at jsdoc for computeSyncIndex
					if (isSpecial) {
						elem.src = convertRelativePathToAbsolute(elem.src, smilUrl);

						if (specialName.startsWith(SMILTriggersEnum.triggerFormat)) {
							elem.triggerValue = specialName;
						}

						if (specialName.startsWith(SMILDynamicEnum.dynamicFormat)) {
							elem.dynamicValue = specialName;
						}

						localRegionSyncIndex = computeSyncIndex(localRegionSyncIndex, elem.regionInfo.regionName);
						elem.syncIndex = localRegionSyncIndex[elem.regionInfo.regionName];
					} else {
						this.globalRegionSyncIndex = computeSyncIndex(
							this.globalRegionSyncIndex,
							elem.regionInfo.regionName,
						);
						elem.syncIndex = this.globalRegionSyncIndex[elem.regionInfo.regionName];
					}

					const mediaFile = (await this.files.getFileDetails(
						elem,
						internalStorageUnit,
						fileStructure,
						widgetRootFile,
					)) as IVideoFile;
					// in case of web page as widget, leave localFilePath blank
					elem.localFilePath = mediaFile ? mediaFile.localUri : '';

					// check if video has duration defined due to webos bug
					// only for videos downloaded to local storage ( not for streams )
					if (key.startsWith('video')) {
						if (mediaFile) {
							elem.fullVideoDuration = mediaFile.videoDurationMs
								? mediaFile.videoDurationMs
								: SMILEnums.defaultVideoDuration;
						}

						// extract protocol for video streams
						if (elem.hasOwnProperty('isStream')) {
							elem.protocol = getProtocol(elem.src);
						}
					}

					if (
						(key.startsWith(SMILEnums.img) || key.startsWith('ref')) &&
						(elem[SMILEnums.transitionType] || smilObject.defaultTransition)
					) {
						const transitionId = elem[SMILEnums.transitionType] ?? smilObject.defaultTransition;
						if (!isNil(smilObject.transition[transitionId])) {
							elem.transitionInfo = smilObject.transition[transitionId];
						} else {
							debug(
								`No corresponding transition found for element: %O, with transitionType: %s`,
								elem,
								transitionId,
							);
						}
					}

					// create placeholders in DOM for images and widgets to speedup playlist processing
					if (key.startsWith(SMILEnums.img) || key.startsWith('ref')) {
						elem.id = createDomElement(elem, htmlElement, key, isSpecial);
					}

					if (key.startsWith(HtmlEnum.ticker)) {
						elem.id = createTickerElement(elem, elem.regionInfo, key);
					}
					debug('all info extracted for element: %O', elem);
				}
				// reset widget expression for next elements
				widgetRootFile = '';
			} else {
				await this.getAllInfo(value, smilObject, internalStorageUnit, smilUrl, isSpecial, specialName);
			}
		}
	};

	/**
	 * Performs all necessary actions needed to process playlist ( delete unused files, extract widgets, extract regionInfo for each media )
	 * @param smilObject - JSON representation of parsed smil file
	 * @param internalStorageUnit - persistent storage unit
	 * @param smilUrl - url for SMIL file so its not deleted as unused file ( actual smil file url is not present in smil file itself )
	 */
	public manageFilesAndInfo = async (
		smilObject: SMILFileObject,
		internalStorageUnit: IStorageUnit,
		smilUrl: string,
	) => {
		await this.files.currentFilesSetup(smilObject.ref, smilObject, smilUrl);

		// has to before getAllInfo for generic playlist, because src attribute for triggers is specified during intro
		await this.getAllInfo(smilObject.triggers, smilObject, internalStorageUnit, smilUrl, true);
		debug('All triggers info extracted');

		await this.getAllInfo(smilObject.dynamic, smilObject, internalStorageUnit, smilUrl, true);
		debug('All dynamic playlist info extracted');

		// extracts region info for all medias in playlist
		await this.getAllInfo(smilObject.playlist, smilObject, internalStorageUnit, smilUrl);
		debug('All elements info extracted');
	};
}
