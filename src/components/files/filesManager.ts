/* tslint:disable:Unnecessary semicolon missing whitespace */
import isNil = require('lodash/isNil');
import get = require('lodash/get');

const isUrl = require('is-url-superb');
import moment from 'moment';
import path from 'path';
import FrontApplet from '@signageos/front-applet/es6/FrontApplet/FrontApplet';
import { IStorageUnit } from '@signageos/front-applet/es6/FrontApplet/FileSystem/types';
import {
	convertRelativePathToAbsolute,
	createCustomEndpointMessagePayload,
	createDownloadPath,
	createJsonStructureMediaInfo,
	createLocalFilePath,
	createPoPMessagePayload,
	createSourceReportObject,
	debug,
	getFileName,
	isWidgetUrl,
	mapFileType,
	shouldNotDownload,
	updateJsonObject,
} from './tools';
import {
	CUSTOM_ENDPOINT_OFFLINE_INTERVAL,
	CUSTOM_ENDPOINT_REPORT_FILE_LIMIT,
	FileStructure,
	MINIMAL_STORAGE_FREE_SPACE,
	smilLogging,
} from '../../enums/fileEnums';
import {
	CheckETagFunctions,
	MediaInfoObject,
	MergedDownloadList,
	SMILFile,
	SMILFileObject,
} from '../../models/filesModels';
import {
	SMILAudio,
	SMILImage,
	SMILTicker,
	SMILMediaNoVideo,
	SMILVideo,
	SMILWidget,
	SosHtmlElement,
} from '../../models/mediaModels';
import { CustomEndpointReport, ItemType, MediaItemType, Report } from '../../models/reportingModels';
import { IFilesManager } from './IFilesManager';
import { sleep } from '../playlist/tools/generalTools';
import { SmilLogger } from '../../models/xmlJsonModels';
import IRecordItemOptions from '@signageos/front-applet/es6/FrontApplet/ProofOfPlay/IRecordItemOptions';
import { SMILScheduleEnum } from '../../enums/scheduleEnums';
import { ConditionalExprFormat } from '../../enums/conditionalEnums';

declare global {
	interface Window {
		getAuthHeaders?: (url: string) => Record<string, string>;
	}
}

export class FilesManager implements IFilesManager {
	private sos: FrontApplet;
	private smilFileUrl: string;
	private internalStorageUnit: IStorageUnit;
	private offlineReportsInfoObject: {
		[key: number]: {
			numberOfReports: number;
		};
	} = {};
	private smilLogging: SmilLogger = {
		enabled: false,
	};

	constructor(sos: FrontApplet) {
		this.sos = sos;
	}

	public setSmilUrl = (url: string) => {
		this.smilFileUrl = url;
	};

	public setLocalStorageUnit = (internalStorageUnit: IStorageUnit) => {
		this.internalStorageUnit = internalStorageUnit;
	};

	public setSmiLogging = (_smilLogging: SmilLogger) => {
		this.smilLogging = _smilLogging;
	};

	public sendReport = async (message: Report) => {
		if (this.smilLogging.enabled) {
			debug('Sending report: %O', message);
			await this.sos.command.dispatch(message);
		}
	};

	public sendPoPReport = async (message: IRecordItemOptions) => {
		if (this.smilLogging.enabled) {
			debug('Sending PoP report: %O', message);
			await this.sos.proofOfPlay.recordItemPlayed(message);
		}
	};

	public watchCustomEndpointReports = async () => {
		const arrayOfReportFiles = await this.sos.fileSystem.listFiles({
			storageUnit: this.internalStorageUnit,
			filePath: FileStructure.offlineReports,
		});

		debug('Number of custom endpoint report files', arrayOfReportFiles.length);

		if (arrayOfReportFiles.length > 0) {
			for (const file of arrayOfReportFiles) {
				try {
					// get fileIndex of the current file
					const fileIndex = parseInt(file.filePath.split('.csv')[0].replace(/\D/g, ''), 10);

					debug('getting file index for offline reports', fileIndex);
					const fileContent = await this.sos.fileSystem.readFile({
						storageUnit: this.internalStorageUnit,
						filePath: file.filePath,
					});

					const arrayOfReports = fileContent
						.split('\n')
						.map((jsonString) => {
							// no empty strings
							if (jsonString.length > 0) {
								return JSON.parse(jsonString);
							}
						})
						.filter((item): item is CustomEndpointReport => item !== undefined);

					debug('Sending custom endpoint report file: %s', file.filePath);
					const start = Date.now();

					await this.sendCustomEndpointReport(arrayOfReports, true);

					debug('Custom endpoint report file: %s, request took: %s ms', file.filePath, Date.now() - start);

					await this.sos.fileSystem.deleteFile(
						{
							storageUnit: this.internalStorageUnit,
							filePath: file.filePath,
						},
						true,
					);

					// reset number of reports in file due to the bug with repeated connection issues
					delete this.offlineReportsInfoObject[fileIndex];

					debug('Custom endpoint report file deleted: %s', file.filePath);
				} catch (err) {
					debug(
						'Unexpected error occurred during sending custom endpoint report file: %s, error: %O',
						file.filePath,
						err,
					);
				}
			}
		}
		await sleep(CUSTOM_ENDPOINT_OFFLINE_INTERVAL);
	};

	public sendCustomEndpointReport = async (
		message: CustomEndpointReport | CustomEndpointReport[],
		offlineUpload: boolean = false,
	) => {
		try {
			const payload = Array.isArray(message) ? message : [message];

			debug('Sending custom endpoint report: %s. %O', new Date().toISOString(), payload);
			const response = await fetch(this.smilLogging.endpoint!, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(payload),
			});

			debug('Custom endpoint report send: %O', payload);

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
		} catch (error) {
			debug('Unexpected error occurred during custom endpoint report:', error);
			if (offlineUpload) {
				throw new Error('Error during offline custom endpoint report upload');
			}
			await this.saveCustomEndpointInfo(message as CustomEndpointReport);
		}
	};

	public sendGeneralErrorReport = async (message: string) => {
		await this.sendReport({
			type: 'SMIL.Error',
			failedAt: moment().toDate(),
			errorMessage: message,
		});
	};

	public sendDownloadReport = async (
		fileType: ItemType,
		localFilePath: string,
		value: MergedDownloadList,
		taskStartDate: Date,
		errMessage: string | null = null,
	) => {
		if (this.smilLogging.type === smilLogging.proofOfPlay && value.popName) {
			// to create difference between download and media played
			value.popName = 'media-download';
			await this.sendPoPReport(createPoPMessagePayload(value, errMessage, 'download'));
		}
		await this.sendReport({
			type: 'SMIL.FileDownloaded',
			itemType: fileType,
			source: createSourceReportObject(localFilePath, value.src, this.internalStorageUnit.type),
			startedAt: taskStartDate,
			succeededAt: isNil(errMessage) ? moment().toDate() : null,
			failedAt: isNil(errMessage) ? null : moment().toDate(),
			errorMessage: errMessage,
		});
	};

	public sendMediaReport = async (
		value: SMILVideo | SMILMediaNoVideo | SMILTicker | SosHtmlElement,
		taskStartDate: Date,
		itemType: MediaItemType,
		isMediaSynced: boolean,
		errMessage: string | null = null,
	) => {
		if (this.smilLogging.type === smilLogging.proofOfPlay && value.popName) {
			// to create difference between download and media played
			value.popName = 'media-playback';
			await this.sendPoPReport(createPoPMessagePayload(value, errMessage));
			if (this.smilLogging.endpoint) {
				debug('Custom endpoint report enabled: %s', this.smilLogging.enabled);
				await this.sendCustomEndpointReport(
					createCustomEndpointMessagePayload(createPoPMessagePayload(value, errMessage)),
				);
			}
		}
		await this.sendReport({
			type: isMediaSynced ? 'SMIL.MediaPlayed-Synced' : 'SMIL.MediaPlayed',
			itemType: itemType,
			source: 'src' in value ? createSourceReportObject(value.localFilePath, value.src) : ({} as any),
			startedAt: taskStartDate,
			endedAt: isNil(errMessage) ? moment().toDate() : null,
			failedAt: isNil(errMessage) ? null : moment().toDate(),
			errorMessage: errMessage,
		});
	};

	public sendSmiFileReport = async (localFilePath: string, src: string, errMessage: string | null = null) => {
		await this.sendReport({
			type: 'SMIL.PlaybackStarted',
			source: createSourceReportObject(localFilePath, src),
			succeededAt: isNil(errMessage) ? moment().toDate() : null,
			failedAt: isNil(errMessage) ? null : moment().toDate(),
			errorMessage: errMessage,
		});
	};

	public currentFilesSetup = async (widgets: SMILWidget[], smilObject: SMILFileObject, smilUrl: string) => {
		await this.deleteUnusedFiles(smilObject, smilUrl);
		debug('Unused files deleted');

		await this.extractWidgets(widgets);
		debug('Widgets extracted');
	};

	public getFileDetails = async (
		media: SMILVideo | SMILImage | SMILWidget | SMILAudio,
		internalStorageUnit: IStorageUnit,
		fileStructure: string,
	) => {
		debug(`Getting file details for file: %O`, media);
		return this.sos.fileSystem.getFile({
			storageUnit: internalStorageUnit,
			filePath: `${fileStructure}/${getFileName(media.src)}`,
		});
	};

	public shouldUpdateLocalFile = async (
		localFilePath: string,
		media: MergedDownloadList,
		mediaInfoObject: MediaInfoObject,
	): Promise<boolean> => {
		const currentLastModified =
			'fetchLastModified' in media && media.fetchLastModified
				? await media.fetchLastModified()
				: await this.fetchLastModified(media);
		// file was not found
		if (isNil(currentLastModified)) {
			debug(`File was not found on remote server: %O `, media.src);
			return false;
		}

		if (!(await this.fileExists(createLocalFilePath(localFilePath, media.src)))) {
			debug(`File does not exist: %s  downloading`, media.src);
			updateJsonObject(mediaInfoObject, getFileName(media.src), currentLastModified);
			return true;
		}

		const storedLastModified = mediaInfoObject[getFileName(media.src)];

		if (isNil(storedLastModified)) {
			updateJsonObject(mediaInfoObject, getFileName(media.src), currentLastModified);
			return true;
		}

		if (moment(storedLastModified).valueOf() < moment(currentLastModified).valueOf()) {
			debug(`New file version detected: %O `, media.src);
			// update mediaInfo object
			updateJsonObject(mediaInfoObject, getFileName(media.src), currentLastModified);
			return true;
		}

		debug(`File is already downloaded in internal storage: %O `, media.src);
		return false;
	};

	public writeMediaInfoFile = async (mediaInfoObject: object) => {
		debug('Writing to mediaInfo file in persistent storage: %O', mediaInfoObject);
		await this.sos.fileSystem.writeFile(
			{
				storageUnit: this.internalStorageUnit,
				filePath: createLocalFilePath(FileStructure.smilMediaInfo, FileStructure.smilMediaInfoFileName),
			},
			JSON.stringify(mediaInfoObject),
		);
		debug('Writing to mediaInfo file in persistent storage done: %O', mediaInfoObject);
	};

	public deleteFile = async (filePath: string) => {
		try {
			debug('Deleting file from persistent storage: %s', filePath);
			await this.sos.fileSystem.deleteFile(
				{
					storageUnit: this.internalStorageUnit,
					filePath: filePath,
				},
				true,
			);
		} catch (err) {
			debug('Unexpected error occured during deleting file from persistent storage: %s', filePath);
			await this.sendGeneralErrorReport(err.message);
		}
	};

	public readFile = async (filePath: string) => {
		return this.sos.fileSystem.readFile({
			storageUnit: this.internalStorageUnit,
			filePath: filePath,
		});
	};

	public fileExists = async (filePath: string) => {
		return this.sos.fileSystem.exists({
			storageUnit: this.internalStorageUnit,
			filePath: filePath,
		});
	};

	public parallelDownloadAllFiles = async (
		filesList: MergedDownloadList[],
		localFilePath: string,
		forceDownload: boolean = false,
	): Promise<Promise<void>[]> => {
		const promises: Promise<void>[] = [];
		const taskStartDate = moment().toDate();
		const fileType = mapFileType(localFilePath);
		const mediaInfoObject = await this.getOrCreateMediaInfoFile(filesList);
		debug('Received media info object: %s', JSON.stringify(mediaInfoObject));

		await Promise.all(
			filesList.map(async (file) => {
				// do not download website widgets or video streams
				if (shouldNotDownload(localFilePath, file)) {
					debug('Will not download file: %O', file);
					return;
				}

				// check for local urls to files (media/file.mp4)
				file.src = convertRelativePathToAbsolute(file.src, this.smilFileUrl);

				const shouldUpdate = forceDownload
					? true
					: await this.shouldUpdateLocalFile(localFilePath, file, mediaInfoObject);

				// check if file is already downloaded or is forcedDownload to update existing file with new version
				if (shouldUpdate) {
					const fullLocalFilePath = createLocalFilePath(localFilePath, file.src);
					promises.push(
						(async () => {
							try {
								debug(`Downloading file: %s`, file.src);
								const downloadUrl = createDownloadPath(file.src);
								const authHeaders = window.getAuthHeaders?.(downloadUrl);
								if ('download' in file && file.download) {
									await file.download();
								} else {
									await this.sos.fileSystem.downloadFile(
										{
											storageUnit: this.internalStorageUnit,
											filePath: createLocalFilePath(localFilePath, file.src),
										},
										downloadUrl,
										authHeaders,
									);
								}
								this.sendDownloadReport(fileType, fullLocalFilePath, file, taskStartDate);
							} catch (err) {
								debug(`Unexpected error: %O during downloading file: %s`, err, file.src);
								this.sendDownloadReport(fileType, fullLocalFilePath, file, taskStartDate, err.message);
							}
						})(),
					);
				}
			}),
		);

		// for (let i = 0; i < filesList.length; i += 1) {
		// 	const file = filesList[i];
		//
		// 	// do not download website widgets or video streams
		// 	if (shouldNotDownload(localFilePath, file)) {
		// 		debug('Will not download file: %O', file);
		// 		continue;
		// 	}
		//
		// 	// check for local urls to files (media/file.mp4)
		// 	file.src = convertRelativePathToAbsolute(file.src, this.smilFileUrl);
		//
		// 	const shouldUpdate = await this.shouldUpdateLocalFile(localFilePath, file, mediaInfoObject);
		//
		// 	// check if file is already downloaded or is forcedDownload to update existing file with new version
		// 	if (forceDownload || shouldUpdate) {
		// 		const fullLocalFilePath = createLocalFilePath(localFilePath, file.src);
		// 		promises.push(
		// 			(async () => {
		// 				try {
		// 					debug(`Downloading file: %s`, file.src);
		// 					const downloadUrl = createDownloadPath(file.src);
		// 					const authHeaders = window.getAuthHeaders?.(downloadUrl);
		// 					if ('download' in file && file.download) {
		// 						await file.download();
		// 					} else {
		// 						await this.sos.fileSystem.downloadFile(
		// 							{
		// 								storageUnit: this.internalStorageUnit,
		// 								filePath: createLocalFilePath(localFilePath, file.src),
		// 							},
		// 							downloadUrl,
		// 							authHeaders,
		// 						);
		// 					}
		// 					this.sendDownloadReport(fileType, fullLocalFilePath, file, taskStartDate);
		// 				} catch (err) {
		// 					debug(`Unexpected error: %O during downloading file: %s`, err, file.src);
		// 					this.sendDownloadReport(fileType, fullLocalFilePath, file, taskStartDate, err.message);
		// 				}
		// 			})(),
		// 		);
		// 	}
		// }
		// save/update mediaInfoObject to persistent storage
		await this.writeMediaInfoFile(mediaInfoObject);
		return promises;
	};

	/**
	 * prepare folder structure for media files, does not support recursive create
	 */
	public createFileStructure = async () => {
		for (const structPath of Object.values(FileStructure)) {
			if (await this.fileExists(structPath)) {
				debug(`Filepath already exists: %O`, structPath);
				continue;
			}
			debug(`Create directory structure: %O`, structPath);
			await this.sos.fileSystem.createDirectory({
				storageUnit: this.internalStorageUnit,
				filePath: structPath,
			});
		}
	};

	public prepareDownloadMediaSetup = async (smilObject: SMILFileObject): Promise<Promise<void>[]> => {
		let downloadPromises: Promise<void>[] = [];
		debug(`Starting to download files %O:`, smilObject);
		downloadPromises = downloadPromises.concat(
			await this.parallelDownloadAllFiles(smilObject.video, FileStructure.videos),
		);
		downloadPromises = downloadPromises.concat(
			await this.parallelDownloadAllFiles(smilObject.audio, FileStructure.audios),
		);
		downloadPromises = downloadPromises.concat(
			await this.parallelDownloadAllFiles(smilObject.img, FileStructure.images),
		);
		downloadPromises = downloadPromises.concat(
			await this.parallelDownloadAllFiles(smilObject.ref, FileStructure.widgets),
		);
		return downloadPromises;
	};

	public prepareLastModifiedSetup = async (
		smilObject: SMILFileObject,
		smilFile: SMILFile | undefined = undefined,
	): Promise<CheckETagFunctions> => {
		let fileEtagPromisesMedia: Promise<void>[] = [];
		let fileEtagPromisesSMIL: Promise<void>[] = [];
		debug(`Starting to check files for updates %O:`, smilObject);
		try {
			if (smilFile) {
				fileEtagPromisesSMIL = fileEtagPromisesSMIL.concat(
					await this.checkLastModified([smilFile], FileStructure.rootFolder, smilObject.refresh.timeOut),
				);

				return {
					fileEtagPromisesMedia,
					fileEtagPromisesSMIL,
				};
			}
			// check for media updates only if its not switched off in the smil file
			if (!smilObject.onlySmilFileUpdate) {
				fileEtagPromisesMedia = fileEtagPromisesMedia.concat(
					await this.checkLastModified(smilObject.video, FileStructure.videos, smilObject.refresh.timeOut),
				);
				fileEtagPromisesMedia = fileEtagPromisesMedia.concat(
					await this.checkLastModified(smilObject.audio, FileStructure.audios, smilObject.refresh.timeOut),
				);
				fileEtagPromisesMedia = fileEtagPromisesMedia.concat(
					await this.checkLastModified(smilObject.img, FileStructure.images, smilObject.refresh.timeOut),
				);
				fileEtagPromisesMedia = fileEtagPromisesMedia.concat(
					await this.checkLastModified(smilObject.ref, FileStructure.widgets, smilObject.refresh.timeOut),
				);
			}

			return {
				fileEtagPromisesMedia,
				fileEtagPromisesSMIL,
			};
		} catch (err) {
			debug('Unexpected error occurred during lastModified check setup: %O', err);
			// return empty arrays as if no new versions of files were found
			return {
				fileEtagPromisesMedia: [],
				fileEtagPromisesSMIL: [],
			};
		}
	};

	public fetchLastModified = async (
		media: MergedDownloadList,
		timeOut: number = SMILScheduleEnum.fileCheckTimeout,
	): Promise<null | string | number> => {
		try {
			if (media.expr === 'skipContent') {
				delete media.expr;
			}
			const downloadUrl = createDownloadPath(media.src);
			const authHeaders = window.getAuthHeaders?.(downloadUrl);
			const promiseRaceArray = [];
			promiseRaceArray.push(
				fetch(downloadUrl, {
					method: 'HEAD',
					headers: {
						...authHeaders,
						Accept: 'application/json',
					},
					mode: 'cors',
				}),
			);
			promiseRaceArray.push(sleep(timeOut));

			const response = (await Promise.race(promiseRaceArray)) as Response;
			debug('Received response when calling HEAD request for url: %s: %O', media.src, response);
			// TODO: remove 250 and replace with proper status code 404
			if (response && response.status > 399) {
				debug('File not found on server: %s, setting invalid conditional exp to skip the content', media.src);
				media.expr = ConditionalExprFormat.skipContent;
			}

			const newLastModified = response?.headers?.get('last-modified');
			return newLastModified ? newLastModified : 0;
		} catch (err) {
			debug('Unexpected error occurred during lastModified fetch: %O', err);
			return null;
		}
	};

	private getOrCreateMediaInfoFile = async (filesList: MergedDownloadList[]): Promise<MediaInfoObject> => {
		if (
			!(await this.fileExists(
				createLocalFilePath(FileStructure.smilMediaInfo, FileStructure.smilMediaInfoFileName),
			))
		) {
			debug('MediaInfo file not found, creating json object');
			return createJsonStructureMediaInfo(filesList);
		}

		const response = await this.sos.fileSystem.readFile({
			storageUnit: this.internalStorageUnit,
			filePath: createLocalFilePath(FileStructure.smilMediaInfo, FileStructure.smilMediaInfoFileName),
		});
		try {
			return JSON.parse(response);
		} catch (error) {
			debug('Cannot parse smil meta media info', error);
			return createJsonStructureMediaInfo(filesList);
		}
	};

	private saveCustomEndpointInfo = async (customEndpointInfo: CustomEndpointReport) => {
		if (this.internalStorageUnit.freeSpace <= MINIMAL_STORAGE_FREE_SPACE) {
			debug(
				'Not enough space on device to save custom endpoint report, free space: %s',
				this.internalStorageUnit.freeSpace,
			);
			return;
		}

		const arrayOfReportFiles = await this.sos.fileSystem.listFiles({
			storageUnit: this.internalStorageUnit,
			filePath: FileStructure.offlineReports,
		});

		debug('Number of custom endpoint report files', arrayOfReportFiles.length);

		let currentFileIndex = arrayOfReportFiles.length === 0 ? 0 : arrayOfReportFiles.length - 1;

		debug('Number of custom endpoint report files custom index', currentFileIndex);

		if (!this.offlineReportsInfoObject[currentFileIndex]) {
			this.offlineReportsInfoObject[currentFileIndex] = {
				numberOfReports: 0,
			};
		}
		// -1 because its indexed from 0
		if (this.offlineReportsInfoObject[currentFileIndex].numberOfReports > CUSTOM_ENDPOINT_REPORT_FILE_LIMIT - 1) {
			debug('File number of records exceeded ', currentFileIndex);
			currentFileIndex += 1;
			this.offlineReportsInfoObject[currentFileIndex] = {
				numberOfReports: 0,
			};
		}

		if (await this.fileExists(`${FileStructure.offlineReports}/offlineReports${currentFileIndex}.csv`)) {
			debug('appending to a file ', `${FileStructure.offlineReports}/offlineReports${currentFileIndex}.csv`);
			await this.sos.fileSystem.appendFile(
				{
					storageUnit: this.internalStorageUnit,
					filePath: `${FileStructure.offlineReports}/offlineReports${currentFileIndex}.csv`,
				},
				`${JSON.stringify(customEndpointInfo)}\n`,
			);
			this.offlineReportsInfoObject[currentFileIndex].numberOfReports += 1;
		} else {
			debug('creating new file ', `${FileStructure.offlineReports}/offlineReports${currentFileIndex}.csv`);
			await this.sos.fileSystem.writeFile(
				{
					storageUnit: this.internalStorageUnit,
					filePath: `${FileStructure.offlineReports}/offlineReports${currentFileIndex}.csv`,
				},
				`${JSON.stringify(customEndpointInfo)}\n`,
			);
			this.offlineReportsInfoObject[currentFileIndex].numberOfReports = 1;
		}
	};

	private extractWidgets = async (widgets: SMILWidget[]) => {
		for (let i = 0; i < widgets.length; i++) {
			try {
				if (isUrl(widgets[i].src) && isWidgetUrl(widgets[i].src)) {
					debug(
						`Extracting widget: %O to destination path: %O`,
						widgets[i],
						`${FileStructure.extracted}	${getFileName(widgets[i].src)}`,
					);
					await this.sos.fileSystem.extractFile(
						{
							storageUnit: this.internalStorageUnit,
							filePath: `${FileStructure.widgets}/${getFileName(widgets[i].src)}`,
						},
						{
							storageUnit: this.internalStorageUnit,
							filePath: `${FileStructure.extracted}/${getFileName(widgets[i].src)}`,
						},
						'zip',
					);
				}
			} catch (err) {
				debug(`Unexpected error: %O occurred during widget extract: %O`, err, widgets[i]);
			}
		}
	};

	/**
	 * when display changes one smil for another, keep only media which occur in both smils, rest is deleted from disk
	 * @param smilObject - JSON representation of parsed smil file
	 * @param smilUrl -  url to smil file from input
	 */
	private deleteUnusedFiles = async (smilObject: SMILFileObject, smilUrl: string): Promise<void> => {
		const smilMediaArray = [...smilObject.video, ...smilObject.audio, ...smilObject.ref, ...smilObject.img];

		for (let structPath in FileStructure) {
			const downloadedFiles = await this.sos.fileSystem.listFiles({
				filePath: get(FileStructure, structPath),
				storageUnit: this.internalStorageUnit,
			});

			for (let storedFile of downloadedFiles) {
				const storedFileName = path.basename(storedFile.filePath);
				let found = false;
				for (let smilFile of smilMediaArray) {
					if (storedFileName === getFileName(smilFile.src)) {
						debug(`File found in new SMIL file: %s`, storedFile.filePath);
						found = true;
						break;
					}
				}
				if (
					!found &&
					storedFileName !== getFileName(smilUrl) &&
					!storedFileName.includes(FileStructure.smilMediaInfoFileName)
				) {
					// delete only path with files, not just folders
					if (
						!(await this.sos.fileSystem.isDirectory({
							storageUnit: this.internalStorageUnit,
							filePath: storedFile.filePath,
						}))
					) {
						debug(`File was not found in new SMIL file, deleting: %O`, storedFile);
						await this.sos.fileSystem.deleteFile(
							{
								storageUnit: this.internalStorageUnit,
								filePath: storedFile.filePath,
							},
							true,
						);
					}
				}
			}
		}
	};

	/**
	 * 	periodically sends http head request to media url and compare last-modified headers, if its different downloads new version of file
	 * @param filesList - list of files for update checks
	 * @param localFilePath - folder structure specifying path to file
	 * @param timeOut - timeout for the last-modified head request
	 */
	private checkLastModified = async (
		filesList: MergedDownloadList[],
		localFilePath: string,
		timeOut: number,
	): Promise<Promise<void>[]> => {
		let promises: Promise<void>[] = [];
		for (let i = 0; i < filesList.length; i += 1) {
			const file = filesList[i];
			// do not check streams for update
			if (localFilePath === FileStructure.videos && !isNil((file as SMILVideo).isStream)) {
				continue;
			}

			try {
				const newLastModified =
					'fetchLastModified' in file && file.fetchLastModified
						? await file.fetchLastModified()
						: await this.fetchLastModified(file, timeOut);
				if (isNil(newLastModified)) {
					debug(`File was not found on remote server: %O `, file.src);
					continue;
				}

				debug(`Fetched new last-modified header: %s for file: %O `, newLastModified, file.src);

				if (isNil(file.lastModified)) {
					file.lastModified = moment(newLastModified).valueOf();
				}

				if (file.lastModified < moment(newLastModified).valueOf()) {
					debug(`New version of file detected: %O`, file.src);
					promises = promises.concat(await this.parallelDownloadAllFiles([file], localFilePath, true));
				}
			} catch (err) {
				debug('Error occurred: %O during checking file version: %O', err, file);
			}
		}
		return promises;
	};
}
