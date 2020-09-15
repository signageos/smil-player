import isNil = require('lodash/isNil');
import get = require('lodash/get');
import moment from 'moment';
import { FileStructure } from '../../enums';
import {
	CheckETagFunctions, MergedDownloadList,
	SMILAudio,
	SMILFile,
	SMILFileObject,
	SMILImage,
	SMILVideo,
	SMILWidget,
	SosModule,
} from '../../models';
import { IStorageUnit } from '@signageos/front-applet/es6/FrontApplet/FileSystem/types';
import { getFileName, getPath, isValidLocalPath, createDownloadPath, createLocalFilePath } from './tools';
import { debug } from './tools';

const isUrl = require('is-url-superb');

export class Files {
	private sos: SosModule;
	private smilFileUrl: string;

	constructor(sos: SosModule) {
		this.sos = sos;
	}

	public setSmilUrl(url: string) {
		this.smilFileUrl = url;
	}

	public extractWidgets = async (widgets: SMILWidget[], internalStorageUnit: IStorageUnit) => {
		for (let i = 0; i < widgets.length; i++) {
			if (isUrl(widgets[i].src) && widgets[i].src.indexOf('.wgt') > -1) {
				debug(`Extracting widget: %O to destination path: %O`, widgets[i], `${FileStructure.extracted}	${getFileName(widgets[i].src)}`);
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
		}
	}

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
	}

	public parallelDownloadAllFiles = async (
		internalStorageUnit: IStorageUnit, filesList: any[], localFilePath: string, forceDownload: boolean = false,
	): Promise<any[]> => {
		const promises: Promise<any>[] = [];
		for (let i = 0; i < filesList.length; i += 1) {
			// check for local urls to files (media/file.mp4)
			if (!isUrl(filesList[i].src) && isValidLocalPath(filesList[i].src)) {
				filesList[i].src = `${getPath(this.smilFileUrl)}/${filesList[i].src}`;
			}
			// check if file is already downloaded or is forcedDownload to update existing file with new version
			if (isUrl(filesList[i].src) && (forceDownload || !await this.sos.fileSystem.exists(
				{
					storageUnit: internalStorageUnit,
					filePath: createLocalFilePath(localFilePath, filesList[i].src),
				},
			))) {
				promises.push((async () => {
					debug(`Downloading file: %s`, filesList[i].src);
					await this.sos.fileSystem.downloadFile(
						{
							storageUnit: internalStorageUnit,
							filePath: createLocalFilePath(localFilePath, filesList[i].src),
						},
						createDownloadPath(filesList[i].src),
					);
				})());
			}
		}
		return promises;
	}

	/**
	 * prepare folder structure for media files, does not support recursive create
	 * @param internalStorageUnit - persistent storage unit
	 */
	public createFileStructure = async (internalStorageUnit: IStorageUnit) => {
		for (const path of Object.values(FileStructure)) {
			if (await this.sos.fileSystem.exists({
				storageUnit: internalStorageUnit,
				filePath: path,
			})) {
				debug(`Filepath already exists: %O`, path);
				continue;
			}
			debug(`Create directory structure: %O`, path);
			await this.sos.fileSystem.createDirectory({
				storageUnit: internalStorageUnit,
				filePath: path,
			});
		}
	}

	/**
	 * when display changes one smil for another, keep only media which occur in both smils, rest is deleted from disk
	 * @param smilObject - JSON representation of parsed smil file
	 */
	public deleteUnusedFiles = async (internalStorageUnit: IStorageUnit, smilObject: SMILFileObject, smilUrl: string): Promise<void> => {
		const smilMediaArray = [...smilObject.video, ...smilObject.audio, ...smilObject.ref, ...smilObject.img];

		for (let path in FileStructure) {
			const downloadedFiles = await this.sos.fileSystem.listFiles( { filePath: get(FileStructure, path), storageUnit: internalStorageUnit });

			for (let storedFile of downloadedFiles) {
				let found = false;
				for (let smilFile of smilMediaArray) {
					if (getFileName(storedFile.filePath) === getFileName(smilFile.src)) {
						debug(`File found in new SMIL file: %s`, storedFile.filePath);
						found = true;
						break;
					}
				}

				if (!found && (getFileName(storedFile.filePath) !== getFileName(smilUrl))) {
					// delete only path with files, not just folders
					if (storedFile.filePath.indexOf('.') > -1) {
						debug(`File was not found in new SMIL file, deleting: %O`, storedFile);
						await this.sos.fileSystem.deleteFile({
							storageUnit: internalStorageUnit,
							filePath: storedFile.filePath,
						},                                   true);
					}
				}
			}
		}
	}

	public prepareDownloadMediaSetup = async (internalStorageUnit: IStorageUnit, smilObject: SMILFileObject): Promise<any[]> => {
		let downloadPromises: Promise<any>[] = [];
		debug(`Starting to download files %O:`, smilObject);
		downloadPromises = downloadPromises.concat(
			await this.parallelDownloadAllFiles(internalStorageUnit, smilObject.video, FileStructure.videos));
		downloadPromises = downloadPromises.concat(
			await this.parallelDownloadAllFiles(internalStorageUnit, smilObject.audio, FileStructure.audios));
		downloadPromises = downloadPromises.concat(
			await this.parallelDownloadAllFiles(internalStorageUnit, smilObject.img, FileStructure.images));
		downloadPromises = downloadPromises.concat(
			await this.parallelDownloadAllFiles(internalStorageUnit, smilObject.ref, FileStructure.widgets));
		return downloadPromises;
	}

	public prepareLastModifiedSetup = async (
		internalStorageUnit: IStorageUnit,
		smilObject: SMILFileObject,
		smilFile: SMILFile,
	): Promise<CheckETagFunctions>  => {
		let fileEtagPromisesMedia: Promise<any>[] = [];
		let fileEtagPromisesSMIL: Promise<any>[] = [];
		debug(`Starting to check files for updates %O:`, smilObject);

		fileEtagPromisesMedia = fileEtagPromisesMedia.concat(this.checkLastModified(internalStorageUnit, smilObject.video, FileStructure.videos));
		fileEtagPromisesMedia = fileEtagPromisesMedia.concat(this.checkLastModified(internalStorageUnit, smilObject.audio, FileStructure.audios));
		fileEtagPromisesMedia = fileEtagPromisesMedia.concat(this.checkLastModified(internalStorageUnit, smilObject.img, FileStructure.images));
		fileEtagPromisesMedia = fileEtagPromisesMedia.concat(this.checkLastModified(internalStorageUnit, smilObject.ref, FileStructure.widgets));

		fileEtagPromisesSMIL = fileEtagPromisesSMIL.concat(this.checkLastModified(internalStorageUnit, [smilFile], FileStructure.rootFolder));

		return {
			fileEtagPromisesMedia,
			fileEtagPromisesSMIL,
		};
	}

	/**
	 * 	periodically sends http head request to media url and compare last-modified headers, if its different downloads new version of file
	 * @param internalStorageUnit - persistent storage unit
	 * @param filesList - list of files for update checks
	 * @param localFilePath - folder structure specifying path to file
	 */
	private checkLastModified = async (
		internalStorageUnit: IStorageUnit, filesList: MergedDownloadList[],  localFilePath: string,
		): Promise<any[]> => {
		let promises: Promise<any>[] = [];
		for (let i = 0; i < filesList.length; i += 1) {
			if (isUrl(filesList[i].src)) {
				const response = await fetch(createDownloadPath(filesList[i].src), {
					method: 'HEAD',
					headers: {
						Accept: 'application/json',
					},
					mode: 'cors',
				});
				const newLastModified = await response.headers.get('last-modified');
				if (isNil(filesList[i].lastModified)) {
					filesList[i].lastModified = moment(newLastModified).valueOf();
				}

				if ((<number> filesList[i].lastModified) < moment(newLastModified).valueOf()) {
					debug(`New version of file detected: %O`, filesList[i].src);
					promises = promises.concat(await this.parallelDownloadAllFiles(internalStorageUnit, [filesList[i]], localFilePath, true));
				}
			}
		}
		return promises;
	}
}
