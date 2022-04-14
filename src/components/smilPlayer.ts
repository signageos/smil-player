import { IStorageUnit } from '@signageos/front-applet/es6/FrontApplet/FileSystem/types';
import FrontApplet from '@signageos/front-applet/es6/FrontApplet/FrontApplet';
import Debug from 'debug';
import { defaults as config } from '../../config/parameters';
import sos from '@signageos/front-applet';
import { SMILFile, SMILFileObject } from '../models/filesModels';
import { isNil } from 'lodash';
import { FileStructure } from '../enums/fileEnums';
import { createLocalFilePath, getFileName } from './files/tools';
import { resetBodyContent, setTransitionsDefinition } from './playlist/tools/htmlTools';
// @ts-ignore
import backupImage from '../../public/backupImage/backupImage.jpg';
import { generateBackupImagePlaylist, getDefaultRegion, removeWhitespace, sleep } from './playlist/tools/generalTools';
import { SMILScheduleEnum } from '../enums/scheduleEnums';
import { SMILEnums } from '../enums/generalEnums';
import { FilesManager } from './files/filesManager';
import { XmlParser } from './xmlParser/xmlParser';
import { SmilPlayerPlaylist } from './playlist/playlist';
import { PlaylistProcessor } from './playlist/playlistProcessor/playlistProcessor';
import { PlaylistDataPrepare } from './playlist/playlistDataPrepare/playlistDataPrepare';
import { applyFetchPolyfill } from '../polyfills/fetch';
import { ISmilPlayer } from './ISmilPlayer';

export const debug = Debug('@signageos/smil-player:main');

applyFetchPolyfill();

export class SmilPlayer implements ISmilPlayer {
	private readonly files: FilesManager;
	private readonly smilUrl: string | undefined;
	private xmlParser: XmlParser;
	private playlist: SmilPlayerPlaylist;
	private processor: PlaylistProcessor;
	private dataPrepare: PlaylistDataPrepare;

	constructor(smilUrl?: string) {
		this.smilUrl = smilUrl;
		this.files = new FilesManager(sos);
		this.xmlParser = new XmlParser();
		this.playlist = new SmilPlayerPlaylist(sos, this.files);
		this.processor = this.playlist.processor;
		this.dataPrepare = this.playlist.dataPrepare;
	}

	public startSmilPlayer = async () => {
		await sos.onReady();
		debug('sOS is ready');

		let smilUrl = this.smilUrl ? this.smilUrl : sos.config.smilUrl;

		if (isNil(smilUrl)) {
			throw new Error('No valid smil url provided');
		}

		smilUrl = removeWhitespace(smilUrl);

		debug('Smil file url is: %s', smilUrl);

		const storageUnits = await sos.fileSystem.listStorageUnits();

		// reference to persistent storage unit, where player stores all content
		const internalStorageUnit = <IStorageUnit>storageUnits.find((storageUnit) => !storageUnit.removable);

		this.processor.setStorageUnit(internalStorageUnit);

		await this.files.createFileStructure(internalStorageUnit);

		debug('File structure created');

		if (
			await this.files.fileExists(
				internalStorageUnit,
				createLocalFilePath(FileStructure.smilMediaInfo, FileStructure.smilMediaInfoFileName),
			)
		) {
			try {
				const fileContent = JSON.parse(
					await this.files.readFile(
						internalStorageUnit,
						createLocalFilePath(FileStructure.smilMediaInfo, FileStructure.smilMediaInfoFileName),
					),
				);

				// delete mediaInfo file only in case that currently played smil is different from previous
				if (!fileContent.hasOwnProperty(getFileName(smilUrl))) {
					// delete mediaInfo file, so each smil has fresh start for lastModified tags for files
					await this.files.deleteFile(
						internalStorageUnit,
						createLocalFilePath(FileStructure.smilMediaInfo, FileStructure.smilMediaInfoFileName),
					);
				}
			} catch (err) {
				debug('Malformed file: %s , deleting', FileStructure.smilMediaInfoFileName);
				// file is malformed, delete from internal storage
				await this.files.deleteFile(
					internalStorageUnit,
					createLocalFilePath(FileStructure.smilMediaInfo, FileStructure.smilMediaInfoFileName),
				);
			}
		}

		resetBodyContent();

		while (true) {
			try {
				const startVersion = this.processor.getPlaylistVersion();
				debug('One smil iteration finished START' + startVersion);
				await this.main(internalStorageUnit, smilUrl, sos);
				const finishVersion = this.processor.getPlaylistVersion();
				if (startVersion < finishVersion) {
					debug('Playlist ended and was replaced with new version of playlist');
					break;
				}
			} catch (err) {
				debug('Unexpected error : %O', err);
				await sleep(SMILEnums.defaultRefresh * 1000);
			}
		}
	};

	private main = async (
		internalStorageUnit: IStorageUnit,
		smilUrl: string,
		thisSos: FrontApplet,
		playIntro: boolean = true,
	) => {
		// allow endless functions to play endlessly
		this.processor.disableLoop(false);
		// set video background to timings value or false
		config.videoOptions.background = sos.config.videoBackground || sos.config.videoBackground === 'true' || false;
		const smilFile: SMILFile = {
			src: smilUrl,
		};
		let downloadPromises: Promise<void>[] = [];
		let forceDownload = false;

		// set smilUrl in files instance ( links to files might me in media/file.mp4 format )
		this.files.setSmilUrl(smilUrl);

		try {
			if (
				!isNil(sos.config.backupImageUrl) &&
				!isNil(await this.files.fetchLastModified(sos.config.backupImageUrl))
			) {
				forceDownload = true;
				const backupImageObject = {
					src: sos.config.backupImageUrl,
				};
				downloadPromises = await this.files.parallelDownloadAllFiles(
					internalStorageUnit,
					[backupImageObject],
					FileStructure.images,
					forceDownload,
				);
				await Promise.all(downloadPromises);
			}
		} catch (err) {
			debug('Unexpected error occurred during backup image download : %O', err);
		}

		let smilFileContent: string = '';
		let xmlOkParsed: boolean = false;

		// wait for successful download of SMIL file, if download or read from internal storage fails
		// wait for one minute and then try to download it again
		while (smilFileContent === '' || !xmlOkParsed) {
			try {
				// download SMIL file if device has internet connection and smil file exists on remote server
				if (!isNil(await this.files.fetchLastModified(smilFile.src))) {
					forceDownload = true;
					downloadPromises = await this.files.parallelDownloadAllFiles(
						internalStorageUnit,
						[smilFile],
						FileStructure.rootFolder,
						forceDownload,
					);
					await Promise.all(downloadPromises);
				}

				smilFileContent = await thisSos.fileSystem.readFile({
					storageUnit: internalStorageUnit,
					filePath: `${FileStructure.rootFolder}/${getFileName(smilFile.src)}`,
				});

				debug('SMIL file downloaded');
				downloadPromises = [];

				const smilObject: SMILFileObject = await this.xmlParser.processSmilXml(smilFileContent);
				debug('SMIL file parsed: %O', smilObject);

				await this.files.sendSmiFileReport(
					`${FileStructure.rootFolder}/${getFileName(smilFile.src)}`,
					smilFile.src,
				);

				// set variable to enable/disable events logs
				this.files.setSmiLogging(smilObject.log);

				setTransitionsDefinition(smilObject);

				// download and play intro file if exists  ( image or video ) and if its first iteration of playlist
				// seamlessly updated playlist dont start with intro
				if (smilObject.intro.length > 0 && playIntro) {
					// await playlist.playIntro(smilObject, smilUrl)
					const introPromises: Promise<void>[] = [];

					downloadPromises = await this.files.prepareDownloadMediaSetup(internalStorageUnit, smilObject);

					introPromises.concat(await this.processor.playIntro(smilObject));

					introPromises.push(
						(async () => {
							await Promise.all(downloadPromises).then(async () => {
								// prepares everything needed for processing playlist
								await this.dataPrepare.manageFilesAndInfo(smilObject, internalStorageUnit, smilUrl);
								// all files are downloaded, stop intro
								debug('SMIL media files download finished, stopping intro');
							});
						})(),
					);

					await Promise.race(introPromises);
				} else {
					// no intro
					debug('No intro element found');
					downloadPromises = await this.files.prepareDownloadMediaSetup(internalStorageUnit, smilObject);
					await Promise.all(downloadPromises);
					debug('SMIL media files download finished');
					await this.dataPrepare.manageFilesAndInfo(smilObject, internalStorageUnit, smilUrl);
				}

				// smil processing ok, end loop
				xmlOkParsed = true;

				debug('Starting to process parsed smil file');
				const restart = () => this.main(internalStorageUnit, smilUrl, thisSos, false);
				await this.processor.processingLoop(smilObject, smilFile, playIntro, restart);
			} catch (err) {
				if (smilFileContent === '') {
					debug('Unexpected error occurred during smil file download : %O', err);
				} else {
					debug('Unexpected error during xml parse: %O', err);
					await this.files.sendSmiFileReport(
						`${FileStructure.rootFolder}/${getFileName(smilFile.src)}`,
						smilFile.src,
						err.message,
					);
				}

				debug('Starting to play backup image');
				const backupImageUrl = !isNil(sos.config.backupImageUrl) ? sos.config.backupImageUrl : backupImage;
				const backupPlaylist = generateBackupImagePlaylist(backupImageUrl, '1');
				const regionInfo = <SMILFileObject>getDefaultRegion();

				await this.dataPrepare.getAllInfo(backupPlaylist, regionInfo, internalStorageUnit, smilUrl);
				if (isNil(sos.config.backupImageUrl)) {
					backupPlaylist.seq.img.localFilePath = backupImageUrl;
				}
				await this.processor.processPlaylist(backupPlaylist, SMILScheduleEnum.backupImagePlaylistVersion);
				await sleep(SMILEnums.defaultDownloadRetry * 1000);
			}
		}
	};
}
