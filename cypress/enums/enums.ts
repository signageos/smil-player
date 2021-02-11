export enum CypressTimeouts {
	submitTimeout = 500,
	// duration of media in tests, in 5 seconds one media will finish and will be replaced by another
	videoTransitionTimeout = 5300,
	imageTransitionTimeout = 3300,
	elementAwaitTimeout = 10000,
}

export enum SMILUrls {
	zones= 'https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/cypress-e2e/zonesCypress.smil',
	noActiveSeq= 'https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/cypress-e2e/wallclockNoActiveSeq.smil',
	noActivePar= 'https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/cypress-e2e/wallclockNoActivePar.smil',
	wallclockFixedSeqWebsite = 'https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/cypress-e2e/wallclockFixedSeqWebsite.smil',
	wallclockFixedParWebsite = 'https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/cypress-e2e/wallclockFixedParWebsite.smil',
	wallclockConditionalSeq = 'https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/cypress-e2e/wallclockConditionalSeq.smil',
	wallclockConditionalPar = 'https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/cypress-e2e/wallclockConditionalPar.smil',
	repeatCountNoIntro = 'https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/cypress-e2e/repeatCountNoIntro.smil',
	repeatCountIntroVideo = 'https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/cypress-e2e/repeatCountIntroVideo.smil',
	repeatCountIntroImage = 'https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/cypress-e2e/repeatCountIntroImage.smil',
	conditionalMediaElement = 'https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/cypress-e2e/conditionalMediaElement.smil',
	introFirstVideoSame = 'https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/cypress-e2e/introFirstVideoSame.smil',
	relativeFilePaths = 'https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/cypress-e2e/07-relative-file-paths.smil',
}
