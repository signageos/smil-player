import { SMILFileObject } from '../../../models/filesModels';
import { GetAllInfoOptions } from './playlistDataPrepare';

export interface IPlaylistDataPrepare {
	getAllInfo: (options: GetAllInfoOptions) => Promise<void>;
	manageFilesAndInfo: (
		smilObject: SMILFileObject,
		smilUrl: string,
	) => Promise<void>;
}
