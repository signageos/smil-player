import { IStorageUnit } from '@signageos/front-applet/es6/FrontApplet/FileSystem/types';
import { defaults as config } from '../../config/parameters';
import { ISos } from '../models/sosModels';
import { SMILFile, SMILFileObject } from '../models/filesModels';
import { isNil, isEmpty } from 'lodash';
import { FileStructure } from '../enums/fileEnums';
import { createLocalFilePath, getFileName } from './files/tools';
import { resetBodyContent, resetBodyMargin, setTransitionsDefinition } from './playlist/tools/htmlTools';
// @ts-ignore
import backupImageLandscape from '../../public/backupImage/backupImage.jpg';
// @ts-ignore
import backupImagePortrait from '../../public/backupImage/backupImage.jpg';
import { generateBackupImagePlaylist, getConfigBoolean, getConfigString, getDefaultRegion, removeWhitespace, sleep } from './playlist/tools/generalTools';
import { debug } from './smilPlayerTools';
import { SMILScheduleEnum } from '../enums/scheduleEnums';
import { SMILEnums, smilUpdate } from '../enums/generalEnums';
import { FilesManager } from './files/filesManager';
import { XmlParser } from './xmlParser/xmlParser';
import { SmilPlayerPlaylist } from './playlist/playlist';
import { PlaylistProcessor } from './playlist/playlistProcessor/playlistProcessor';
import { PlaylistDataPrepare } from './playlist/playlistDataPrepare/playlistDataPrepare';
import { ISmilPlayer } from './ISmilPlayer';
import { EmptyPlaylistError } from '../errors/EmptyPlaylistError';
import Debug from 'debug';
import { getStrategy } from './files/fetchingStrategies/fetchingStrategies';

export class SmilPlayer implements ISmilPlayer {
	private readonly files: FilesManager;
	private readonly smilUrl: string | undefined;
	private xmlParser: XmlParser;
	private playlist: SmilPlayerPlaylist;
	private processor: PlaylistProcessor;
	private dataPrepare: PlaylistDataPrepare;
	private isPollingForPlaylist: boolean = false;

	constructor(private sos: ISos, smilUrl?: string, private configOverrides?: Record<string, string>) {
		this.smilUrl = smilUrl;
		this.files = new FilesManager(sos);
		this.xmlParser = new XmlParser();
		this.playlist = new SmilPlayerPlaylist(sos, this.files);
		this.processor = this.playlist.processor;
		this.dataPrepare = this.playlist.dataPrepare;
	}

	public start = async () => {
		await this.sos.onReady();
		debug('[smil] platform ready');

		// Apply test-time config overrides (e.g. syncGroupName, syncDeviceId, syncServerUrl)
		if (this.configOverrides) {
			for (const [key, value] of Object.entries(this.configOverrides)) {
				(this.sos.config as Record<string, unknown>)[key] = value;
			}
			debug('[smil] Applied config overrides: %O', Object.keys(this.configOverrides));
		}

		// debug disabled by default, enabled only if debugEnabled is set to true in config
		Debug.disable();

		if (this.sos.config.debugEnabled === true || this.sos.config.debugEnabled === 'true') {
			debug('[smil] Debug enabled in config, enabling debug logs');
			Debug.enable('@signageos/smil-player:*');
		}

		let smilUrl = this.smilUrl ? this.smilUrl : this.sos.config.smilUrl;

		if (isNil(smilUrl)) {
			throw new Error('No valid smil url provided');
		}

		if (typeof smilUrl !== 'string') {
			throw new Error('smilUrl must be a string');
		}
		smilUrl = removeWhitespace(smilUrl);

		debug('[smil] SMIL file url: %s', smilUrl);

		const storageUnits = await this.sos.fileSystem.listStorageUnits();

		// reference to persistent storage unit, where player stores all content
		const internalStorageUnit = storageUnits.find((storageUnit) => !storageUnit.removable)!;

		this.processor.setStorageUnit(internalStorageUnit);
		this.files.setLocalStorageUnit(internalStorageUnit);

		await this.files.createFileStructure();

		debug('[smil] created file structure');

		await this.checkAndManageSmilMediaInfo(smilUrl);

		while (true) {
			try {
				const startVersion = this.processor.getPlaylistVersion();
				debug('[smil] Starting SMIL iteration, current playlist version: %s', startVersion);
				await this.main(internalStorageUnit, smilUrl);
				const finishVersion = this.processor.getPlaylistVersion();
				if (startVersion < finishVersion) {
					debug('[smil] Playlist replaced with new version: v%d -> v%d, restarting', startVersion, finishVersion);
					break;
				}
			} catch (err) {
				debug('[smil] Unexpected error during SMIL iteration, retrying after delay: %O', err);
				await sleep(SMILEnums.defaultRefresh * 1000);
			}
		}
	};

	private async checkAndManageSmilMediaInfo(smilUrl: string): Promise<void> {
		try {
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
					debug('[smil] malformed media info file: %s, deleting for fresh start', FileStructure.smilMediaInfoFileName);
					// file is malformed, delete from internal storage
					await this.files.deleteFile(
						createLocalFilePath(FileStructure.smilMediaInfo, FileStructure.smilMediaInfoFileName),
					);
				}
			}
		} catch (err) {
			// Handle any errors that might occur during file operations
			debug('[smil] media info file error: %O', err);
		}
	}

	private async downloadBackupImage(): Promise<void> {
		if (isNil(this.sos.config.backupImageUrl)) {
			return;
		}

		const backupImageObject: SMILFile = {
			src: getConfigString(this.sos.config, 'backupImageUrl')!,
		};

		try {
			// default timeout because at this stage, we dont have info about custom one
			const result = await this.files.parallelDownloadAllFiles(
				[backupImageObject],
				FileStructure.images,
				SMILScheduleEnum.fileCheckTimeout,
				[],
				[],
				getStrategy(SMILEnums.lastModified),
			);

			await Promise.all(result.promises);

			// Get the mediaInfoObject for this file
			const mediaInfoObject = await this.files.getOrCreateMediaInfoFile([backupImageObject]);

			// Update the mediaInfoObject after download completes
			await this.files.updateMediaInfoAfterDownloads(mediaInfoObject, result.filesToUpdate);
		} catch (err) {
			debug('[smil] failed to download backup image: %O', err);
		}
	}

	private async playBackupImage(internalStorageUnit: IStorageUnit, smilUrl: string): Promise<void> {
		const orientedBackupImage =
			document.documentElement.clientWidth >= document.documentElement.clientHeight
				? backupImageLandscape
				: backupImagePortrait;
		const backupImageUrl = !isNil(this.sos.config.backupImageUrl)
			? this.sos.config.backupImageUrl
			: orientedBackupImage;

		debug('[smil] playing backup image');
		const backupPlaylist = generateBackupImagePlaylist(backupImageUrl, '1');
		const regionInfo = <SMILFileObject> getDefaultRegion();

		await this.dataPrepare.getAllInfo(backupPlaylist, regionInfo, internalStorageUnit, smilUrl);
		if (isNil(this.sos.config.backupImageUrl)) {
			backupPlaylist.seq.img.localFilePath = backupImageUrl;
		}
		await this.processor.processPlaylist(backupPlaylist, SMILScheduleEnum.backupImagePlaylistVersion);
	}

	private main = async (
		internalStorageUnit: IStorageUnit,
		smilUrl: string,
		playIntro: boolean = true,
		firstIteration: boolean = true,
		ignoreInvalidSmil: boolean = false,
	) => {
		// allow endless functions to play endlessly
		this.processor.disableLoop(false);
		// set video background to timings value or false
		config.videoOptions.background = getConfigBoolean(this.sos.config, 'videoBackground', false);
		const smilFile: SMILFile = {
			src: smilUrl,
		};
		let downloadPromises: Promise<void>[] = [];

		// set smilUrl in files instance ( links to files might me in media/file.mp4 format )
		this.files.setSmilUrl(smilUrl);

		// Download backup image if configured
		await this.downloadBackupImage();

		let smilFileContent: string = '';
		let xmlOkParsed: boolean = false;

		// wait for successful download of SMIL file, if download or read from internal storage fails
		// wait for one minute and then try to download it again
		while (smilFileContent === '' || !xmlOkParsed) {
			try {
				// Try to download SMIL file - if fails, continue with cached version from local storage
				try {
					const result = await this.files.parallelDownloadAllFiles(
						[smilFile],
						FileStructure.rootFolder,
						SMILScheduleEnum.fileCheckTimeout,
						[],
						[],
						getStrategy(SMILEnums.lastModified),
						false,
					);
					await Promise.all(result.promises);

					// Get the mediaInfoObject for this file
					const mediaInfoObject = await this.files.getOrCreateMediaInfoFile([smilFile]);

					// Update the mediaInfoObject after download completes
					await this.files.updateMediaInfoAfterDownloads(mediaInfoObject, result.filesToUpdate);
				} catch (downloadErr) {
					debug('[smil] download failed, trying cached version: %O', downloadErr);
				}

				// Always try to read from local storage (works with fresh download or cached file)
				smilFileContent = await this.sos.fileSystem.readFile({
					storageUnit: internalStorageUnit,
					filePath: `${FileStructure.rootFolder}/${getFileName(smilFile.src)}`,
				});

				debug('[smil] loaded SMIL content from local storage');
				downloadPromises = [];

				const smilObject: SMILFileObject = await this.xmlParser.processSmilXml(smilFileContent);
				debug('[smil] SMIL file parsed: %O', smilObject);

				if (isEmpty(smilObject.playlist)) {
					debug('[smil] detected empty SMIL playlist, will not process');
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

					introPromises.concat(await this.processor.playIntro(introMedia));

					downloadPromises = await this.files.prepareDownloadMediaSetup(smilObject);

					introPromises.push(
						(async () => {
							await Promise.all(downloadPromises).then(async () => {
								// prepares everything needed for processing playlist
								await this.dataPrepare.manageFilesAndInfo(smilObject, internalStorageUnit, smilUrl);
								// all files are downloaded, stop intro
								debug('[smil] media download complete, stopping intro');
							});
						})(),
					);

					await Promise.race(introPromises);
				} else {
					// no intro
					debug('[smil] no intro element, skipping intro');
					downloadPromises = await this.files.prepareDownloadMediaSetup(smilObject);
					await Promise.all(downloadPromises);
					debug('[smil] media download complete');
					await this.dataPrepare.manageFilesAndInfo(smilObject, internalStorageUnit, smilUrl);
				}

				// smil processing ok, end loop
				xmlOkParsed = true;

				debug('[smil] starting playlist processing');
				const restart = () =>
					this.main(
						internalStorageUnit,
						smilUrl,
						false,
						false,
						smilObject.refresh.fallbackToPreviousPlaylist,
					);
				await this.processor.processingLoop(smilFile, firstIteration, restart);
			} catch (err) {
				if (err instanceof EmptyPlaylistError) {
					debug('[smil] falling back to previous playlist: new SMIL has empty playlist');

					// If already polling (called from interval), return failure and let interval continue
					if (this.isPollingForPlaylist) {
						debug('[smil] skipping empty playlist from poll, will retry next interval');
						return smilUpdate.invalid;
					}

					// Show backup image if nothing is currently playing (first startup)
					if (firstIteration) {
						await this.playBackupImage(internalStorageUnit, smilUrl);
					}

					// Start polling and block until valid SMIL is found
					await this.fallbackToPreviousPlaylist(
						internalStorageUnit,
						smilUrl,
						SMILEnums.defaultRefresh * 1000,
					);
					return;
				}
				if (smilFileContent === '') {
					debug('[smil] SMIL download error: %O', err);
				} else {
					debug('[smil] XML parse error: %O', err);
					await this.files.sendSmiFileReport(
						`${FileStructure.rootFolder}/${getFileName(smilFile.src)}`,
						smilFile.src,
						err.message,
					);
				}

				if (ignoreInvalidSmil) {
					// If already polling (called from interval), return failure and let interval continue
					if (this.isPollingForPlaylist) {
						debug('[smil] skipping invalid SMIL from poll: %s, will retry next interval', err.message || err);
						return smilUpdate.invalid;
					}
					debug('[smil] ignoring invalid SMIL: fallbackToPreviousPlaylist enabled');
					return await this.fallbackToPreviousPlaylist(
						internalStorageUnit,
						smilUrl,
						SMILEnums.defaultDownloadRetry * 1000,
					);
				}

				await this.playBackupImage(internalStorageUnit, smilUrl);
				await sleep(SMILEnums.defaultDownloadRetry * 1000);
			}
		}
	};

	private fallbackToPreviousPlaylist = async (
		internalStorageUnit: IStorageUnit,
		smilUrl: string,
		interval: number,
	): Promise<void> => {
		if (this.isPollingForPlaylist) {
			debug('[smil] skipping poll: another checker already active');
			return;
		}

		this.isPollingForPlaylist = true;

		return new Promise<void>((resolve) => {
			const intervalId = setInterval(
				async () => {
					const response = await this.main(internalStorageUnit, smilUrl, false, false, true);
					if (response !== smilUpdate.invalid) {
						debug('[smil] found valid SMIL file, exiting invalid smil polling loop');
						this.isPollingForPlaylist = false;
						clearInterval(intervalId);
						resolve();
					}
				},
				interval,
			);
		});
	}
}
