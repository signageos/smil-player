export const DUID = '218603c29e5e7275a238c43a1422a9b19188752893c12c5128';

export const Timeouts = {
	firstElement: 90000, // webpack compile + asset download on first load
	elementAwait: 13000, // standard element visibility wait
	longerElementAwait: 15000,
	transition: 1000,
	videoTransition: 5300,
};

export const SMILUrls = {
	zones: 'http://localhost:3000/zonesCypress.smil',
	noActiveSeq: 'http://localhost:3000/wallclockNoActiveSeq.smil',
	noActivePar: 'http://localhost:3000/wallclockNoActivePar.smil',
	wallclockFixedSeqWebsite: 'http://localhost:3000/wallclockFixedSeqWebsite.smil',
	wallclockFixedParWebsite: 'http://localhost:3000/wallclockFixedParWebsite.smil',
	wallclockConditionalSeq: 'http://localhost:3000/wallclockConditionalSeq.smil',
	wallclockConditionalPar: 'http://localhost:3000/wallclockConditionalPar.smil',
	repeatCountNoIntro: 'http://localhost:3000/repeatCountNoIntro.smil',
	repeatCountIntroVideo: 'http://localhost:3000/repeatCountIntroVideo.smil',
	repeatCountIntroImage: 'http://localhost:3000/repeatCountIntroImage.smil',
	conditionalMediaElement: 'http://localhost:3000/conditionalMediaElement.smil',
	introFirstVideoSame: 'http://localhost:3000/introFirstVideoSame.smil',
	relativeFilePaths: 'http://localhost:3000/relativeFilePaths.smil',
	priorityStop: 'http://localhost:3000/dynamic/priorityStop.smil',
	priorityPause: 'http://localhost:3000/dynamic/priorityPause.smil',
	priorityDefer: 'http://localhost:3000/dynamic/priorityDefer.smil',
	wallclockFuture: 'http://localhost:3000/dynamic/wallclockFuture.smil',
	correctOrder: 'http://localhost:3000/correctOrder.smil',
	noAdditionalPar: 'http://localhost:3000/noAdditionalPar.smil',
	noAdditionalSeq: 'http://localhost:3000/noAdditionalSeq.smil',
	wallclockRepeatCount: 'http://localhost:3000/wallclockRepeatCount.smil',
	triggersKeyboard: 'http://localhost:3000/triggersKeyboard.smil',
	triggersMouse: 'http://localhost:3000/triggersMouse.smil',
	brokenXml: 'http://localhost:3000/brokenXml.smil',
	nonExisting: 'http://localhost:3000/none',
	videoStreams: 'http://localhost:3000/videoStreams.smil',
	notExistingMedia: 'http://localhost:3000/NotExistingMedia.smil',
	widgetExtensions: 'http://localhost:3000/widgetExtensions.smil',
	cssBottom: 'http://localhost:3000/cssBottomAndRight.smil',
	conditionalTimePriority: 'http://localhost:3000/dynamic/conditionalTimePriority.smil',
	testing: 'http://localhost:3000/testing.smil',
};

export const TestServer = {
	port: 3000,
};
