export enum FileStructure {
	rootFolder = 'smil',
	smilMediaInfo = 'smil/info',
	smilMediaInfoFileName = 'mediaInfo.smilMeta',
	videos = 'smil/videos',
	audios = 'smil/audios',
	images = 'smil/images',
	widgets = 'smil/widgets',
	extracted = 'smil/widgets/extracted',
	offlineReports = 'offlineReports',
	// Temp folders for atomic file updates
	videosTmp = 'smil/videos/tmp',
	audiosTmp = 'smil/audios/tmp',
	imagesTmp = 'smil/images/tmp',
	widgetsTmp = 'smil/widgets/tmp',
	// Storage folders for preserving old content (parent must be defined before children)
	storage = 'smil/storage',
	storageVideos = 'smil/storage/videos',
	storageAudios = 'smil/storage/audios',
	storageImages = 'smil/storage/images',
	storageWidgets = 'smil/storage/widgets',
	storageInfoFileName = 'storageInfo.json',
}

export enum mapObject {
	smil = 'smil',
	images = 'image',
	videos = 'video',
	widgets = 'ref',
	audios = 'audio',
}

export enum smilLogging {
	standard = 'standard',
	proofOfPlay = 'manual',
	proofOfPlayPrefix = 'pop',
}

// Custom-endpoint report event names sent when no `events` allowlist is configured
// in <meta log>. Matches the player's historical behavior exactly.
export const DEFAULT_CUSTOM_ENDPOINT_EVENTS = [
	'media-download',
	'media-playback',
	'playlist-download',
	'playlist-playback',
];
// All valid names for the `events` allowlist. Names beyond the default four are
// opt-in only: they are never sent unless explicitly listed.
export const CUSTOM_ENDPOINT_EVENTS = [
	...DEFAULT_CUSTOM_ENDPOINT_EVENTS,
	'media-copied',
	'media-moved',
	'media-restored',
	'media-deleted',
	'media-skipped',
];

export const WidgetExtensions = ['.ipk', '.apk', '.wgt', '.zip'];
export const WidgetFullPath = 'internal/smil/widgets/';
export const CUSTOM_ENDPOINT_REPORT_FILE_LIMIT = 100;
// 100 MB — absolute floor for `estimatedFreeSpace`. NO storage-consuming operation
// (download, dedup copy, MOVED_CONTENT slot copy, restore-from-storage, offline report)
// is allowed to proceed if it would drop available space below this threshold.
// Enforced centrally in `FilesManager.checkAvailableSpace`.
export const MINIMAL_STORAGE_FREE_SPACE = 100 * 1024 * 1024;
// ten minutes
export const CUSTOM_ENDPOINT_OFFLINE_INTERVAL = 60 * 1000 * 10;
export const DEFAULT_LAST_MODIFIED = 'Thu, 01 Jan 1970 00:00:00 GMT';
export const STORAGE_MAX_FILES = 20;
