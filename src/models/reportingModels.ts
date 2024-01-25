export type Source = {
	filePath: { path: string; storage: string };
	uri: string;
	localUri: string;
};

export type MediaPlayed = {
	type: 'SMIL.MediaPlayed' | 'SMIL.MediaPlayed-Synced';
	itemType: MediaItemType;
	source: Source;
	startedAt: Date;
	endedAt: Date | null;
	failedAt: Date | null;
	errorMessage: string | null;
};

export type FileDownload = {
	type: 'SMIL.FileDownloaded';
	itemType: ItemType;
	source: Source;
	startedAt: Date;
	succeededAt: Date | null;
	failedAt: Date | null;
	errorMessage: string | null;
};

export type PlaybackStarted = {
	type: 'SMIL.PlaybackStarted';
	source: Source;
	succeededAt: Date | null;
	failedAt: Date | null;
	errorMessage: string | null;
};

export type SmilError = {
	type: 'SMIL.Error';
	source?: Source;
	failedAt: Date;
	errorMessage: string;
};

export type SyncWait = {
	type: 'SMIL.SyncWait-Started' | 'SMIL.SyncWait-Ended';
	source: Source;
	startedAt: Date;
	groupName: string;
};

export type Report = MediaPlayed | FileDownload | PlaybackStarted | SmilError | SyncWait;
export type ItemType = 'image' | 'video' | 'ref' | 'smil' | 'ticker';
export type MediaItemType = 'image' | 'video' | 'ref' | 'ticker';
