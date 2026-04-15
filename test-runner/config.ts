export const DUID = '218603c29e5e7275a238c43a1422a9b19188752893c12c5128';

/**
 * Base URL of the running emulator. Centralized so a CI / docker-network
 * setup with non-default port mapping can override via `SMIL_EMULATOR_BASE`
 * without touching individual test or helper files. Default matches the
 * developer-laptop emulator started by `tools/e2e-servers.sh`.
 *
 * The per-worker test server's port is allocated dynamically by the
 * `testServerBaseUrl` worker fixture (test-runner/fixtures.ts), so it is
 * not configurable here; only the emulator base URL is.
 */
export const EMULATOR_BASE = process.env.SMIL_EMULATOR_BASE || 'http://localhost:8090';

/**
 * Default Playwright timeouts for the non-sync e2e suite. Values here cover
 * a clean run with comfortable headroom; a flake on the edge of one of
 * these usually means a root-cause investigation, not a timeout bump.
 */
export const Timeouts = {
	/** Cold-load first-element visibility — covers webpack-dev-server
	 *  compile + every-asset prefetch on the very first navigation. */
	firstElement: 90000,
	/** Standard element-visibility wait — one playlist transition end-to-end. */
	elementAwait: 13000,
	/** Slightly extended `elementAwait` for transitions involving heavier
	 *  assets (e.g. a multi-second video preroll). */
	longerElementAwait: 15000,
	/** Wallclock-bounded priority window end + iteration-finish tail.
	 *  Used by tests that wait for a higher-priority window to elapse
	 *  before the lower-priority element becomes visible again. */
	priorityTransition: 70000,
	/** Brief settle pause between user-visible state changes
	 *  (`page.waitForTimeout(Timeouts.transition)`). */
	transition: 1000,
	/** Video transition window — covers the cross-fade-into-video gap. */
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
