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
	createDownloadPath,
	createJsonStructureMediaInfo,
	createLocalFilePath,
	createSourceReportObject,
	debug,
	getFileName,
	isWidgetUrl,
	mapFileType,
	shouldNotDownload,
	updateJsonObject,
} from './tools';
import { FileStructure } from '../../enums/fileEnums';
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
	SMILMediaNoVideo,
	SMILVideo,
	SMILWidget,
	SosHtmlElement,
} from '../../models/mediaModels';
import { ItemType, MediaItemType, Report } from '../../models/reportingModels';
import { sleep } from '../playlist/tools/generalTools';
import { SMILScheduleEnum } from '../../enums/scheduleEnums';
import { IFilesManager } from './IFilesManager';

declare global {
	interface Window {
		getAuthHeaders?: (url: string) => Record<string, string>;
	}
}

export class FilesManager implements IFilesManager {
	private sos: FrontApplet;
	private smilFileUrl: string;
	private smilLogging: boolean = false;

	constructor(sos: FrontApplet) {
		this.sos = sos;
	}

	public setSmilUrl = (url: string) => {
		this.smilFileUrl = url;
	};

	public setSmiLogging = (smilLogging: boolean) => {
		this.smilLogging = smilLogging;
	};

	public sendReport = async (message: Report) => {
		if (this.smilLogging) {
			await this.sos.command.dispatch(message);
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
		internalStorageUnit: IStorageUnit,
		fileSrc: string,
		taskStartDate: Date,
		errMessage: string | null = null,
	) => {
		await this.sendReport({
			type: 'SMIL.FileDownloaded',
			itemType: fileType,
			source: createSourceReportObject(localFilePath, fileSrc, internalStorageUnit.type),
			startedAt: taskStartDate,
			succeededAt: isNil(errMessage) ? moment().toDate() : null,
			failedAt: isNil(errMessage) ? null : moment().toDate(),
			errorMessage: errMessage,
		});
	};

	public sendMediaReport = async (
		value: SMILVideo | SMILMediaNoVideo | SosHtmlElement,
		taskStartDate: Date,
		itemType: MediaItemType,
		errMessage: string | null = null,
	) => {
		await this.sendReport({
			type: 'SMIL.MediaPlayed',
			itemType: itemType,
			source: createSourceReportObject(value.localFilePath, value.src),
			startedAt: taskStartDate,
			endedAt: isNil(errMessage) ? moment().toDate() : null,
			failedAt: isNil(errMessage) ? null : moment().toDate(),
			errorMessage: errMessage,
		});
	};

	public sendSmiFileReport = async (localFilePath: string, src: string, errMessage: string | null = null) => {
		await this.sendReport(<Report>{
			type: 'SMIL.PlaybackStarted',
			source: createSourceReportObject(localFilePath, src),
			succeededAt: isNil(errMessage) ? moment().toDate() : null,
			failedAt: isNil(errMessage) ? null : moment().toDate(),
			errorMessage: errMessage,
		});
	};

	public currentFilesSetup = async (
		widgets: SMILWidget[],
		internalStorageUnit: IStorageUnit,
		smilObject: SMILFileObject,
		smilUrl: string,
	) => {
		await this.deleteUnusedFiles(internalStorageUnit, smilObject, smilUrl);
		debug('Unused files deleted');

		await this.extractWidgets(widgets, internalStorageUnit);
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
		internalStorageUnit: IStorageUnit,
		localFilePath: string,
		media: MergedDownloadList,
		mediaInfoObject: MediaInfoObject,
	): Promise<boolean> => {
		const currentLastModified =
			'fetchLastModified' in media && media.fetchLastModified
				? await media.fetchLastModified()
				: await this.fetchLastModified(media.src);
		// file was not found
		if (isNil(currentLastModified)) {
			debug(`File was not found on remote server: %O `, media.src);
			return false;
		}

		if (!(await this.fileExists(internalStorageUnit, createLocalFilePath(localFilePath, media.src)))) {
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

	public writeMediaInfoFile = async (internalStorageUnit: IStorageUnit, mediaInfoObject: object) => {
		debug('Writing to mediaInfo file in persistent storage: %O', mediaInfoObject);
		await this.sos.fileSystem.writeFile(
			{
				storageUnit: internalStorageUnit,
				filePath: createLocalFilePath(FileStructure.smilMediaInfo, FileStructure.smilMediaInfoFileName),
			},
			JSON.stringify(mediaInfoObject),
		);
	};

	public deleteFile = async (internalStorageUnit: IStorageUnit, filePath: string) => {
		try {
			debug('Deleting file from persistent storage: %s', filePath);
			await this.sos.fileSystem.deleteFile(
				{
					storageUnit: internalStorageUnit,
					filePath: filePath,
				},
				true,
			);
		} catch (err) {
			debug('Unexpected error occured during deleting file from persistent storage: %s', filePath);
			await this.sendGeneralErrorReport(err.message);
		}
	};

	public readFile = async (internalStorageUnit: IStorageUnit, filePath: string) => {
		return this.sos.fileSystem.readFile({
			storageUnit: internalStorageUnit,
			filePath: filePath,
		});
	};

	public fileExists = async (internalStorageUnit: IStorageUnit, filePath: string) => {
		return this.sos.fileSystem.exists({
			storageUnit: internalStorageUnit,
			filePath: filePath,
		});
	};

	public parallelDownloadAllFiles = async (
		internalStorageUnit: IStorageUnit,
		filesList: MergedDownloadList[],
		localFilePath: string,
		forceDownload: boolean = false,
	): Promise<Promise<void>[]> => {
		const promises: Promise<void>[] = [];
		const taskStartDate = moment().toDate();
		const fileType = mapFileType(localFilePath);
		const mediaInfoObject = await this.getOrCreateMediaInfoFile(internalStorageUnit, filesList);
		debug('Received media info object: %s', JSON.stringify(mediaInfoObject));

		for (let i = 0; i < filesList.length; i += 1) {
			const file = filesList[i];

			// do not download website widgets or video streams
			if (shouldNotDownload(localFilePath, file)) {
				debug('Will not download file: %O', file);
				continue;
			}

			// check for local urls to files (media/file.mp4)
			file.src = convertRelativePathToAbsolute(file.src, this.smilFileUrl);

			const shouldUpdate = await this.shouldUpdateLocalFile(
				internalStorageUnit,
				localFilePath,
				file,
				mediaInfoObject,
			);

			// check if file is already downloaded or is forcedDownload to update existing file with new version
			if (forceDownload || shouldUpdate) {
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
										storageUnit: internalStorageUnit,
										filePath: createLocalFilePath(localFilePath, file.src),
									},
									downloadUrl,
									authHeaders,
								);
							}
							await this.sendDownloadReport(
								fileType,
								fullLocalFilePath,
								internalStorageUnit,
								file.src,
								taskStartDate,
							);
						} catch (err) {
							debug(`Unexpected error: %O during downloading file: %s`, err, file.src);
							await this.sendDownloadReport(
								fileType,
								fullLocalFilePath,
								internalStorageUnit,
								file.src,
								taskStartDate,
								err.message,
							);
						}
					})(),
				);
			}
		}
		// save/update mediaInfoObject to persistent storage
		await this.writeMediaInfoFile(internalStorageUnit, mediaInfoObject);
		return promises;
	};

	/**
	 * prepare folder structure for media files, does not support recursive create
	 * @param internalStorageUnit - persistent storage unit
	 */
	public createFileStructure = async (internalStorageUnit: IStorageUnit) => {
		for (const structPath of Object.values(FileStructure)) {
			if (await this.fileExists(internalStorageUnit, structPath)) {
				debug(`Filepath already exists: %O`, structPath);
				continue;
			}
			debug(`Create directory structure: %O`, structPath);
			await this.sos.fileSystem.createDirectory({
				storageUnit: internalStorageUnit,
				filePath: structPath,
			});
		}
	};

	public prepareDownloadMediaSetup = async (
		internalStorageUnit: IStorageUnit,
		smilObject: SMILFileObject,
	): Promise<Promise<void>[]> => {
		let downloadPromises: Promise<void>[] = [];
		debug(`Starting to download files %O:`, smilObject);
		downloadPromises = downloadPromises.concat(
			await this.parallelDownloadAllFiles(internalStorageUnit, smilObject.video, FileStructure.videos),
		);
		downloadPromises = downloadPromises.concat(
			await this.parallelDownloadAllFiles(internalStorageUnit, smilObject.audio, FileStructure.audios),
		);
		downloadPromises = downloadPromises.concat(
			await this.parallelDownloadAllFiles(internalStorageUnit, smilObject.img, FileStructure.images),
		);
		downloadPromises = downloadPromises.concat(
			await this.parallelDownloadAllFiles(internalStorageUnit, smilObject.ref, FileStructure.widgets),
		);
		return downloadPromises;
	};

	public prepareLastModifiedSetup = async (
		internalStorageUnit: IStorageUnit,
		smilObject: SMILFileObject,
		smilFile: SMILFile,
	): Promise<CheckETagFunctions> => {
		let fileEtagPromisesMedia: Promise<void>[] = [];
		let fileEtagPromisesSMIL: Promise<void>[] = [];
		debug(`Starting to check files for updates %O:`, smilObject);

		// check for media updates only if its not switched off in the smil file
		if (!smilObject.onlySmilFileUpdate) {
			fileEtagPromisesMedia = fileEtagPromisesMedia.concat(
				await this.checkLastModified(internalStorageUnit, smilObject.video, FileStructure.videos),
			);
			fileEtagPromisesMedia = fileEtagPromisesMedia.concat(
				await this.checkLastModified(internalStorageUnit, smilObject.audio, FileStructure.audios),
			);
			fileEtagPromisesMedia = fileEtagPromisesMedia.concat(
				await this.checkLastModified(internalStorageUnit, smilObject.img, FileStructure.images),
			);
			fileEtagPromisesMedia = fileEtagPromisesMedia.concat(
				await this.checkLastModified(internalStorageUnit, smilObject.ref, FileStructure.widgets),
			);
		}

		fileEtagPromisesSMIL = fileEtagPromisesSMIL.concat(
			await this.checkLastModified(internalStorageUnit, [smilFile], FileStructure.rootFolder),
		);

		return {
			fileEtagPromisesMedia,
			fileEtagPromisesSMIL,
		};
	};

	public fetchLastModified = async (fileSrc: string): Promise<null | string | number> => {
		try {
			const downloadUrl = createDownloadPath(fileSrc);
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
			promiseRaceArray.push(sleep(SMILScheduleEnum.fileCheckTimeout));

			const response = (await Promise.race(promiseRaceArray)) as Response;

			const newLastModified = await response.headers.get('last-modified');
			return newLastModified ? newLastModified : 0;
		} catch (err) {
			debug('Unexpected error occured during lastModified fetch: %O', err);
			return null;
		}
	};

	private getOrCreateMediaInfoFile = async (
		internalStorageUnit: IStorageUnit,
		filesList: MergedDownloadList[],
	): Promise<MediaInfoObject> => {
		if (
			!(await this.fileExists(
				internalStorageUnit,
				createLocalFilePath(FileStructure.smilMediaInfo, FileStructure.smilMediaInfoFileName),
			))
		) {
			debug('MediaInfo file not found, creating json object');
			return createJsonStructureMediaInfo(filesList);
		}

		const response = await this.sos.fileSystem.readFile({
			storageUnit: internalStorageUnit,
			filePath: createLocalFilePath(FileStructure.smilMediaInfo, FileStructure.smilMediaInfoFileName),
		});
		try {
			return JSON.parse(response);
		} catch (error) {
			debug('Cannot parse smil meta media info', error);
			return createJsonStructureMediaInfo(filesList);
		}
	};

	private extractWidgets = async (widgets: SMILWidget[], internalStorageUnit: IStorageUnit) => {
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
							storageUnit: internalStorageUnit,
							filePath: `${FileStructure.widgets}/${getFileName(widgets[i].src)}`,
						},
						{
							storageUnit: internalStorageUnit,
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
	 * @param internalStorageUnit - persistent storage unit
	 * @param smilObject - JSON representation of parsed smil file
	 * @param smilUrl -  url to smil file from input
	 */
	private deleteUnusedFiles = async (
		internalStorageUnit: IStorageUnit,
		smilObject: SMILFileObject,
		smilUrl: string,
	): Promise<void> => {
		const smilMediaArray = [...smilObject.video, ...smilObject.audio, ...smilObject.ref, ...smilObject.img];

		for (let structPath in FileStructure) {
			const downloadedFiles = await this.sos.fileSystem.listFiles({
				filePath: get(FileStructure, structPath),
				storageUnit: internalStorageUnit,
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
					if (!await this.sos.fileSystem.isDirectory({
						storageUnit: internalStorageUnit,
						filePath: storedFile.filePath,
					})) {
						debug(`File was not found in new SMIL file, deleting: %O`, storedFile);
						await this.sos.fileSystem.deleteFile(
							{
								storageUnit: internalStorageUnit,
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
	 * @param internalStorageUnit - persistent storage unit
	 * @param filesList - list of files for update checks
	 * @param localFilePath - folder structure specifying path to file
	 */
	private checkLastModified = async (
		internalStorageUnit: IStorageUnit,
		filesList: MergedDownloadList[],
		localFilePath: string,
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
						: await this.fetchLastModified(file.src);
				if (isNil(newLastModified)) {
					debug(`File was not found on remote server: %O `, file.src);
					continue;
				}

				debug(`Fetched new last-modified header: %s for file: %O `, newLastModified, file.src);

				if (isNil(file.lastModified)) {
					file.lastModified = moment(newLastModified).valueOf();
				}

				if (<number>file.lastModified < moment(newLastModified).valueOf()) {
					debug(`New version of file detected: %O`, file.src);
					promises = promises.concat(
						await this.parallelDownloadAllFiles(internalStorageUnit, [file], localFilePath, true),
					);
				}
			} catch (err) {
				debug('Error occurred: %O during checking file version: %O', err, file);
			}
		}
		return promises;
	};
}
