/* tslint:disable:Unnecessary semicolon missing whitespace */
import { IStorageUnit } from '@signageos/front-applet/es6/FrontApplet/FileSystem/types';
import FrontApplet from '@signageos/front-applet/es6/FrontApplet/FrontApplet';
import { defaults as config } from '../../config/parameters';
import sos from '@signageos/front-applet';
import { SMILFile, SMILFileObject } from '../models/filesModels';
import { isNil, isEmpty } from 'lodash';
import { FileStructure } from '../enums/fileEnums';
import { createLocalFilePath, getFileName } from './files/tools';
import { resetBodyContent, resetBodyMargin, setTransitionsDefinition } from './playlist/tools/htmlTools';
// @ts-ignore
import backupImage from '../../public/backupImage/backupImage.jpg';
import { generateBackupImagePlaylist, getDefaultRegion, removeWhitespace, sleep } from './playlist/tools/generalTools';
import { debug } from './smilPlayerTools';
import { SMILScheduleEnum } from '../enums/scheduleEnums';
import { SMILEnums, smilUpdate } from '../enums/generalEnums';
import { FilesManager } from './files/filesManager';
import { XmlParser } from './xmlParser/xmlParser';
import { SmilPlayerPlaylist } from './playlist/playlist';
import { PlaylistProcessor } from './playlist/playlistProcessor/playlistProcessor';
import { PlaylistDataPrepare } from './playlist/playlistDataPrepare/playlistDataPrepare';
import { applyFetchPolyfill } from '../polyfills/fetch';
import { ISmilPlayer } from './ISmilPlayer';
import Debug from 'debug';
import { EmptyPlaylistError } from '../errors/EmptyPlaylistError';

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

	public start = async () => {
		await sos.onReady();
		debug('sOS is ready');
		Debug.enable('@signageos/smil-player:*');
		// Debug.disable();

		let smilUrl = this.smilUrl ? this.smilUrl : sos.config.smilUrl;

		if (isNil(smilUrl)) {
			throw new Error('No valid smil url provided');
		}

		smilUrl = removeWhitespace(smilUrl);

		debug('Smil file url is: %s', smilUrl);

		const storageUnits = await sos.fileSystem.listStorageUnits();

		// reference to persistent storage unit, where player stores all content
		const internalStorageUnit = storageUnits.find((storageUnit) => !storageUnit.removable)!;

		this.processor.setStorageUnit(internalStorageUnit);
		this.files.setLocalStorageUnit(internalStorageUnit);

		await this.files.createFileStructure();

		debug('File structure created');

		if (
			await this.files.fileExists(
				createLocalFilePath(FileStructure.smilMediaInfo, FileStructure.smilMediaInfoFileName),
			)
		) {
			try {
				const fileContent = JSON.parse(
					await this.files.readFile(
						createLocalFilePath(FileStructure.smilMediaInfo, FileStructure.smilMediaInfoFileName),
					),
				);

				// delete mediaInfo file only in case that currently played smil is different from previous
				if (!fileContent.hasOwnProperty(getFileName(smilUrl))) {
					// delete mediaInfo file, so each smil has fresh start for lastModified tags for files
					await this.files.deleteFile(
						createLocalFilePath(FileStructure.smilMediaInfo, FileStructure.smilMediaInfoFileName),
					);
				}
			} catch (err) {
				debug('Malformed file: %s , deleting', FileStructure.smilMediaInfoFileName);
				// file is malformed, delete from internal storage
				await this.files.deleteFile(
					createLocalFilePath(FileStructure.smilMediaInfo, FileStructure.smilMediaInfoFileName),
				);
			}
		}

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
		firstIteration: boolean = true,
		ignoreInvalidSmil: boolean = false,
		invalidSmilLooping: boolean = false,
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
				!isNil(
					await this.files.fetchLastModified({
						src: sos.config.backupImageUrl,
					}),
				)
			) {
				forceDownload = true;
				const backupImageObject = {
					src: sos.config.backupImageUrl,
				};
				// default timeout because at this stage, we dont have info about custom one
				const result = await this.files.parallelDownloadAllFiles(
					[backupImageObject],
					FileStructure.images,
					SMILScheduleEnum.fileCheckTimeout,
					forceDownload,
				);
				await Promise.all(result.promises);

				// Get the mediaInfoObject for this file
				const mediaInfoObject = await this.files.getOrCreateMediaInfoFile([backupImageObject]);

				// Update the mediaInfoObject after download completes
				await this.files.updateMediaInfoAfterDownloads(mediaInfoObject, result.filesToUpdate);
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
				if (!isNil(await this.files.fetchLastModified(smilFile))) {
					forceDownload = true;
					// default timeout because at this stage, we dont have info about custom one
					const result = await this.files.parallelDownloadAllFiles(
						[smilFile],
						FileStructure.rootFolder,
						SMILScheduleEnum.fileCheckTimeout,
						forceDownload,
					);
					await Promise.all(result.promises);

					// Get the mediaInfoObject for this file
					const mediaInfoObject = await this.files.getOrCreateMediaInfoFile([smilFile]);

					// Update the mediaInfoObject after download completes
					await this.files.updateMediaInfoAfterDownloads(mediaInfoObject, result.filesToUpdate);
				}

				smilFileContent = await thisSos.fileSystem.readFile({
					storageUnit: internalStorageUnit,
					filePath: `${FileStructure.rootFolder}/${getFileName(smilFile.src)}`,
				});

				debug('SMIL file downloaded');
				downloadPromises = [];

				const smilObject: SMILFileObject = await this.xmlParser.processSmilXml(smilFileContent);
				debug('SMIL file parsed: %O', smilObject);

				if (isEmpty(smilObject.playlist)) {
					debug('Empty SMIL playlist, smil file wont be processed further');
					throw new EmptyPlaylistError('Empty SMIL playlist');
				}

				this.processor.setSmilObject(smilObject);

				await this.files.sendSmiFileReport(
					`${FileStructure.rootFolder}/${getFileName(smilFile.src)}`,
					smilFile.src,
				);

				// set variable to enable/disable events logs
				if (smilObject.logger) {
					this.files.setSmiLogging(smilObject.logger);
				}

				setTransitionsDefinition(smilObject);

				// reset body content if there is no dynamic content ( dynamic has refresh via applet.refresh so we want to keep backup image visible )
				// or reset body content if billboard transition is set because of dynamic div elements for columns
				if (
					(Object.keys(smilObject.dynamic).length === 0 && firstIteration) ||
					smilObject.transition?.billboard
				) {
					resetBodyContent();
				} else {
					resetBodyMargin();
				}

				// download and play intro file if exists  ( image or video ) and if its first iteration of playlist
				// seamlessly updated playlist dont start with intro
				if (smilObject.intro.length > 0 && playIntro && Object.keys(smilObject.dynamic).length === 0) {
					const introPromises: Promise<void>[] = [];
					// download intro file before anything else
					const introMedia = await this.processor.downloadIntro();

					downloadPromises = await this.files.prepareDownloadMediaSetup(smilObject);

					introPromises.concat(await this.processor.playIntro(introMedia));

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
					downloadPromises = await this.files.prepareDownloadMediaSetup(smilObject);
					await Promise.all(downloadPromises);
					debug('SMIL media files download finished');
					await this.dataPrepare.manageFilesAndInfo(smilObject, internalStorageUnit, smilUrl);
				}

				// smil processing ok, end loop
				xmlOkParsed = true;

				debug('Starting to process parsed smil file');
				const restart = () =>
					this.main(
						internalStorageUnit,
						smilUrl,
						thisSos,
						false,
						false,
						smilObject.refresh.fallbackToPreviousPlaylist,
					);
				// if smil has dynamic playlist, refresh is done using applet.refresh and hence its always first iteration
				// const firstIteration = hasDynamicContent(smilObject);
				await this.processor.processingLoop(smilFile, firstIteration, restart);
			} catch (err) {
				if (err instanceof EmptyPlaylistError) {
					debug('Fallback to previous playlist because new SMIL file has empty playlist');
					return await this.fallbackToPreviousPlaylist(
						internalStorageUnit,
						smilUrl,
						thisSos,
						invalidSmilLooping,
						SMILEnums.defaultRefresh * 1000,
					);
				}
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

				if (ignoreInvalidSmil) {
					debug('fallbackToPreviousPlaylist is on, ignoring new invalid playlist');
					return await this.fallbackToPreviousPlaylist(
						internalStorageUnit,
						smilUrl,
						thisSos,
						invalidSmilLooping,
						SMILEnums.defaultDownloadRetry * 1000,
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

	private fallbackToPreviousPlaylist = async (
		internalStorageUnit: IStorageUnit,
		smilUrl: string,
		thisSos: FrontApplet,
		invalidSmilLooping: boolean,
		interval: number,
	) => {
		if (invalidSmilLooping) {
			debug('Unexpected error occurred, another checker looping');
			return smilUpdate.invalid;
		}

		const intervalId = setInterval(async () => {
			const response = await this.main(internalStorageUnit, smilUrl, thisSos, false, false, true, true);
			if (response !== smilUpdate.invalid) {
				console.debug('Found valid smil file, exiting invalid smil loop');
				clearInterval(intervalId);
			}
		}, interval);
	};
}
