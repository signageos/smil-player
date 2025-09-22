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
import { MediaInfoObject, MergedDownloadList, SMILFile, SMILFileObject } from '../../models/filesModels';
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
import { IFilesManager, UpdateCheckResult } from './IFilesManager';
import { sleep } from '../playlist/tools/generalTools';
import { SmilLogger } from '../../models/xmlJsonModels';
import IRecordItemOptions from '@signageos/front-applet/es6/FrontApplet/ProofOfPlay/IRecordItemOptions';
import { SMILScheduleEnum } from '../../enums/scheduleEnums';
import { Resource } from './resourceChecker/resourceChecker';
import { FetchStrategy } from './IFilesManager';
import { getStrategy } from './fetchingStrategies/fetchingStrategies';
import { SMILEnums } from '../../enums/generalEnums';
import { ConditionalExprFormat } from '../../enums/conditionalEnums';

declare global {
	interface Window {
		getAuthHeaders?: (url: string) => Record<string, string>;
	}
}

// Type for tracking content movements between URLs
interface ContentMovement {
	sourceFileName: string; // The file that contains the content (e.g., "video_hashA.mp4")
	sourceFilePath?: string; // Full path to the source file (populated later)
	destinationFileNames: Set<string>; // Files that need this content (e.g., Set(["video_hashB.mp4"]))
	contentValue: string | number; // The value that identifies this content (redirect URL or timestamp)
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
	// Batch update state for atomic mediaInfoObject updates
	private batchUpdates: Map<string, string | number> = new Map();
	// Track files downloaded to temp folders: filename -> temp path
	private tempDownloads: Map<string, string> = new Map();

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

					await this.deleteFile(file.filePath);

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

			debug(
				'Sending custom endpoint report: %s. %O',
				new Date().toISOString(),
				this.smilLogging.endpoint!,
				payload,
			);
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
		if (this.smilLogging.type?.includes(smilLogging.proofOfPlay) && value.popName) {
			// to create difference between download and media played
			value.popName = 'media-download';
			await this.sendPoPReport(createPoPMessagePayload(value, errMessage, 'download'));
		}
		if (this.smilLogging.type?.includes(smilLogging.standard)) {
			await this.sendReport({
				type: 'SMIL.FileDownloaded',
				itemType: fileType,
				source: createSourceReportObject(
					localFilePath,
					value.useInReportUrl || value.src,
					this.internalStorageUnit.type,
				),
				startedAt: taskStartDate,
				succeededAt: isNil(errMessage) ? moment().toDate() : null,
				failedAt: isNil(errMessage) ? null : moment().toDate(),
				errorMessage: errMessage,
			});
		}
	};

	public sendMediaReport = async (
		value: SMILVideo | SMILMediaNoVideo | SMILTicker | SosHtmlElement,
		taskStartDate: Date,
		itemType: MediaItemType,
		isMediaSynced: boolean,
		errMessage: string | null = null,
	) => {
		if (this.smilLogging.type?.includes(smilLogging.proofOfPlay) && value.popName) {
			// to create difference between download and media played
			value.popName = 'media-playback';
			if (this.smilLogging.endpoint) {
				debug('Custom endpoint report enabled: %s', this.smilLogging.enabled);
				await this.sendCustomEndpointReport(
					createCustomEndpointMessagePayload(createPoPMessagePayload(value, errMessage)),
				);
			} else {
				await this.sendPoPReport(createPoPMessagePayload(value, errMessage));
			}
		}
		if (this.smilLogging.type?.includes(smilLogging.standard)) {
			await this.sendReport({
				type: isMediaSynced ? 'SMIL.MediaPlayed-Synced' : 'SMIL.MediaPlayed',
				itemType: itemType,
				source: 'src' in value ? createSourceReportObject(value.localFilePath, value.src) : ({} as any),
				startedAt: taskStartDate,
				endedAt: isNil(errMessage) ? moment().toDate() : null,
				failedAt: isNil(errMessage) ? null : moment().toDate(),
				errorMessage: errMessage,
			});
		}
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
		timeOut: number,
		skipContentHttpStatusCodes: number[] = [],
		updateContentHttpStatusCodes: number[] = [],
		fetchStrategy: FetchStrategy,
	): Promise<UpdateCheckResult> => {
		const currentValue = await fetchStrategy(
			media,
			timeOut,
			skipContentHttpStatusCodes,
			updateContentHttpStatusCodes,
			this.makeXhrRequest,
		);
		// file was not found
		if (isNil(currentValue)) {
			debug(`File was not found on remote server: %O `, media.src);
			return { shouldUpdate: false };
		}

		// Check if content should be skipped (set by fetch strategy)
		if (media.expr === ConditionalExprFormat.skipContent) {
			debug(`Content marked as skip for media: %s, not downloading`, media.src);
			return { shouldUpdate: false };
		}

		const storedValue = mediaInfoObject[getFileName(media.src)];
		debug(`Stored value for file %s: %O`, media.src, storedValue);

		if (isNil(storedValue)) {
			return {
				shouldUpdate: true,
				value: currentValue,
			};
		}

		// Location strategy uses strings as values, while lastModified uses timestamps
		const isLocationStrategy = fetchStrategy.strategyType === SMILEnums.location;
		debug('isLocationStrategy', isLocationStrategy);

		// Helper function to strip __smil_version query parameter from URL
		const stripSmilVersion = (url: string | null): string | null => {
			if (!url) {
				return url;
			}
			try {
				const urlObj = new URL(url);
				urlObj.searchParams.delete('__smil_version');
				return urlObj.toString();
			} catch {
				// If URL parsing fails, return original
				return url;
			}
		};

		// Debug logging for location strategy edge cases
		if (isLocationStrategy) {
			if (currentValue === null) {
				debug('Location strategy: currentValue is null (request failed or no Location header)');
			}
			if (stripSmilVersion(currentValue) === stripSmilVersion(media.src)) {
				debug('Location strategy: currentValue equals media.src (no redirect, same URL returned)');
			}
			// Log the comparison values for debugging
			debug(
				'Location strategy comparison - currentValue: %s, media.src: %s, storedValue: %s',
				stripSmilVersion(currentValue),
				stripSmilVersion(media.src),
				stripSmilVersion(storedValue as string),
			);
		}

		const isNewVersion = isLocationStrategy
			? currentValue !== null &&
			  stripSmilVersion(currentValue) !== stripSmilVersion(media.src) &&
			  currentValue !== storedValue
			: moment(storedValue).valueOf() < moment(currentValue).valueOf();

		// Check if we already have this content (for location strategy only)
		if (isNewVersion && isLocationStrategy && this.isValueAlreadyStored(currentValue, mediaInfoObject)) {
			debug(
				`Content already exists locally with value: %s, skipping download but updating mapping`,
				currentValue,
			);
			return {
				shouldUpdate: false,
				value: currentValue, // Still return the value to update mediaInfoObject
			};
		}

		if (isNewVersion) {
			debug(`New file version detected: %O `, media.src);
			return {
				shouldUpdate: true,
				value: currentValue,
			};
		}

		if (!(await this.fileExists(createLocalFilePath(localFilePath, media.src)))) {
			debug(`File does not exist in local storage: %s  downloading`, media.src);
			return {
				shouldUpdate: true,
				value: currentValue,
			};
		}

		debug(`File is already downloaded in internal storage: %O `, media.src);
		return { shouldUpdate: false };
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
			debug('Unexpected error occurred during deleting file from persistent storage: %s', filePath);
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
		timeOut: number,
		skipContentHttpStatusCodes: number[] = [],
		updateContentHttpStatusCodes: number[] = [],
		fetchStrategy: FetchStrategy,
		forceDownload: boolean = false,
		latestRemoteValue?: string,
	): Promise<{ promises: Promise<void>[]; filesToUpdate: Map<string, number | string> }> => {
		const promises: Promise<void>[] = [];
		const taskStartDate = moment().toDate();
		const fileType = mapFileType(localFilePath);
		const mediaInfoObject = await this.getOrCreateMediaInfoFile(filesList);
		debug('Received media info object: %s', JSON.stringify(mediaInfoObject));

		// Create a map to track which files need to be updated in mediaInfoObject
		const filesToUpdate: Map<string, number | string> = new Map();

		await Promise.all(
			filesList.map(async (file) => {
				// do not download website widgets or video streams
				if (shouldNotDownload(localFilePath, file)) {
					debug('Will not download file: %O', file);
					return;
				}

				// check for local urls to files (media/file.mp4)
				file.src = convertRelativePathToAbsolute(file.src, this.smilFileUrl);

				const updateCheck = forceDownload
					? {
							shouldUpdate: true,
							value: latestRemoteValue,
					  }
					: await this.shouldUpdateLocalFile(
							localFilePath,
							file,
							mediaInfoObject,
							timeOut,
							skipContentHttpStatusCodes,
							updateContentHttpStatusCodes,
							fetchStrategy,
					  );

				// check if file is already downloaded or is forcedDownload to update existing file with new version
				if (updateCheck.shouldUpdate) {
					const updateValue = 'value' in updateCheck ? updateCheck.value : undefined;
					if (updateValue) {
						// Store the value for later update after successful download
						filesToUpdate.set(getFileName(file.src), updateValue);
					}

					// Determine if this is new content that should go to temp folder
					// Use temp folder when forceDownload is true AND content is genuinely new
					const isNewContent =
						forceDownload && updateValue && !this.isValueAlreadyStored(updateValue, mediaInfoObject);
					const downloadPath = isNewContent ? this.getTempFolder(localFilePath) : localFilePath;

					if (isNewContent) {
						debug('Using temp folder for new content: %s instead of %s', downloadPath, localFilePath);
					}

					const fullLocalFilePath = createLocalFilePath(localFilePath, file.src);
					const actualDownloadPath = createLocalFilePath(downloadPath, file.src);

					promises.push(
						(async () => {
							try {
								debug(`Downloading file: %O`, updateValue ?? file.src);
								// Location strategy uses strings as values, while lastModified uses timestamps
								const isLocationStrategy = fetchStrategy.strategyType === SMILEnums.location;
								let downloadUrl: string;

								if (isLocationStrategy && !!updateValue && isUrl(updateValue)) {
									downloadUrl = createDownloadPath(updateValue);
								} else {
									downloadUrl = createDownloadPath(file.src);
								}
								debug(`Using downloadUrl: %s for file: %s`, downloadUrl, file.src);
								const authHeaders = window.getAuthHeaders?.(downloadUrl);

								await this.sos.fileSystem.downloadFile(
									{
										storageUnit: this.internalStorageUnit,
										filePath: actualDownloadPath,
									},
									downloadUrl,
									authHeaders,
								);

								debug(`File downloaded to: %s`, actualDownloadPath);

								// Track file in temp if using temp folder
								if (isNewContent) {
									const fileName = getFileName(file.src);
									this.tempDownloads.set(fileName, actualDownloadPath);
									debug(`Tracked temp download: %s -> %s`, fileName, actualDownloadPath);
								}

								this.sendDownloadReport(fileType, fullLocalFilePath, file, taskStartDate);
							} catch (err) {
								debug(`Unexpected error: %O during downloading file: %s`, err, file.src);
								this.sendDownloadReport(fileType, fullLocalFilePath, file, taskStartDate, err.message);
								// Remove from filesToUpdate if download failed
								filesToUpdate.delete(getFileName(file.src));
							}
						})(),
					);
				} else if (updateCheck.value) {
					// File doesn't need download but we need to update the mediaInfoObject
					// This happens when content is already downloaded but moved to a new URL
					debug(`Updating mediaInfoObject for %s without download`, file.src);
					filesToUpdate.set(getFileName(file.src), updateCheck.value);
				}
			}),
		);

		// Return both the promises array and the filesToUpdate map
		return { promises, filesToUpdate };
	};

	// New method to update mediaInfoObject after downloads complete
	public updateMediaInfoAfterDownloads = async (
		mediaInfoObject: MediaInfoObject,
		filesToUpdate: Map<string, number | string>,
	): Promise<void> => {
		// Update mediaInfoObject with successful downloads
		filesToUpdate.forEach((value, fileName) => {
			debug(`Updating mediaInfoObject for file: %s with value: %O`, fileName, value);
			updateJsonObject(mediaInfoObject, fileName, value);
		});

		// Save/update mediaInfoObject to persistent storage
		await this.writeMediaInfoFile(mediaInfoObject);
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
			// Add specific debug for temp folders
			if (structPath.endsWith('/tmp')) {
				debug(`Creating temp directory for atomic updates: %O`, structPath);
			} else {
				debug(`Create directory structure: %O`, structPath);
			}
			await this.sos.fileSystem.createDirectory({
				storageUnit: this.internalStorageUnit,
				filePath: structPath,
			});
		}
	};

	public prepareDownloadMediaSetup = async (smilObject: SMILFileObject): Promise<Promise<void>[]> => {
		let downloadPromises: Promise<void>[] = [];
		debug(`Starting to download files %O:`, smilObject);

		// Create a map to track all files that need to be updated in mediaInfoObject
		const allFilesToUpdate: Map<string, number | string> = new Map();

		// Get the mediaInfoObject once for all operations
		const mediaInfoObject = await this.getOrCreateMediaInfoFile([
			...smilObject.video,
			...smilObject.audio,
			...smilObject.img,
			...smilObject.ref,
		]);

		// Get the appropriate fetch strategy based on update mechanism
		const fetchStrategy = getStrategy(smilObject.updateMechanism);

		// Process each media type and collect promises and files to update
		const videoResult = await this.parallelDownloadAllFiles(
			smilObject.video,
			FileStructure.videos,
			smilObject.refresh.timeOut,
			smilObject.skipContentOnHttpStatus,
			smilObject.updateContentOnHttpStatus,
			fetchStrategy,
		);
		downloadPromises = downloadPromises.concat(videoResult.promises);
		// Merge the filesToUpdate maps
		videoResult.filesToUpdate.forEach((value, key) => allFilesToUpdate.set(key, value));

		const audioResult = await this.parallelDownloadAllFiles(
			smilObject.audio,
			FileStructure.audios,
			smilObject.refresh.timeOut,
			smilObject.skipContentOnHttpStatus,
			smilObject.updateContentOnHttpStatus,
			fetchStrategy,
		);
		downloadPromises = downloadPromises.concat(audioResult.promises);
		audioResult.filesToUpdate.forEach((value, key) => allFilesToUpdate.set(key, value));

		const imgResult = await this.parallelDownloadAllFiles(
			smilObject.img,
			FileStructure.images,
			smilObject.refresh.timeOut,
			smilObject.skipContentOnHttpStatus,
			smilObject.updateContentOnHttpStatus,
			fetchStrategy,
		);
		downloadPromises = downloadPromises.concat(imgResult.promises);
		imgResult.filesToUpdate.forEach((value, key) => allFilesToUpdate.set(key, value));

		const refResult = await this.parallelDownloadAllFiles(
			smilObject.ref,
			FileStructure.widgets,
			smilObject.refresh.timeOut,
			smilObject.skipContentOnHttpStatus,
			smilObject.updateContentOnHttpStatus,
			fetchStrategy,
		);
		downloadPromises = downloadPromises.concat(refResult.promises);
		refResult.filesToUpdate.forEach((value, key) => allFilesToUpdate.set(key, value));

		// Wait for all downloads to complete
		await Promise.all(downloadPromises);

		// Update mediaInfoObject and save to storage after all downloads are complete
		console.log('1');
		await this.updateMediaInfoAfterDownloads(mediaInfoObject, allFilesToUpdate);

		return downloadPromises;
	};

	public prepareLastModifiedSetup = async (smilObject: SMILFileObject, smilFile: SMILFile): Promise<Resource[]> => {
		let resourceCheckers: Resource[] = [];
		debug(`Starting to check files for updates %O:`, smilObject);
		try {
			// For SMIL file, always use lastModified strategy
			const smilFetchStrategy = getStrategy(SMILEnums.lastModified);

			resourceCheckers = resourceCheckers.concat(
				this.convertToResourcesCheckerFormat(
					[smilFile],
					FileStructure.rootFolder,
					smilObject.refresh.timeOut,
					smilObject.refresh.smilFileRefresh,
					[],
					[],
					smilFetchStrategy,
					true,
				),
			);

			// check for media updates only if its not switched off in the smil file
			if (!smilObject.onlySmilFileUpdate) {
				// For media files, use the strategy based on update mechanism
				const mediaFetchStrategy = getStrategy(smilObject.updateMechanism);

				resourceCheckers = resourceCheckers.concat(
					this.convertToResourcesCheckerFormat(
						smilObject.video,
						FileStructure.videos,
						smilObject.refresh.timeOut,
						smilObject.refresh.refreshInterval,
						smilObject.skipContentOnHttpStatus,
						smilObject.updateContentOnHttpStatus,
						mediaFetchStrategy,
					),
				);

				resourceCheckers = resourceCheckers.concat(
					this.convertToResourcesCheckerFormat(
						smilObject.audio,
						FileStructure.audios,
						smilObject.refresh.timeOut,
						smilObject.refresh.refreshInterval,
						smilObject.skipContentOnHttpStatus,
						smilObject.updateContentOnHttpStatus,
						mediaFetchStrategy,
					),
				);

				resourceCheckers = resourceCheckers.concat(
					this.convertToResourcesCheckerFormat(
						smilObject.img,
						FileStructure.images,
						smilObject.refresh.timeOut,
						smilObject.refresh.refreshInterval,
						smilObject.skipContentOnHttpStatus,
						smilObject.updateContentOnHttpStatus,
						mediaFetchStrategy,
					),
				);

				resourceCheckers = resourceCheckers.concat(
					this.convertToResourcesCheckerFormat(
						smilObject.ref,
						FileStructure.widgets,
						smilObject.refresh.timeOut,
						smilObject.refresh.refreshInterval,
						smilObject.skipContentOnHttpStatus,
						smilObject.updateContentOnHttpStatus,
						mediaFetchStrategy,
					),
				);
			}

			return resourceCheckers;
		} catch (err) {
			debug('Unexpected error occurred during lastModified check setup: %O', err);
			// return empty arrays as if no new versions of files were found
		}
		return [];
	};

	/**
	 * Get or create media info file
	 * @param filesList - Files to get or create media info for
	 * @returns Media info object
	 */
	public getOrCreateMediaInfoFile = async (filesList: MergedDownloadList[]): Promise<MediaInfoObject> => {
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

	// Batch update methods for atomic mediaInfoObject updates
	public startBatch = (): void => {
		debug('Starting batch collection for mediaInfoObject updates');
		this.batchUpdates.clear();
	};

	public collectUpdate = (fileName: string, value: string | number): void => {
		debug('Collecting batch update for file: %s with value: %s', fileName, value);
		this.batchUpdates.set(fileName, value);
	};

	public commitBatch = async (filesList: MergedDownloadList[]): Promise<void> => {
		if (this.batchUpdates.size === 0 && this.tempDownloads.size === 0) {
			debug('No batch updates or temp downloads to commit');
			return;
		}

		debug('Committing %d batch updates and %d temp downloads', this.batchUpdates.size, this.tempDownloads.size);

		// Read current mediaInfoObject
		const mediaInfoObject = await this.getOrCreateMediaInfoFile(filesList);

		// Migrate files from temp to standard if needed
		if (this.tempDownloads.size > 0) {
			debug('Triggering migration from temp to standard folders');
			await this.migrateFromTempToStandard(filesList, mediaInfoObject);
		}

		// Apply all collected updates to mediaInfoObject
		for (const [fileName, value] of this.batchUpdates) {
			const oldValue = mediaInfoObject[fileName];
			mediaInfoObject[fileName] = value;
			debug('Batch update: mediaInfoObject[%s] from %s to %s', fileName, oldValue, value);
		}

		// Write mediaInfoObject once after all updates (as requested - last step)
		await this.writeMediaInfoFile(mediaInfoObject);
		debug('Batch updates committed and mediaInfoObject saved');

		// Clear batch after successful commit
		this.batchUpdates.clear();
		// tempDownloads already cleared in migrateFromTempToStandard
	};

	private isValueAlreadyStored = (value: string | null, mediaInfoObject: MediaInfoObject): boolean => {
		if (!value) {
			return false;
		}
		return Object.values(mediaInfoObject).some((storedValue) => storedValue === value);
	};

	/**
	 * Get the temp folder path for a given standard folder path
	 */
	private getTempFolder = (standardFolder: string): string => {
		switch (standardFolder) {
			case FileStructure.videos:
				return FileStructure.videosTmp;
			case FileStructure.images:
				return FileStructure.imagesTmp;
			case FileStructure.audios:
				return FileStructure.audiosTmp;
			case FileStructure.widgets:
				return FileStructure.widgetsTmp;
			default:
				debug('No temp folder defined for: %s, using standard folder', standardFolder);
				return standardFolder;
		}
	};

	/**
	 * Clear temp downloads tracking
	 */
	private clearTempDownloads = (): void => {
		debug('Clearing temp downloads tracking. Previous count: %d', this.tempDownloads.size);
		this.tempDownloads.clear();
	};

	/**
	 * Determine the full file path for a given filename by searching in all media folders
	 * @param fileName - The filename to search for (e.g., "video_hash123.mp4")
	 * @returns The full file path if found, null otherwise
	 */
	private determineFilePath = async (fileName: string): Promise<string | null> => {
		const folders = [FileStructure.videos, FileStructure.images, FileStructure.audios, FileStructure.widgets];

		for (const folder of folders) {
			const filePath = `${folder}/${fileName}`;
			try {
				if (await this.fileExists(filePath)) {
					debug('Found file %s at path: %s', fileName, filePath);
					return filePath;
				}
			} catch (err) {
				debug('Error checking file existence at %s: %O', filePath, err);
			}
		}

		debug('File %s not found in any media folder', fileName);
		return null;
	};

	/**
	 * Check if there's enough available storage space for operations
	 * @param estimatedRequiredSpace - Estimated space needed in bytes
	 * @returns True if there's enough space, false otherwise
	 */
	private checkAvailableSpace = async (estimatedRequiredSpace: number): Promise<boolean> => {
		try {
			// Get free space directly from the internal storage unit
			const availableSpace = this.internalStorageUnit.freeSpace || 0;

			// Add safety margin - require at least 10% more space than estimated
			const safetyMargin = 1.1;
			const requiredWithMargin = estimatedRequiredSpace * safetyMargin;
			const hasEnoughSpace = availableSpace > requiredWithMargin;

			debug(
				'Storage check: Available: %d MB, Required: %d MB (with margin: %d MB), Sufficient: %s',
				Math.round(availableSpace / (1024 * 1024)),
				Math.round(estimatedRequiredSpace / (1024 * 1024)),
				Math.round(requiredWithMargin / (1024 * 1024)),
				hasEnoughSpace ? 'Yes' : 'No',
			);

			return hasEnoughSpace;
		} catch (err) {
			debug('Error checking available storage space: %O', err);
			// If we can't check space, proceed anyway and handle errors later
			return true;
		}
	};

	/**
	 * Detect content movements between URLs by comparing current and merged states
	 * @param filesList - List of files to check
	 * @param currentMediaInfo - Current mediaInfoObject state (before updates)
	 * @param mergedMediaInfo - Merged state including pending batch updates
	 * @returns Map of content movements, keyed by content value
	 */
	private detectContentMovements = (
		filesList: MergedDownloadList[],
		currentMediaInfo: MediaInfoObject,
		mergedMediaInfo: MediaInfoObject,
	): Map<string, ContentMovement> => {
		const movements = new Map<string, ContentMovement>();

		debug('Detecting content movements for %d files', filesList.length);

		// Check each file to see if its content has changed
		for (const file of filesList) {
			const destFileName = getFileName(file.src); // Get this URL's filename
			const currentValue = currentMediaInfo[destFileName]; // What content this URL currently has
			const newValue = mergedMediaInfo[destFileName]; // What content this URL will have

			// Skip if no change or no new value
			if (currentValue === newValue || !newValue) {
				continue;
			}

			debug('File %s: content changing from %s to %s', destFileName, currentValue || 'none', newValue);

			// Find where this new content currently exists
			// Simple approach: whoever has it now is the source
			for (const [sourceFileName, sourceValue] of Object.entries(currentMediaInfo)) {
				if (sourceValue === newValue && sourceFileName !== destFileName) {
					// Found: content is moving FROM sourceFileName TO destFileName
					debug('Content %s is moving from %s to %s', newValue, sourceFileName, destFileName);

					// Track this movement
					const contentKey = String(newValue);
					if (!movements.has(contentKey)) {
						movements.set(contentKey, {
							sourceFileName,
							destinationFileNames: new Set(),
							contentValue: newValue,
						});
					}
					movements.get(contentKey)!.destinationFileNames.add(destFileName);
					break; // Found the source, no need to continue searching
				}
			}
		}

		// Log summary
		for (const [value, movement] of movements) {
			debug(
				'Movement detected: Content %s from %s to %d destination(s): %s',
				value,
				movement.sourceFileName,
				movement.destinationFileNames.size,
				Array.from(movement.destinationFileNames).join(', '),
			);
		}

		debug('Total content movements detected: %d', movements.size);
		return movements;
	};

	/**
	 * Copy content to new locations based on detected movements
	 * Uses temp copies to preserve content during cascading movements
	 * @param movements - Map of content movements to process
	 * @returns Number of successful copies
	 */
	private copyContentToNewLocations = async (movements: Map<string, ContentMovement>): Promise<number> => {
		let successfulCopies = 0;
		let failedCopies = 0;

		debug('Starting content copy operations for %d movements', movements.size);

		// First, populate source file paths for all movements
		for (const movement of movements.values()) {
			const sourcePath = await this.determineFilePath(movement.sourceFileName);
			if (!sourcePath) {
				debug('WARNING: Source file %s not found, skipping movement', movement.sourceFileName);
				continue;
			}
			movement.sourceFilePath = sourcePath;
		}

		// Estimate total space needed (rough estimate)
		let estimatedSpace = 0;
		for (const movement of movements.values()) {
			if (!movement.sourceFilePath) continue;

			try {
				const fileInfo = await this.sos.fileSystem.getFile({
					storageUnit: this.internalStorageUnit,
					filePath: movement.sourceFilePath,
				});
				if (fileInfo?.sizeBytes) {
					// Space needed = file size * number of destinations + temp copies
					estimatedSpace += fileInfo.sizeBytes * (movement.destinationFileNames.size + 1);
				}
			} catch (err) {
				debug('Could not get file size for %s: %O', movement.sourceFilePath, err);
			}
		}

		// Check available space if we have an estimate
		if (estimatedSpace > 0) {
			const hasSpace = await this.checkAvailableSpace(estimatedSpace);
			if (!hasSpace) {
				debug(
					'WARNING: May not have enough space for all copies. Required: %d MB',
					Math.round(estimatedSpace / (1024 * 1024)),
				);
				// Continue anyway - some copies might succeed
			}
		}

		// Step 1: Copy all source files to temp locations to preserve them
		const tempCopies = new Map<string, string>(); // Map from original path to temp path
		debug('Creating temp copies to preserve source content...');

		for (const [, movement] of movements) {
			if (!movement.sourceFilePath) continue;

			// Create temp path
			const tempFileName = `temp_${Date.now()}_${movement.sourceFileName}`;
			let tempFolder: string;

			if (movement.sourceFilePath.includes(FileStructure.videos)) {
				tempFolder = FileStructure.videosTmp;
			} else if (movement.sourceFilePath.includes(FileStructure.images)) {
				tempFolder = FileStructure.imagesTmp;
			} else if (movement.sourceFilePath.includes(FileStructure.audios)) {
				tempFolder = FileStructure.audiosTmp;
			} else {
				tempFolder = FileStructure.widgetsTmp;
			}

			const tempPath = `${tempFolder}/${tempFileName}`;

			try {
				// Copy to temp location
				debug('  Creating temp copy: %s -> %s', movement.sourceFilePath, tempPath);
				await this.sos.fileSystem.copyFile(
					{
						storageUnit: this.internalStorageUnit,
						filePath: movement.sourceFilePath,
					},
					{
						storageUnit: this.internalStorageUnit,
						filePath: tempPath,
					},
					{
						overwrite: true,
					},
				);

				tempCopies.set(movement.sourceFilePath, tempPath);
				debug('  ✓ Created temp copy for %s', movement.sourceFileName);
			} catch (err) {
				debug('ERROR: Failed to create temp copy for %s: %O', movement.sourceFileName, err);
				// Try to continue with original file
				tempCopies.set(movement.sourceFilePath, movement.sourceFilePath);
			}
		}

		// Step 2: Copy from temp locations to final destinations
		debug('Copying from temp locations to final destinations...');

		for (const [contentValue, movement] of movements) {
			if (!movement.sourceFilePath) {
				debug('Skipping movement for content %s - no source path', contentValue);
				continue;
			}

			// Use temp copy if available, otherwise use original
			const sourcePath = tempCopies.get(movement.sourceFilePath) || movement.sourceFilePath;

			debug(
				'Copying content %s from %s to %d destination(s)',
				contentValue,
				movement.sourceFileName,
				movement.destinationFileNames.size,
			);

			// Copy to each destination
			for (const destFileName of movement.destinationFileNames) {
				// Determine destination folder based on file extension
				const destPath = await this.determineFilePath(destFileName);
				let destFolder: string;

				// If file already exists, use its current folder
				if (destPath) {
					destFolder = destPath.substring(0, destPath.lastIndexOf('/'));
				} else {
					// Determine folder based on source path
					if (movement.sourceFilePath.includes(FileStructure.videos)) {
						destFolder = FileStructure.videos;
					} else if (movement.sourceFilePath.includes(FileStructure.images)) {
						destFolder = FileStructure.images;
					} else if (movement.sourceFilePath.includes(FileStructure.audios)) {
						destFolder = FileStructure.audios;
					} else if (movement.sourceFilePath.includes(FileStructure.widgets)) {
						destFolder = FileStructure.widgets;
					} else {
						debug('Could not determine destination folder for %s', destFileName);
						failedCopies++;
						continue;
					}
				}

				const finalDestPath = `${destFolder}/${destFileName}`;

				try {
					// Copy file from temp location (this will overwrite if destination exists)
					debug('  Executing copy operation:');
					debug('    Source: %s', sourcePath);
					debug('    Destination: %s', finalDestPath);

					await this.sos.fileSystem.copyFile(
						{
							storageUnit: this.internalStorageUnit,
							filePath: sourcePath,
						},
						{
							storageUnit: this.internalStorageUnit,
							filePath: finalDestPath,
						},
						{
							overwrite: true,
						},
					);

					successfulCopies++;
					debug('  ✓ Successfully copied %s to %s', movement.sourceFileName, destFileName);
				} catch (err) {
					failedCopies++;
					debug('ERROR: Failed to copy %s to %s: %O', movement.sourceFileName, destFileName, err);
					// Continue with other copies even if this one fails
				}
			}
		}

		// Step 3: Clean up temp copies
		debug('Cleaning up temp copies...');
		for (const [originalPath, tempPath] of tempCopies) {
			if (tempPath !== originalPath) {
				// Only delete if it's actually a temp copy
				try {
					await this.deleteFile(tempPath);
					debug('  Deleted temp copy: %s', tempPath);
				} catch (err) {
					debug('  Warning: Could not delete temp copy %s: %O', tempPath, err);
					// Non-critical, continue
				}
			}
		}

		debug('Content copy operations complete. Successful: %d, Failed: %d', successfulCopies, failedCopies);

		return successfulCopies;
	};

	/**
	 * Clear all temp folders by deleting their contents
	 */
	private clearTempFolders = async (): Promise<void> => {
		const tempFolders = [
			FileStructure.videosTmp,
			FileStructure.imagesTmp,
			FileStructure.audiosTmp,
			FileStructure.widgetsTmp,
		];

		for (const folder of tempFolders) {
			try {
				const files = await this.sos.fileSystem.listFiles({
					storageUnit: this.internalStorageUnit,
					filePath: folder,
				});

				debug('Clearing %d files from temp folder: %s', files.length, folder);

				for (const file of files) {
					try {
						await this.deleteFile(file.filePath);
						debug('Deleted temp file: %s', file.filePath);
					} catch (err) {
						debug('Error deleting temp file %s: %O', file.filePath, err);
					}
				}
			} catch (err) {
				// Folder might not exist or be empty
				debug('Error listing temp folder %s: %O', folder, err);
			}
		}
	};

	/**
	 * Get the merged state including pending batch updates
	 */
	private getMergedMediaInfoState = (mediaInfoObject: MediaInfoObject): MediaInfoObject => {
		// Create a copy of the current state
		const mergedState = { ...mediaInfoObject };

		// Apply pending batch updates
		for (const [fileName, value] of this.batchUpdates) {
			mergedState[fileName] = value;
			debug('Applying pending update to merged state: %s = %s', fileName, value);
		}

		return mergedState;
	};

	// DISABLED: File deletion functionality
	// Keeping this commented for future reference when re-enabling cleanup
	// /**
	//  * Identify files that are no longer needed and can be deleted
	//  */
	// private identifyObsoleteFiles = async (
	// 	filesList: MergedDownloadList[],
	// 	mediaInfoObject: MediaInfoObject,
	// ): Promise<Set<string>> => {
	// 	const obsoleteFiles = new Set<string>();
	// 	const neededFiles = new Set<string>();
	//
	// 	// Get the merged state including pending updates
	// 	const mergedState = this.getMergedMediaInfoState(mediaInfoObject);
	// 	debug('Using merged state with %d pending updates for obsolete file detection', this.batchUpdates.size);
	//
	// 	// Build a set of all files that are still needed based on MERGED state
	// 	for (const file of filesList) {
	// 		const fileName = getFileName(file.src);
	// 		const value = mergedState[fileName];
	//
	// 		// Find which actual file this URL needs
	// 		for (const [storedFileName, storedValue] of Object.entries(mergedState)) {
	// 			if (storedValue === value) {
	// 				neededFiles.add(storedFileName);
	// 			}
	// 		}
	// 	}
	//
	// 	// Identify files that exist but are no longer needed
	// 	for (const fileName of Object.keys(mergedState)) {
	// 		if (!neededFiles.has(fileName)) {
	// 			obsoleteFiles.add(fileName);
	// 			debug('Identified obsolete file: %s', fileName);
	// 		}
	// 	}
	//
	// 	debug(
	// 		'Identified %d obsolete files out of %d total files',
	// 		obsoleteFiles.size,
	// 		Object.keys(mergedState).length,
	// 	);
	// 	return obsoleteFiles;
	// };

	/**
	 * Migrate files from temp folders to standard folders
	 * Integrates content movement detection and copying logic
	 */
	private migrateFromTempToStandard = async (
		filesList: MergedDownloadList[],
		mediaInfoObject: MediaInfoObject,
	): Promise<void> => {
		debug('Starting migration process. Temp downloads: %d', this.tempDownloads.size);

		// Step 1: Detect content movements (including batch updates)
		debug('\n=== STEP 1: DETECTING CONTENT MOVEMENTS ===');
		const mergedState = this.getMergedMediaInfoState(mediaInfoObject);
		debug('Merged state includes %d batch updates', this.batchUpdates.size);
		const contentMovements = this.detectContentMovements(filesList, mediaInfoObject, mergedState);
		debug('Detected %d content movements', contentMovements.size);
		for (const [value, movement] of contentMovements) {
			debug(
				'  Movement: content %s from %s to %s',
				value,
				movement.sourceFileName,
				Array.from(movement.destinationFileNames).join(', '),
			);
		}

		// Step 2: Check available space for copies
		const estimatedSpaceNeeded = contentMovements.size * 50 * 1024 * 1024; // Estimate 50MB per file
		const hasSpace = await this.checkAvailableSpace(estimatedSpaceNeeded);

		if (!hasSpace) {
			debug('WARNING: Insufficient space for content copies. Proceeding with limited migration');
		}

		// Step 3: Perform content copies for moved content
		debug('\n=== STEP 3: COPYING MOVED CONTENT ===');
		if (contentMovements.size > 0 && hasSpace) {
			debug('Starting copy operations for %d movements', contentMovements.size);
			const successfulCopies = await this.copyContentToNewLocations(contentMovements);
			debug('Content copy phase complete. Successful copies: %d', successfulCopies);
		} else {
			debug('No content copies needed (movements: %d, hasSpace: %s)', contentMovements.size, hasSpace);
		}

		// Step 4: Process temp downloads if any
		debug('\n=== STEP 4: PROCESSING TEMP DOWNLOADS ===');
		if (this.tempDownloads.size > 0) {
			debug('Processing %d temp downloads:', this.tempDownloads.size);
			for (const [fileName, tempPath] of this.tempDownloads) {
				debug('  Temp file: %s at %s', fileName, tempPath);
			}

			// DISABLED: File deletion to focus on URL content shifting
			// Keeping all files to ensure content shifting from URL A to URL B works
			// const obsoleteFiles = await this.identifyObsoleteFiles(filesList, mediaInfoObject);
			//
			// // Delete obsolete files from standard folders
			// for (const fileName of obsoleteFiles) {
			// 	const filePath = await this.determineFilePath(fileName);
			// 	if (filePath) {
			// 		try {
			// 			await this.deleteFile(filePath);
			// 			debug('Deleted obsolete file: %s', filePath);
			// 		} catch (err) {
			// 			debug('Error deleting obsolete file %s: %O', filePath, err);
			// 		}
			// 	}
			// }
			debug('File deletion disabled - keeping all files for content shifting');

			// Move files from temp to standard locations
			for (const [fileName, tempPath] of this.tempDownloads) {
				// Determine the standard path from the temp path
				const standardPath = tempPath
					.replace(FileStructure.videosTmp, FileStructure.videos)
					.replace(FileStructure.imagesTmp, FileStructure.images)
					.replace(FileStructure.audiosTmp, FileStructure.audios)
					.replace(FileStructure.widgetsTmp, FileStructure.widgets);

				try {
					// DISABLED: File deletion before migration
					// Using overwrite instead to preserve content shifting
					// if (await this.fileExists(standardPath)) {
					// 	debug('Deleting existing file before migration: %s', standardPath);
					// 	await this.deleteFile(standardPath);
					// }

					// Move file from temp to standard (will overwrite if exists)
					debug('Moving file from %s to %s (with overwrite)', tempPath, standardPath);
					await this.sos.fileSystem.moveFile(
						{
							storageUnit: this.internalStorageUnit,
							filePath: tempPath,
						},
						{
							storageUnit: this.internalStorageUnit,
							filePath: standardPath,
						},
						{
							overwrite: true,
						},
					);

					debug('Successfully migrated: %s', fileName);
				} catch (err) {
					debug('Error migrating file %s: %O', fileName, err);
					// Continue with other files even if one fails
				}
			}

			// Clear temp folders after migration
			await this.clearTempFolders();
		}

		// Step 5: Update localFilePath for all media items
		// Note: We check tempDownloads before clearing it
		debug('\n=== STEP 5: UPDATING LOCAL FILE PATHS ===');
		debug('Processing %d files for localFilePath updates', filesList.length);

		for (const file of filesList) {
			console.log(file);
			debug('\n--- Processing file: %s ---', file.src);
			if ('localFilePath' in file) {
				const fileName = getFileName(file.src);
				debug('  Generated fileName from URL: %s', fileName);
				debug('  Current localFilePath: %s', file.localFilePath);

				const actualPath = await this.determineFilePath(fileName);
				debug('  Found file at path: %s', actualPath || 'NOT FOUND');

				if (actualPath) {
					try {
						const fileDetails = await this.sos.fileSystem.getFile({
							storageUnit: this.internalStorageUnit,
							filePath: actualPath,
						});
						if (fileDetails) {
							const oldPath = file.localFilePath;
							const newPath = fileDetails.localUri;

							debug('  File details retrieved:');
							debug('    - Old localFilePath: %s', oldPath);
							debug('    - New localFilePath: %s', newPath);
							debug('    - Path changed: %s', oldPath !== newPath);

							file.localFilePath = newPath;

							// Set localPathChanged for files that:
							// 1. Were downloaded to temp (tracked in tempDownloads before clearing)
							// 2. Were affected by content movements
							// 3. Actually had their path changed
							const wasInTemp = this.tempDownloads.has(fileName);
							const batchValue = this.batchUpdates.get(fileName);
							const wasMovement = contentMovements.has(String(batchValue));
							const pathChanged = oldPath !== newPath;

							debug('  LocalPathChanged criteria:');
							debug('    - Was in temp: %s (fileName: %s in tempDownloads)', wasInTemp, fileName);
							debug(
								'    - Was movement: %s (batchValue: %s in contentMovements)',
								wasMovement,
								batchValue,
							);
							debug('    - Path changed: %s', pathChanged);

							if (wasInTemp || wasMovement || pathChanged) {
								(file as any).localPathChanged = true;
								debug('  ✓ Set localPathChanged=true for %s', file.src);
							} else {
								debug('  ✗ localPathChanged remains false for %s', file.src);
							}
						} else {
							debug('  WARNING: No file details returned for path: %s', actualPath);
						}
					} catch (err) {
						debug('  ERROR updating localFilePath for %s: %O', file.src, err);
					}
				} else {
					debug('  WARNING: No file found for fileName: %s', fileName);
					debug('  This file may not have been downloaded yet');
				}
			} else {
				debug('  Skipping - file has no localFilePath property');
			}
		}

		debug('\n=== END OF STEP 5 ===');

		// Clear temp downloads tracking after we've used it for localPathChanged detection
		if (this.tempDownloads.size > 0) {
			this.clearTempDownloads();
		}

		debug('Migration process completed');
	};

	private findActualFileForMovedContent = async (
		currentValue: string | null,
		mediaInfoObject: MediaInfoObject,
		localFilePath: string,
	): Promise<string | null> => {
		if (!currentValue) {
			debug('findActualFileForMovedContent: No value provided, returning null');
			return null;
		}

		debug('findActualFileForMovedContent: Looking for files with value: %s', currentValue);

		// Find which file has this content (by matching the value)
		for (const [fileName, storedValue] of Object.entries(mediaInfoObject)) {
			if (storedValue === currentValue) {
				debug('findActualFileForMovedContent: Found matching file: %s with value: %s', fileName, storedValue);
				const filePath = `${localFilePath}/${fileName}`;

				// Get the file details to get localUri
				const fileDetails = await this.sos.fileSystem.getFile({
					storageUnit: this.internalStorageUnit,
					filePath: filePath,
				});

				if (fileDetails) {
					debug(
						'findActualFileForMovedContent: File exists at %s, localUri: %s',
						filePath,
						fileDetails.localUri,
					);
					return fileDetails.localUri;
				} else {
					debug('findActualFileForMovedContent: File not found at expected path: %s', filePath);
				}
			}
		}

		debug('findActualFileForMovedContent: No matching file found for value: %s', currentValue);
		return null;
	};

	private checkLastModified = async (
		file: MergedDownloadList,
		localFilePath: string,
		timeOut: number,
		skipContentHttpStatusCodes: number[] = [],
		updateContentHttpStatusCodes: number[] = [],
		fetchStrategy: FetchStrategy,
	): Promise<Promise<void>[]> => {
		// do not check streams for update
		if (localFilePath === FileStructure.videos && !isNil((file as SMILVideo).isStream)) {
			return [];
		}

		try {
			const mediaInfoObject = await this.getOrCreateMediaInfoFile([file]);

			const updateCheck = await this.shouldUpdateLocalFile(
				localFilePath,
				file,
				mediaInfoObject,
				timeOut,
				skipContentHttpStatusCodes,
				updateContentHttpStatusCodes,
				fetchStrategy,
			);

			if (updateCheck.shouldUpdate) {
				// Check if this is genuinely new content or content that has moved
				const isNewContent =
					updateCheck.value && !this.isValueAlreadyStored(updateCheck.value, mediaInfoObject);

				if (isNewContent) {
					debug('checkLastModified: New content detected for %s, downloading to temp folder', file.src);

					// Download new content to temp folder (forceDownload=true triggers temp folder for new content)
					const result = await this.parallelDownloadAllFiles(
						[file],
						localFilePath,
						SMILScheduleEnum.fileCheckTimeout,
						[],
						[],
						fetchStrategy,
						true, // forceDownload=true will use temp folder for new content
						updateCheck.value,
					);

					// Wait for the download to complete
					await Promise.all(result.promises);

					// Collect updates for batch processing instead of immediate write
					result.filesToUpdate.forEach((value, fileName) => {
						debug(`Collecting batch update for file: %s with value: %O`, fileName, value);
						this.collectUpdate(fileName, String(value));
					});

					// Get file details from temp location to get lastModifiedAt
					const tempFilePath = `${this.getTempFolder(localFilePath)}/${getFileName(file.src)}`;
					const fileDetails = await this.sos.fileSystem.getFile({
						storageUnit: this.internalStorageUnit,
						filePath: tempFilePath,
					});

					// For files downloaded to temp, we'll update localFilePath during migration
					// So we don't update it here - keep pointing to standard location
					if ('localFilePath' in file) {
						// Keep the standard path, not temp path
						// localFilePath will be updated during migration from temp to standard
						file.wasUpdated = true;
					}

					// Collect lastModifiedAt for batch update
					if (fileDetails && fileDetails.lastModifiedAt) {
						const fileName = getFileName(file.src);
						debug(
							'Collecting batch update for downloaded file: %s with lastModifiedAt: %s',
							fileName,
							fileDetails.lastModifiedAt,
						);
						this.collectUpdate(fileName, fileDetails.lastModifiedAt);
					}

					return result.promises;
				} else {
					debug('checkLastModified: Content already exists locally, skipping download for %s', file.src);

					// Content exists but may have moved - update mapping without downloading
					if (updateCheck.value) {
						const fileName = getFileName(file.src);
						debug(
							'Collecting batch update for moved content: %s with value: %s',
							fileName,
							updateCheck.value,
						);
						this.collectUpdate(fileName, String(updateCheck.value));

						// Update localFilePath to point to existing file
						if ('localFilePath' in file) {
							const actualLocalUri = await this.findActualFileForMovedContent(
								updateCheck.value,
								mediaInfoObject,
								localFilePath,
							);
							if (actualLocalUri) {
								const oldPath = file.localFilePath;
								file.localFilePath = actualLocalUri;
								// Set flag only if path actually changed
								if (oldPath !== actualLocalUri) {
									(file as any).localPathChanged = true;
									debug('Local path changed for %s: %s -> %s', file.src, oldPath, actualLocalUri);
								}
							}
						}
					}

					return [];
				}
			} else if (updateCheck.value && 'localFilePath' in file) {
				// This else if block handles the case where content hasn't changed but may have moved
				// This is essentially the same as the moved content handling above
				debug(
					'checkLastModified: Content exists, no update needed. Value: %s for file: %s',
					updateCheck.value,
					file.src,
				);

				// Content exists but moved - update localFilePath without downloading
				const actualLocalUri = await this.findActualFileForMovedContent(
					updateCheck.value,
					mediaInfoObject,
					localFilePath,
				);

				if (actualLocalUri) {
					const oldLocalFilePath = file.localFilePath;
					debug(
						'checkLastModified: Updating localFilePath for %s from %s to %s',
						file.src,
						oldLocalFilePath,
						actualLocalUri,
					);

					// Check if the local path actually changed
					if (actualLocalUri !== oldLocalFilePath) {
						(file as any).localPathChanged = true;
						debug('checkLastModified: Setting localPathChanged flag for %s', file.src);
					}

					file.localFilePath = actualLocalUri;
					file.wasUpdated = true;

					// Collect update for batch processing instead of immediate write
					const fileName = getFileName(file.src);
					const oldValue = mediaInfoObject[fileName];

					debug(
						'checkLastModified: Collecting batch update for mediaInfoObject[%s] from %s to %s',
						fileName,
						oldValue,
						updateCheck.value,
					);

					this.collectUpdate(fileName, updateCheck.value);
					debug('checkLastModified: Batch update collected for moved content');
				} else {
					debug('checkLastModified: WARNING - Could not find actual file for moved content: %s', file.src);
				}
			} else {
				debug('checkLastModified: No update needed for file: %s', file.src);
			}
		} catch (err) {
			debug('Error occurred: %O during checking file version: %O', err, file);
		}

		return [];
	};

	private convertToResourcesCheckerFormat = (
		resources: MergedDownloadList[],
		rootFolder: string,
		timeOut: number,
		refreshInterval: number,
		skipContentHttpStatusCodes: number[] = [],
		updateContentHttpStatusCodes: number[] = [],
		fetchStrategy: FetchStrategy,
		reloadPlayerOnUpdate: boolean = false,
	) => {
		return resources.map((resource) => {
			return this.convertToResourceCheckerFormat(
				resource,
				async () =>
					this.checkLastModified(
						resource,
						rootFolder,
						timeOut,
						skipContentHttpStatusCodes,
						updateContentHttpStatusCodes,
						fetchStrategy,
					),
				refreshInterval,
				reloadPlayerOnUpdate,
			);
		});
	};

	private convertToResourceCheckerFormat = (
		resource: MergedDownloadList,
		checkFunction: () => Promise<Promise<void>[]>,
		defaultInterval: number,
		reloadPlayerOnUpdate: boolean = false,
	): Resource => {
		return {
			url: resource.updateCheckUrl ?? resource.src,
			interval: resource.updateCheckInterval ? resource.updateCheckInterval * 1000 : defaultInterval,
			checkFunction: async () => {
				return checkFunction();
			},
			actionOnSuccess: async (data, stopChecker) => {
				// checker function returns an array of promises, if the array is not empty, player is updating new version of content
				if (data.length > 0 && reloadPlayerOnUpdate) {
					await stopChecker();
				}
			},
			mediaObject: resource, // Add the media object reference
		};
	};

	private async makeXhrRequest(
		method: string,
		downloadUrl: string,
		timeout: number,
		authHeaders?: Record<string, string>,
	): Promise<Response> {
		return new Promise<Response>((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.open(method, downloadUrl, true);
			xhr.timeout = timeout;
			xhr.setRequestHeader('Accept', 'application/json');
			if (authHeaders) {
				Object.entries(authHeaders).forEach(([key, value]) => {
					xhr.setRequestHeader(key, value);
				});
			}
			xhr.onload = () => {
				const response = {
					status: xhr.status,
					headers: {
						get: (name: string) => xhr.getResponseHeader(name),
						forEach: (callback: (value: string, key: string) => void) => {
							const headers = xhr.getAllResponseHeaders().split('\r\n');
							headers.forEach((header) => {
								const [key, value] = header.split(': ');
								if (key && value) {
									callback(value, key);
								}
							});
						},
					},
					url: xhr.responseURL || downloadUrl,
				} as Response;
				resolve(response);
			};
			xhr.onerror = () => {
				reject(new Error('Network Error'));
			};
			xhr.ontimeout = () => {
				reject(new Error('Request timeout'));
			};
			xhr.send();
		});
	}

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
					!storedFileName.includes(FileStructure.smilMediaInfoFileName) &&
					!storedFileName.includes(FileStructure.offlineReports)
				) {
					// delete only path with files, not just folders
					if (
						!(await this.sos.fileSystem.isDirectory({
							storageUnit: this.internalStorageUnit,
							filePath: storedFile.filePath,
						}))
					) {
						debug(`File was not found in new SMIL file, keeping it: %O`, storedFile);
						await this.deleteFile(storedFile.filePath);
					}
				}
			}
		}
	};
}
