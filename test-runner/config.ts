export const DUID = '218603c29e5e7275a238c43a1422a9b19188752893c12c5128';

export const Timeouts = {
	firstElement: 90000, // webpack compile + asset download on first load
	elementAwait: 13000, // standard element visibility wait
	longerElementAwait: 15000,
	priorityTransition: 70000, // wallclock-based priority window end + iteration-finish tail
	transition: 1000,
	videoTransition: 5300,
};

export const SMILUrls = {
	zones: 'http://localhost:3000/layout/zonesCypress.smil',
	noActiveSeq: 'http://localhost:3000/wallclock/wallclockNoActiveSeq.smil',
	noActivePar: 'http://localhost:3000/wallclock/wallclockNoActivePar.smil',
	wallclockFixedSeqWebsite: 'http://localhost:3000/wallclock/wallclockFixedSeqWebsite.smil',
	wallclockFixedParWebsite: 'http://localhost:3000/wallclock/wallclockFixedParWebsite.smil',
	wallclockConditionalSeq: 'http://localhost:3000/wallclock/wallclockConditionalSeq.smil',
	wallclockConditionalPar: 'http://localhost:3000/wallclock/wallclockConditionalPar.smil',
	repeatCountNoIntro: 'http://localhost:3000/playback/repeatCountNoIntro.smil',
	repeatCountIntroVideo: 'http://localhost:3000/playback/repeatCountIntroVideo.smil',
	repeatCountIntroImage: 'http://localhost:3000/playback/repeatCountIntroImage.smil',
	conditionalMediaElement: 'http://localhost:3000/layout/conditionalMediaElement.smil',
	introFirstVideoSame: 'http://localhost:3000/playback/introFirstVideoSame.smil',
	relativeFilePaths: 'http://localhost:3000/layout/relativeFilePaths.smil',
	priorityStop: 'http://localhost:3000/dynamic/priorityStop.smil',
	priorityPause: 'http://localhost:3000/dynamic/priorityPause.smil',
	priorityDefer: 'http://localhost:3000/dynamic/priorityDefer.smil',
	priorityDeferExpiry: 'http://localhost:3000/dynamic/priorityDeferExpiry.smil',
	priorityNever: 'http://localhost:3000/dynamic/priorityNever.smil',
	prioritySeqCampaign: 'http://localhost:3000/dynamic/prioritySeqCampaign.smil',
	priorityPeerDefer: 'http://localhost:3000/dynamic/priorityPeerDefer.smil',
	priorityThreeLevelDeferExpiry: 'http://localhost:3000/dynamic/priorityThreeLevelDeferExpiry.smil',
	priorityPeerPause: 'http://localhost:3000/dynamic/priorityPeerPause.smil',
	prioritySmilUpdate: 'http://localhost:3000/dynamic-update/prioritySmilUpdate.smil',
	priorityLowerStop: 'http://localhost:3000/dynamic/priorityLowerStop.smil',
	priorityLowerPause: 'http://localhost:3000/dynamic/priorityLowerPause.smil',
	priorityDeferInterrupt: 'http://localhost:3000/dynamic/priorityDeferInterrupt.smil',
	priorityOscillation: 'http://localhost:3000/dynamic/priorityOscillation.smil',
	priorityPeerStop: 'http://localhost:3000/dynamic/priorityPeerStop.smil',
	wallclockFuture: 'http://localhost:3000/dynamic/wallclockFuture.smil',
	correctOrder: 'http://localhost:3000/playback/correctOrder.smil',
	noAdditionalPar: 'http://localhost:3000/layout/noAdditionalPar.smil',
	noAdditionalSeq: 'http://localhost:3000/layout/noAdditionalSeq.smil',
	wallclockRepeatCount: 'http://localhost:3000/wallclock/wallclockRepeatCount.smil',
	triggersKeyboard: 'http://localhost:3000/triggers/triggersKeyboard.smil',
	triggersMouse: 'http://localhost:3000/triggers/triggersMouse.smil',
	brokenXml: 'http://localhost:3000/errorHandling/brokenXml.smil',
	nonExisting: 'http://localhost:3000/none',
	videoStreams: 'http://localhost:3000/playback/videoStreams.smil',
	notExistingMedia: 'http://localhost:3000/errorHandling/NotExistingMedia.smil',
	widgetExtensions: 'http://localhost:3000/layout/widgetExtensions.smil',
	cssBottom: 'http://localhost:3000/layout/cssBottomAndRight.smil',
	conditionalTimePriority: 'http://localhost:3000/dynamic/conditionalTimePriority.smil',
	triggersWidget: 'http://localhost:3000/triggers/triggersWidget.smil',
	triggersStop: 'http://localhost:3000/triggers/triggersStop.smil',
	testing: 'http://localhost:3000/playback/testing.smil',
	crossfadeTransition: 'http://localhost:3000/transitions/simpleCrossfade.smil',
	billboardTransition: 'http://localhost:3000/transitions/simpleBillboard.smil',
	playModeOne: 'http://localhost:3000/playback/playModeOne.smil',
	queryStringMedia: 'http://localhost:3000/playback/queryStringMedia.smil',
	triggersMouseDuration: 'http://localhost:3000/triggers/triggersMouseDuration.smil',
	triggersCrossCancel: 'http://localhost:3000/triggers/triggersCrossCancel.smil',
};

export const TestServer = {
	port: 3000,
};
