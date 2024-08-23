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
import {
	CheckETagFunctions,
	MediaInfoObject,
	MergedDownloadList,
	SMILFile,
	SMILFileObject,
} from '../../models/filesModels';
import { SmilLogger } from '../../models/xmlJsonModels';

export interface IFilesManager {
	setSmilUrl: (url: string) => void;
	setSmiLogging: (smilLogging: SmilLogger) => void;
	sendReport: (message: Report) => Promise<void>;
	sendGeneralErrorReport: (message: string) => Promise<void>;
	sendDownloadReport: (
		fileType: ItemType,
		localFilePath: string,
		internalStorageUnit: IStorageUnit,
		fileSrc: string,
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
	currentFilesSetup: (
		widgets: SMILWidget[],
		internalStorageUnit: IStorageUnit,
		smilObject: SMILFileObject,
		smilUrl: string,
	) => Promise<void>;
	getFileDetails: (
		media: SMILVideo | SMILImage | SMILWidget | SMILAudio,
		internalStorageUnit: IStorageUnit,
		fileStructure: string,
	) => Promise<IFile | null>;
	shouldUpdateLocalFile: (
		internalStorageUnit: IStorageUnit,
		localFilePath: string,
		media: MergedDownloadList,
		mediaInfoObject: MediaInfoObject,
	) => Promise<boolean>;
	writeMediaInfoFile: (internalStorageUnit: IStorageUnit, mediaInfoObject: object) => Promise<void>;
	deleteFile: (internalStorageUnit: IStorageUnit, filePath: string) => Promise<void>;
	readFile: (internalStorageUnit: IStorageUnit, filePath: string) => Promise<string>;
	fileExists: (internalStorageUnit: IStorageUnit, filePath: string) => Promise<boolean>;
	parallelDownloadAllFiles: (
		internalStorageUnit: IStorageUnit,
		filesList: MergedDownloadList[],
		localFilePath: string,
		forceDownload: boolean,
	) => Promise<Promise<void>[]>;
	createFileStructure: (internalStorageUnit: IStorageUnit) => Promise<void>;
	prepareDownloadMediaSetup: (
		internalStorageUnit: IStorageUnit,
		smilObject: SMILFileObject,
	) => Promise<Promise<void>[]>;
	prepareLastModifiedSetup: (
		internalStorageUnit: IStorageUnit,
		smilObject: SMILFileObject,
		smilFile: SMILFile,
	) => Promise<CheckETagFunctions>;
	fetchLastModified: (fileSrc: string) => Promise<null | string | number>;
}
