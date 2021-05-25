import { doesNotExist, testCoordinates } from '../../tools/tools';
import { CypressTimeouts, SMILUrls } from '../../enums/enums';

describe("wallclockNoActiveSeq.smil test", () => {
	it("processes smil file correctly", () => {
		cy.visit("/");
		cy.frameLoaded('iframe');
		cy.iframe().find('#SMILUrl').clear().type(SMILUrls.wallclockRepeatCount);
		cy.wait(CypressTimeouts.submitTimeout);
		cy.iframe().find('#SMILUrlWrapper').submit();
		cy.get('video[src*="videos/loader_fe864e57.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		testCoordinates(cy.get('video[src*="videos/loader_fe864e57.mp4"]'), 0, 0, 1920, 1080);

		cy.get('video[src*="videos/video-test_17354648.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		cy.get('video[src*="videos/video-test_54188510.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		cy.iframe().find('img[src*="images/landscape1_68241f63.jpg"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		// doesNotExist(cy.get('body'), 'video[src*="videos/loader_fe864e57.mp4"]');

		testCoordinates(cy.get('video[src*="videos/video-test_17354648.mp4"]'), 0, 0, 960, 540);
		testCoordinates(cy.get('video[src*="videos/video-test_54188510.mp4"]'), 540, 960, 960, 540);
		testCoordinates(cy.iframe().find('img[src*="images/landscape1_68241f63.jpg"]'), 0, 960, 960, 540);

		cy.wait(CypressTimeouts.transitionTimeout);

		cy.get('video[src*="videos/video-test_17354648.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		cy.get('video[src*="videos/video-test_54188510.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		cy.iframe().find('img[src*="images/landscape1_68241f63.jpg"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');

		testCoordinates(cy.get('video[src*="videos/video-test_17354648.mp4"]'), 0, 0, 960, 540);
		testCoordinates(cy.get('video[src*="videos/video-test_54188510.mp4"]'), 540, 960, 960, 540);
		testCoordinates(cy.iframe().find('img[src*="images/landscape1_68241f63.jpg"]'), 0, 960, 960, 540);
	});
});
