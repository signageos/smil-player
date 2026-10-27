import { Report } from '../../models/reportingModels';
import { IFile } from '@signageos/front-applet/es6/FrontApplet/FileSystem/types';
import {
	SMILAudio,
	SMILImage,
	SMILTicker,
	SMILVideo,
	SMILWidget,
} from '../../models/mediaModels';
import { MergedDownloadList, SMILFile, SMILFileObject } from '../../models/filesModels';
import { SmilLogger } from '../../models/xmlJsonModels';
import { Resource, UpdateDetection } from './resourceChecker/resourceChecker';
import { FetchStrategy } from './fetchingStrategies/fetchingStrategies';
import {
	CurrentFilesSetupOptions,
	GetFileDetailsOptions,
	ParallelDownloadAllFilesOptions,
	PrePlayCheckOptions,
	SendDownloadReportOptions,
	SendMediaReportOptions,
	SendOptInEventReportOptions,
	SendSmiFileReportOptions,
	ShouldUpdateLocalFileOptions,
} from './filesManager';

export type { FetchStrategy };

export interface UpdateCheckResult {
	shouldUpdate: boolean;
	value?: string;
	statusCode?: number;
	contentLength?: number;
}

// Per-file result from processNewContentUpdates, used by prePlayCheck to avoid
// reading from shared Maps (batchUpdates, tempDownloads, pendingWasUpdated).
export interface ProcessedFileUpdate {
	fileName: string;
	tempPath?: string;
	updateValue?: string;
	needsWasUpdated: boolean;
}

export interface IFilesManager {
	getStorageUnitType: () => string;
	setSmilUrl: (url: string) => void;
	setSmiLogging: (smilLogging: SmilLogger) => void;
	sendReport: (message: Report) => Promise<void>;
	sendGeneralErrorReport: (message: string) => Promise<void>;
	sendDownloadReport: (options: SendDownloadReportOptions) => Promise<void>;
	sendMediaReport: (options: SendMediaReportOptions) => Promise<void>;
	sendSmiFileReport: (options: SendSmiFileReportOptions) => Promise<void>;
	sendOptInEventReport: (options: SendOptInEventReportOptions) => Promise<void>;
	currentFilesSetup: (options: CurrentFilesSetupOptions) => Promise<void>;
	getFileDetails: (options: GetFileDetailsOptions) => Promise<IFile | null>;
	shouldUpdateLocalFile: (options: ShouldUpdateLocalFileOptions) => Promise<UpdateCheckResult>;
	writeMediaInfoFile: (mediaInfoObject: object) => Promise<void>;
	deleteFile: (filePath: string) => Promise<void>;
	readFile: (filePath: string) => Promise<string>;
	fileExists: (filePath: string) => Promise<boolean>;
	parallelDownloadAllFiles: (
		options: ParallelDownloadAllFilesOptions,
	) => Promise<{ promises: Promise<void>[]; filesToUpdate: Map<string, number | string> }>;
	createFileStructure: () => Promise<void>;
	prepareDownloadMediaSetup: (smilObject: SMILFileObject) => Promise<void>;
	prepareLastModifiedSetup: (smilObject: SMILFileObject, smilFile: SMILFile) => Promise<Resource[]>;
	// Batch update methods for atomic mediaInfoObject updates
	startBatch: () => void;
	collectUpdate: (fileName: string, value: string) => void;
	commitBatch: (filesList: MergedDownloadList[]) => Promise<void>;
	// Batch download optimization methods
	processNewContentUpdates: (detections: UpdateDetection[], allFilesList?: MergedDownloadList[]) => Promise<ProcessedFileUpdate[]>;
	handleMovedContent: (detection: UpdateDetection) => Promise<void>;
	prePlayCheck: (options: PrePlayCheckOptions) => Promise<void>;
	// playCheckUrl playability gate: true = skip playback this pass (never touches downloads/expr).
	// SMILTicker is a first-class member (tickers route through playElement like other media),
	// not just structurally assignable.
	playCheckGate: (
		media: SMILVideo | SMILImage | SMILWidget | SMILAudio | SMILTicker,
		smilObject: SMILFileObject,
	) => Promise<boolean>;
}
