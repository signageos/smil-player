import { GetAllInfoOptions, ManageFilesAndInfoOptions } from './playlistDataPrepare';

export interface IPlaylistDataPrepare {
	getAllInfo: (options: GetAllInfoOptions) => Promise<void>;
	manageFilesAndInfo: (options: ManageFilesAndInfoOptions) => Promise<void>;
}
