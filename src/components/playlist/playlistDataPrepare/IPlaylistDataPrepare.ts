import { PlaylistElement } from '../../../models/playlistModels';
import { TriggerList } from '../../../models/triggerModels';
import { SMILFileObject } from '../../../models/filesModels';

export interface IPlaylistDataPrepare {
	getAllInfo: (
		playlist: PlaylistElement | PlaylistElement[] | TriggerList,
		smilObject: SMILFileObject,
		smilUrl: string,
		isTrigger: boolean,
		triggerName: string,
	) => Promise<void>;
	manageFilesAndInfo: (
		smilObject: SMILFileObject,
		smilUrl: string,
	) => Promise<void>;
}
