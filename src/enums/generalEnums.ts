export enum SMILEnums {
	region = 'region',
	transition = 'transition',
	transitionType = 'transIn',
	rootLayout = 'root-layout',
	defaultRegion = 'rootLayout',
	img = 'img',
	defaultRefresh = 20,
	defaultDownloadRetry = 60,
	videoDurationOffset = 1000,
	defaultVideoDuration = 0,
	metaContent = 'content',
	metaLog = 'log',
	onlySmilUpdate = 'onlySmilUpdate',
	syncServer = 'syncServerUrl',
	defaultRepeatCount = 'defaultRepeatCount',
	defaultTransition = 'defaultTransition',
}

export const parentGenerationRemove = [
	'promiseFunction',
	'media',
	'playing',
	'player',
	'lastModified',
	'isFirstInPlaylist',
	'syncIndex',
	'timeoutReference',
	'parent',
	'syncGroupName',
	'transitionInfo',
];

export const randomPlaylistPlayableTagsRegex = /^img|^video|^ref|^ticker|^par|^seq|^exl|^priorityClass/;

export const smilUpdate = {
	invalid: 'invalid',
} as const;
