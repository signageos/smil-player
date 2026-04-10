import { SMILFile } from '../../../models/filesModels';
import { PlaylistElement } from '../../../models/playlistModels';
import { PriorityObject } from '../../../models/priorityModels';

export interface IPlaylistProcessor {
	setCheckFilesLoop: (checkFilesLoop: boolean) => void;
	getCheckFilesLoop: () => boolean;
	setPlaylistVersion: (num: number) => void;
	getPlaylistVersion: () => number;
	setCancelFunction: (value: boolean, index: number) => void;
	playIntro: (introMedia: string) => Promise<Promise<void>[]>;
	processingLoop: (smilFile: SMILFile, firstIteration: boolean, restart: () => void) => Promise<void>;
	processPriorityTag: (
		value: PlaylistElement | PlaylistElement[],
		version: number,
		parent: string,
		endTime: number,
		conditionalExpr: string,
	) => Promise<Promise<void>[]>;
	processPlaylist: (
		playlist: PlaylistElement | PlaylistElement[],
		version: number,
		parent: string,
		endTime: number,
		priorityObject: PriorityObject,
		conditionalExpr: string,
	) => Promise<void>;
}
