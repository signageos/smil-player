import { DynamicPlaylistList, TriggerList } from './triggerModels';
import { RegionsObject, TransitionsObject } from './xmlJsonModels';
import { SMILPlaylist } from './playlistModels';
import { PoPAttributes, SMILAudio, SMILImage, SMILIntro, SMILVideo, SMILWidget } from './mediaModels';

export type DownloadsList = {
	video: SMILVideo[];
	img: SMILImage[];
	ref: SMILWidget[];
	audio: SMILAudio[];
	intro: SMILIntro[];
	[key: string]: SMILVideo[] | SMILImage[] | SMILWidget[] | SMILAudio[] | SMILIntro[];
};

export type CheckETagFunctions = {
	fileEtagPromisesMedia: Promise<void>[];
	fileEtagPromisesSMIL: Promise<void>[];
};

export type SMILFile = {
	src: string;
	lastModified?: number;
	/** Optional callback which overrides standard downloadFile process and do it inside the callback instead */
	download?: () => Promise<void>;
	/** Optional callback which overrides default checking for last-modified header using HEAD */
	fetchLastModified?: () => Promise<string | number | null>;
} & PoPAttributes;

export type MediaInfoObject = {
	[fileName: string]: string | null | number;
};

export type SMILFileObject = SMILPlaylist &
	RegionsObject &
	DownloadsList &
	TriggerList &
	TransitionsObject &
	DynamicPlaylistList;
export type MergedDownloadList = SMILWidget | SMILImage | SMILAudio | SMILVideo | SMILFile;
