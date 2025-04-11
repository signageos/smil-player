import { ItemType, MediaItemType, Report } from '../../models/reportingModels';
import { IFile, IStorageUnit } from '@signageos/front-applet/es6/FrontApplet/FileSystem/types';
import {
	SMILAudio,
	SMILImage,
	SMILMediaNoVideo,
	SMILVideo,
	SMILWidget,
	SosHtmlElement,
} from '../../models/mediaModels';
import { MediaInfoObject, MergedDownloadList, SMILFile, SMILFileObject } from '../../models/filesModels';
import { SmilLogger } from '../../models/xmlJsonModels';
import { Resource } from './resourceChecker/resourceChecker';

export interface UpdateCheckResult {
	shouldUpdate: boolean;
	lastModified?: number;
}

export interface IFilesManager {
	setSmilUrl: (url: string) => void;
	setSmiLogging: (smilLogging: SmilLogger) => void;
	sendReport: (message: Report) => Promise<void>;
	sendGeneralErrorReport: (message: string) => Promise<void>;
	sendDownloadReport: (
		fileType: ItemType,
		localFilePath: string,
		value: MergedDownloadList,
		taskStartDate: Date,
		errMessage: string | null,
	) => Promise<void>;
	sendMediaReport: (
		value: SMILVideo | SMILMediaNoVideo | SosHtmlElement,
		taskStartDate: Date,
		itemType: MediaItemType,
		isMediaSynced: boolean,
		errMessage: string | null,
	) => Promise<void>;
	sendSmiFileReport: (localFilePath: string, src: string, errMessage: string | null) => Promise<void>;
	currentFilesSetup: (widgets: SMILWidget[], smilObject: SMILFileObject, smilUrl: string) => Promise<void>;
	getFileDetails: (
		media: SMILVideo | SMILImage | SMILWidget | SMILAudio,
		internalStorageUnit: IStorageUnit,
		fileStructure: string,
	) => Promise<IFile | null>;
	shouldUpdateLocalFile: (
		localFilePath: string,
		media: MergedDownloadList,
		mediaInfoObject: MediaInfoObject,
	) => Promise<UpdateCheckResult>;
	writeMediaInfoFile: (mediaInfoObject: object) => Promise<void>;
	deleteFile: (filePath: string) => Promise<void>;
	readFile: (filePath: string) => Promise<string>;
	fileExists: (filePath: string) => Promise<boolean>;
	parallelDownloadAllFiles: (
		filesList: MergedDownloadList[],
		localFilePath: string,
		forceDownload: boolean,
	) => Promise<Promise<void>[]>;
	createFileStructure: () => Promise<void>;
	prepareDownloadMediaSetup: (smilObject: SMILFileObject) => Promise<Promise<void>[]>;
	prepareLastModifiedSetup: (smilObject: SMILFileObject, smilFile: SMILFile) => Promise<Resource[]>;
	fetchLastModified: (
		media: MergedDownloadList,
		timeOut: number,
		skipContentHttpStatusCodes: number[],
	) => Promise<null | string>;
}
