export const DUID = '218603c29e5e7275a238c43a1422a9b19188752893c12c5128';

export const Timeouts = {
	firstElement: 90000, // webpack compile + asset download on first load
	elementAwait: 13000, // standard element visibility wait
	longerElementAwait: 15000,
	priorityTransition: 70000, // wallclock-based priority window end + iteration-finish tail
	transition: 1000,
	videoTransition: 5300,
};

/** Generate SMIL URLs for a given test server port */
export function getSmilUrls(port: number = 3000) {
	const base = `http://localhost:${port}`;
	return {
		zones: `${base}/layout/zonesCypress.smil`,
		noActiveSeq: `${base}/wallclock/wallclockNoActiveSeq.smil`,
		noActivePar: `${base}/wallclock/wallclockNoActivePar.smil`,
		wallclockFixedSeqWebsite: `${base}/wallclock/wallclockFixedSeqWebsite.smil`,
		wallclockFixedParWebsite: `${base}/wallclock/wallclockFixedParWebsite.smil`,
		wallclockConditionalSeq: `${base}/wallclock/wallclockConditionalSeq.smil`,
		wallclockConditionalPar: `${base}/wallclock/wallclockConditionalPar.smil`,
		repeatCountNoIntro: `${base}/playback/repeatCountNoIntro.smil`,
		repeatCountIntroVideo: `${base}/playback/repeatCountIntroVideo.smil`,
		repeatCountIntroImage: `${base}/playback/repeatCountIntroImage.smil`,
		conditionalMediaElement: `${base}/layout/conditionalMediaElement.smil`,
		introFirstVideoSame: `${base}/playback/introFirstVideoSame.smil`,
		relativeFilePaths: `${base}/layout/relativeFilePaths.smil`,
		priorityStop: `${base}/dynamic/priorityStop.smil`,
		priorityPause: `${base}/dynamic/priorityPause.smil`,
		priorityDefer: `${base}/dynamic/priorityDefer.smil`,
		priorityDeferExpiry: `${base}/dynamic/priorityDeferExpiry.smil`,
		priorityNever: `${base}/dynamic/priorityNever.smil`,
		prioritySeqCampaign: `${base}/dynamic/prioritySeqCampaign.smil`,
		priorityPeerDefer: `${base}/dynamic/priorityPeerDefer.smil`,
		priorityThreeLevelDeferExpiry: `${base}/dynamic/priorityThreeLevelDeferExpiry.smil`,
		priorityPeerPause: `${base}/dynamic/priorityPeerPause.smil`,
		prioritySmilUpdate: `${base}/dynamic-update/prioritySmilUpdate.smil`,
		priorityLowerStop: `${base}/dynamic/priorityLowerStop.smil`,
		priorityLowerPause: `${base}/dynamic/priorityLowerPause.smil`,
		priorityDeferInterrupt: `${base}/dynamic/priorityDeferInterrupt.smil`,
		priorityOscillation: `${base}/dynamic/priorityOscillation.smil`,
		priorityPeerStop: `${base}/dynamic/priorityPeerStop.smil`,
		wallclockFuture: `${base}/wallclock/wallclockFuture.smil`,
		correctOrder: `${base}/playback/correctOrder.smil`,
		noAdditionalPar: `${base}/layout/noAdditionalPar.smil`,
		noAdditionalSeq: `${base}/layout/noAdditionalSeq.smil`,
		wallclockRepeatCount: `${base}/wallclock/wallclockRepeatCount.smil`,
		triggersKeyboard: `${base}/triggers/triggersKeyboard.smil`,
		triggersMouse: `${base}/triggers/triggersMouse.smil`,
		brokenXml: `${base}/errorHandling/brokenXml.smil`,
		nonExisting: `${base}/none`,
		videoStreams: `${base}/playback/videoStreams.smil`,
		notExistingMedia: `${base}/errorHandling/NotExistingMedia.smil`,
		widgetExtensions: `${base}/layout/widgetExtensions.smil`,
		cssBottom: `${base}/layout/cssBottomAndRight.smil`,
		conditionalTimePriority: `${base}/dynamic/conditionalTimePriority.smil`,
		triggersWidget: `${base}/triggers/triggersWidget.smil`,
		triggersStop: `${base}/triggers/triggersStop.smil`,
		crossfadeTransition: `${base}/transitions/simpleCrossfade.smil`,
		billboardTransition: `${base}/transitions/simpleBillboard.smil`,
		playModeOne: `${base}/playback/playModeOne.smil`,
		playModeOneFiniteRepeat: `${base}/playback/playModeOneFiniteRepeat.smil`,
		queryStringMedia: `${base}/playback/queryStringMedia.smil`,
		triggersMouseDuration: `${base}/triggers/triggersMouseDuration.smil`,
		triggersCrossCancel: `${base}/triggers/triggersCrossCancel.smil`,
		customEndpointReporting: `${base}/reporting/customEndpointReporting.smil`,
		skipContentOnHttpStatus: `${base}/reporting/skipOnHttpStatus.smil`,
		fallbackToPreviousPlaylist: `${base}/fallback-smil/fallbackToPrevious.smil`,
		playModeOneSync: `${base}/syncFiles/playModeOneSync.smil`,
		linearPlaylistAckParity: `${base}/syncFiles/linearPlaylistAckParity.smil`,
		wallclockInflatedBounds: `${base}/syncFiles/wallclockInflatedBounds.smil`,
		cycleWrapBoundary: `${base}/syncFiles/cycleWrapBoundary.smil`,
		// Group D: served via /dynamic/ (fillWallclock substitutes priority windows).
		wallclockPriorityTransition: `${base}/dynamic/wallclockPriorityTransition.smil`,
		// Group J: 3-level priority cascade (P1→P2→P3). Also served via /dynamic/.
		threeLevelPriorityTransition: `${base}/dynamic/threeLevelPriorityTransition.smil`,
		// Group E: served via /dynamic-refresh/ (time-bucket Last-Modified, constant body).
		smilUpdateStability: `${base}/dynamic-refresh/smilUpdateStability.smil`,
	};
}

export type SmilUrlsMap = ReturnType<typeof getSmilUrls>;

// Static export for backward compatibility
export const SMILUrls = getSmilUrls(3000);

export const TestServer = {
	port: 3000,
};
