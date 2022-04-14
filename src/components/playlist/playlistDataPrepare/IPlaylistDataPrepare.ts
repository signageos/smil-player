import { PlaylistElement } from '../../../models/playlistModels';
import { TriggerList } from '../../../models/triggerModels';
import { SMILFileObject } from '../../../models/filesModels';
import { IStorageUnit } from '@signageos/front-applet/es6/FrontApplet/FileSystem/types';

export interface IPlaylistDataPrepare {
	getAllInfo: (
		playlist: PlaylistElement | PlaylistElement[] | TriggerList,
		smilObject: SMILFileObject,
		internalStorageUnit: IStorageUnit,
		smilUrl: string,
		isTrigger: boolean,
		triggerName: string,
	) => Promise<void>;
	manageFilesAndInfo: (
		smilObject: SMILFileObject,
		internalStorageUnit: IStorageUnit,
		smilUrl: string,
	) => Promise<void>;
}
