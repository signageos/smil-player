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
import { Resource, UpdateDetection } from './resourceChecker/resourceChecker';
import { FetchStrategy } from './fetchingStrategies/fetchingStrategies';

export type { FetchStrategy };

export interface UpdateCheckResult {
	shouldUpdate: boolean;
	value?: string;
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
		timeOut: number,
		skipContentHttpStatusCodes: number[],
		updateContentHttpStatusCodes: number[],
		fetchStrategy: FetchStrategy,
	) => Promise<UpdateCheckResult>;
	writeMediaInfoFile: (mediaInfoObject: object) => Promise<void>;
	deleteFile: (filePath: string) => Promise<void>;
	readFile: (filePath: string) => Promise<string>;
	fileExists: (filePath: string) => Promise<boolean>;
	parallelDownloadAllFiles: (
		filesList: MergedDownloadList[],
		localFilePath: string,
		timeOut: number,
		skipContentHttpStatusCodes: number[],
		updateContentHttpStatusCodes: number[],
		fetchStrategy: FetchStrategy,
		forceDownload?: boolean,
		latestRemoteValue?: number | string,
		allFilesList?: MergedDownloadList[],
		externalPendingUpdates?: Map<string, string | number>,
	) => Promise<{ promises: Promise<void>[]; filesToUpdate: Map<string, number | string> }>;
	createFileStructure: () => Promise<void>;
	prepareDownloadMediaSetup: (smilObject: SMILFileObject) => Promise<Promise<void>[]>;
	prepareLastModifiedSetup: (smilObject: SMILFileObject, smilFile: SMILFile) => Promise<Resource[]>;
	// Batch update methods for atomic mediaInfoObject updates
	startBatch: () => void;
	collectUpdate: (fileName: string, value: string) => void;
	commitBatch: (filesList: MergedDownloadList[]) => Promise<void>;
	// Batch download optimization methods
	processNewContentUpdates: (detections: UpdateDetection[], allFilesList?: MergedDownloadList[]) => Promise<void>;
	handleMovedContent: (detection: UpdateDetection) => Promise<void>;
}
