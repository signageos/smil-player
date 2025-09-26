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

		if (!(await this.fileExists(createLocalFilePath(localFilePath, media.src)))) {
			debug(`File does not exist in local storage: %s  downloading`, media.src);
			return {
				shouldUpdate: true,
				value: currentValue,
			};
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
		console.log('fetchStrategy.strategyType:', fetchStrategy.strategyType);
		console.log('storedValue:', storedValue);
		console.log('currentValue:', currentValue);
		console.log('currentValue !== storedValue:', currentValue !== storedValue);

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

		if (isNewVersion) {
			debug(`New file version detected: %O `, media.src);
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

					const fullLocalFilePath = createLocalFilePath(localFilePath, file.src);
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
										filePath: createLocalFilePath(localFilePath, file.src),
									},
									downloadUrl,
									authHeaders,
								);

								debug(`File downloaded: %s`, updateValue ?? file.src);

								this.sendDownloadReport(fileType, fullLocalFilePath, file, taskStartDate);
							} catch (err) {
								debug(`Unexpected error: %O during downloading file: %s`, err, file.src);
								this.sendDownloadReport(fileType, fullLocalFilePath, file, taskStartDate, err.message);
								// Remove from filesToUpdate if download failed
								filesToUpdate.delete(getFileName(file.src));
							}
						})(),
					);
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
				// when there is forceDownload true, we dont care about timeout so use default one
				const result = await this.parallelDownloadAllFiles(
					[file],
					localFilePath,
					SMILScheduleEnum.fileCheckTimeout,
					[],
					[],
					fetchStrategy,
					true,
					updateCheck.value,
				);

				// Wait for the download to complete
				await Promise.all(result.promises);

				// Update the mediaInfoObject after download completes
				await this.updateMediaInfoAfterDownloads(mediaInfoObject, result.filesToUpdate);

				// Update file metadata to ensure it's properly tracked
				const filePath = `${localFilePath}/${getFileName(file.src)}`;
				const fileDetails = await this.sos.fileSystem.getFile({
					storageUnit: this.internalStorageUnit,
					filePath: filePath,
				});

				// TODO: fix typing, change filepath only for media not for smil file itself
				// mark file as updated to force reload in browser cache
				if ('localFilePath' in file) {
					file.localFilePath = fileDetails ? fileDetails.localUri : '';
					file.wasUpdated = true;
				}

				return result.promises;
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
						debug(`File was not found in new SMIL file, deleting: %O`, storedFile);
						await this.deleteFile(storedFile.filePath);
					}
				}
			}
		}
	};
}
