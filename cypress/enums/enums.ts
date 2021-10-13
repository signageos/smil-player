export enum CypressTimeouts {
	submitTimeout = 500,
	transitionTimeout = 1000,
	// duration of media in tests, in 5 seconds one media will finish and will be replaced by another
	videoTransitionTimeout = 5300,
	imageTransitionTimeout = 3300,
	elementAwaitTimeout = 13000,
	longerElementAwaitTimeout = 15000,
}

export enum TestServer {
	port = 3000,
	assetsPath = 'cypress/testFiles/assets',
	dynamicTestFilesPath = 'cypress/testFiles/dynamic',
	testFilesPath = 'cypress/testFiles',
}

export enum SMILUrls {
	zones = 'http://localhost:3000/zonesCypress.smil',
	noActiveSeq = 'http://localhost:3000/wallclockNoActiveSeq.smil',
	noActivePar = 'http://localhost:3000/wallclockNoActivePar.smil',
	wallclockFixedSeqWebsite = 'http://localhost:3000/wallclockFixedSeqWebsite.smil',
	wallclockFixedParWebsite = 'http://localhost:3000/wallclockFixedParWebsite.smil',
	wallclockConditionalSeq = 'http://localhost:3000/wallclockConditionalSeq.smil',
	wallclockConditionalPar = 'http://localhost:3000/wallclockConditionalPar.smil',
	repeatCountNoIntro = ' http://localhost:3000/repeatCountNoIntro.smil',
	repeatCountIntroVideo = 'http://localhost:3000/repeatCountIntroVideo.smil',
	repeatCountIntroImage = 'http://localhost:3000/repeatCountIntroImage.smil',
	conditionalMediaElement = 'http://localhost:3000/conditionalMediaElement.smil',
	introFirstVideoSame = 'http://localhost:3000/introFirstVideoSame.smil',
	relativeFilePaths = 'http://localhost:3000/relativeFilePaths.smil',
	priorityStop = 'http://localhost:3000/dynamic/priorityStop.smil',
	priorityPause = 'http://localhost:3000/dynamic/priorityPause.smil',
	priorityDefer = 'http://localhost:3000/dynamic/priorityDefer.smil',
	wallclockFuture = 'http://localhost:3000/dynamic/wallclockFuture.smil',
	correctOrder = 'http://localhost:3000/correctOrder.smil',
	noAdditionalPar = 'http://localhost:3000/noAdditionalPar.smil',
	noAdditionalSeq = 'http://localhost:3000/noAdditionalSeq.smil',
	wallclockRepeatCount = 'http://localhost:3000/wallclockRepeatCount.smil',
	triggersKeyboard = 'http://localhost:3000/triggersKeyboard.smil',
	triggersMouse = 'http://localhost:3000/triggersMouse.smil',
	brokenXml = 'http://localhost:3000/brokenXml.smil',
	nonExisting = 'http://localhost:3000/none',
	notExistingMedia = 'http://localhost:3000/NotExistingMedia.smil',
	widgetExtensions = 'http://localhost:3000/widgetExtensions.smil',
	cssBottom = 'http://localhost:3000/cssBottom.smil',
}
