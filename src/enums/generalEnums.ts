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
	// Backstop for videos with no usable duration info: without it, a video whose
	// underlying player silently failed (front-display swallows video-pool
	// exhaustion) has a never-settling onceEnded and hangs the region's whole
	// processing chain forever (live-observed master engine death 2026-07-10).
	unknownVideoDurationFallbackMs = 600000,
	metaContent = 'content',
	metaContentRefresh = 'contentRefresh',
	metaSmilRefresh = 'smilFileRefresh',
	metaLog = 'log',
	onlySmilUpdate = 'onlySmilUpdate',
	syncServer = 'syncServerUrl',
	defaultRepeatCount = 'defaultRepeatCount',
	defaultTransition = 'defaultTransition',
	skipContentOnHttpStatus = 'skipContentOnHttpStatus',
	skipPlaybackOnHttpStatus = 'skipPlaybackOnHttpStatus',
	updateContentOnHttpStatus = 'updateContentOnHttpStatus',
	updateMechanism = 'updateMechanism',
	checkBeforePlay = 'checkBeforePlay',
	checkAheadCount = 'checkAheadCount',
	location = 'location',
	lastModified = 'last-modified',
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
	'localFilePath',
	'regionInfo',
	'fullVideoDuration',
	'id',
	// runtime flag written onto the parsed tree by handleHtmlElementPrepare during
	// first playback; without stripping it the parent hash drifts between traversal
	// passes and the element registers as a phantom peer of its own seq-mates
	'wasUpdated',
	// report senders (sendMediaReport/sendDownloadReport/sendOptInEventReport) write
	// the event name into value.popName on the live element; media-skipped can flip
	// it every pass on a flapping playCheckUrl gate — same drift class as wasUpdated
	'popName',
	// runtime unavailable-content flag set/cleared by the fetch strategies on every
	// skip→recover transition (replaces the old expr='skipContent' sentinel, which
	// drifted the hash AND destroyed declarative exprs) — same drift class as wasUpdated
	'skipContentMark',
];

export const randomPlaylistPlayableTagsRegex = /^img|^video|^ref|^ticker|^par|^seq|^exl|^priorityClass/;

export const smilUpdate = {
	invalid: 'invalid',
} as const;
