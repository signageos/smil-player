import { ProcessingLoopOptions, ProcessPlaylistOptions, ProcessPriorityTagOptions } from './playlistProcessor';

export interface IPlaylistProcessor {
	setCheckFilesLoop: (checkFilesLoop: boolean) => void;
	getCheckFilesLoop: () => boolean;
	setPlaylistVersion: (num: number) => void;
	getPlaylistVersion: () => number;
	setCancelFunction: (value: boolean, index: number) => void;
	playIntro: (introMedia: string) => Promise<Promise<void>[]>;
	processingLoop: (options: ProcessingLoopOptions) => Promise<void>;
	processPriorityTag: (options: ProcessPriorityTagOptions) => Promise<Promise<void>[]>;
	processPlaylist: (options: ProcessPlaylistOptions) => Promise<string | void>;
}
