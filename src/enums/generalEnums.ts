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

// Parent-ID hashing is ALLOW-LIST based: only the declarative SMIL attributes below
// reach the hash, so runtime writes onto the parsed tree are invisible by construction
// (the old deny-list drifted 4× in production: wasUpdated, popName, useInReportUrlStale,
// expr='skipContent'). A new declarative attribute that must discriminate elements has
// to be added here; leaving it out makes elements differing only by it share one
// priority-tracking entry (soft collision — elements merge, never drift).
// Excluded on purpose (declarative BUT runtime-mutated): popName (report senders),
// useInReportUrl/useInReportUrlStale (signed-URL refresh).
export const parentGenerationAllow = [
	// structure / scheduling
	'repeatCount',
	'begin',
	'end',
	'expr',
	'playMode',
	'data',
	// priorityClass rules
	'lower',
	'peer',
	'higher',
	'pauseDisplay',
	// media declarative attributes
	'src',
	'dur',
	'region',
	'fit',
	'soundLevel',
	'isStream',
	'protocol',
	'preload',
	'z-index',
	'param',
	// trigger/dynamic values (prepare-time, idempotent writes)
	'triggerValue',
	'dynamicValue',
	// proof-of-play declarative attributes
	'popCustomId',
	'popType',
	'popTags',
	'popFileName',
	'reportMode',
	// content-update / playability-gate attributes
	'updateCheckUrl',
	'updateCheckInterval',
	'allowLocalFallback',
	'playCheckUrl',
	'playCheckSkipOnError',
	// ticker declarative attributes
	'text',
	'fontName',
	'fontSize',
	'fontColor',
	'backgroundColor',
	'linearGradient',
	'linearGradientAngle',
	'velocity',
	'indentation',
];

// Structure/media tag keys the parent-ID projection recurses into (xml2js appends
// digits to duplicate sibling tags: seq3, img4, ...).
export const parentGenerationRecurseTagsRegex =
	/^(?:seq|par|excl|exl|priorityClass|video|img|ref|audio|ticker|prefetch|emitDynamic|EXPERIMENTAL_emitDynamic)\d*$/;

export const randomPlaylistPlayableTagsRegex = /^img|^video|^ref|^ticker|^par|^seq|^exl|^priorityClass/;

export const smilUpdate = {
	invalid: 'invalid',
} as const;
