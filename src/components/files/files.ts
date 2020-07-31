import isNil = require('lodash/isNil');
import { FileStructure } from '../../enums';
import {
	CheckETagFunctions,
	SMILAudio,
	SMILFile,
	SMILFileObject,
	SMILImage,
	SMILVideo,
	SMILWidget,
	SosModule,
} from '../../models';
import { IStorageUnit } from '@signageos/front-applet/es6/FrontApplet/FileSystem/types';
import { getFileName, getPath, isValidLocalPath } from './tools';
import { debug } from './tools';
import { corsAnywhere } from '../../../config/parameters';

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
			if (isUrl(widgets[i].src)) {
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

	// tslint:disable-next-line:max-line-length
	public parallelDownloadAllFiles = async (internalStorageUnit: IStorageUnit, filesList: any[], localFilePath: string, forceDownload: boolean = false): Promise<any[]> => {
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
					filePath: `${localFilePath}/${getFileName(filesList[i].src)}`,
				},
			))) {
				promises.push((async () => {
					debug(`Downloading file: %O`, filesList[i].src);
					await this.sos.fileSystem.downloadFile(
						{
							storageUnit: internalStorageUnit,
							filePath: `${localFilePath}/${getFileName(filesList[i].src)}`,
						},
						corsAnywhere + filesList[i].src,
					);
				})());
			}
		}
		return promises;
	}

	public checkFileEtag = async (internalStorageUnit: IStorageUnit, filesList: any[], localFilePath: string): Promise<any[]> => {
		let promises: Promise<any>[] = [];
		for (let i = 0; i < filesList.length; i += 1) {
			if (isUrl(filesList[i].src)) {
				const response = await fetch(corsAnywhere + filesList[i].src, {
					method: 'HEAD',
					headers: {
						Accept: 'application/json',
					},
				});
				const newEtag = await response.headers.get('ETag');
				if (isNil(filesList[i].etag)) {
					filesList[i].etag = newEtag;
				}

				if (filesList[i].etag !== newEtag) {
					debug(`New version of file detected: %O`, filesList[i].src);
					promises = promises.concat(this.parallelDownloadAllFiles(internalStorageUnit, [filesList[i]], localFilePath));
				}
			}
		}
		return promises;
	}

	public createFileStructure = async (internalStorageUnit: IStorageUnit) => {
		for (const path of Object.values(FileStructure)) {
			if (await this.sos.fileSystem.exists({
				storageUnit: internalStorageUnit,
				filePath: path,
			})) {
				debug(`Filepath already exists, deleting: %O`, path);
				await this.sos.fileSystem.deleteFile({
					storageUnit: internalStorageUnit,
					filePath: path,
				},                                   true);
			}
			debug(`Create directory structure: %O`, path);
			await this.sos.fileSystem.createDirectory({
				storageUnit: internalStorageUnit,
				filePath: path,
			});
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

	public prepareETagSetup = async (
		internalStorageUnit: IStorageUnit,
		smilObject: SMILFileObject,
		smilFile: SMILFile,
	): Promise<CheckETagFunctions>  => {
		let fileEtagPromisesMedia: Promise<any>[] = [];
		let fileEtagPromisesSMIL: Promise<any>[] = [];
		debug(`Starting to check files for updates %O:`, smilObject);

		fileEtagPromisesMedia = fileEtagPromisesMedia.concat(this.checkFileEtag(internalStorageUnit, smilObject.video, FileStructure.videos));
		fileEtagPromisesMedia = fileEtagPromisesMedia.concat(this.checkFileEtag(internalStorageUnit, smilObject.audio, FileStructure.audios));
		fileEtagPromisesMedia = fileEtagPromisesMedia.concat(this.checkFileEtag(internalStorageUnit, smilObject.img, FileStructure.images));
		fileEtagPromisesMedia = fileEtagPromisesMedia.concat(this.checkFileEtag(internalStorageUnit, smilObject.ref, FileStructure.widgets));

		fileEtagPromisesSMIL = fileEtagPromisesSMIL.concat(this.checkFileEtag(internalStorageUnit, [smilFile], FileStructure.rootFolder));

		return {
			fileEtagPromisesMedia,
			fileEtagPromisesSMIL,
		};
	}
}
