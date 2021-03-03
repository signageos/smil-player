import { testCoordinates, doesNotExist } from '../../tools/tools';
import { CypressTimeouts, SMILUrls } from '../../enums/enums';

describe("wallclockNoActivePar.smil test", () => {
	it("processes smil file correctly", () => {
		cy.visit("/");
		cy.frameLoaded('iframe');
		cy.iframe().find('#SMILUrl').clear().type(SMILUrls.wallclockFuture);
		cy.wait(CypressTimeouts.submitTimeout);
		cy.iframe().find('#SMILUrlWrapper').submit();
		cy.get('video[src*="videos/loader.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		testCoordinates(cy.get('video[src*="videos/loader.mp4"]'), 0, 0, 1920, 1080);
		cy.wait(CypressTimeouts.videoTransitionTimeout);
		cy.get('video[src*="videos/loader.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('not.be.visible');
		doesNotExist(cy.get('body'), 'video[src*="videos/video-test-1_e07fc21a7a72e3d33478243bd75d7743.mp4"]');

		cy.wait(CypressTimeouts.videoTransitionTimeout);
		cy.wait(CypressTimeouts.videoTransitionTimeout);

		cy.get('video[src*="videos/video-test-1_e07fc21a7a72e3d33478243bd75d7743.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		testCoordinates(cy.get('video[src*="videos/video-test-1_e07fc21a7a72e3d33478243bd75d7743.mp4"]'), 0, 0, 1280, 720);

		cy.get('video[src*="videos/video-test-1_e07fc21a7a72e3d33478243bd75d7743.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('not.be.visible');
		cy.iframe().find('img[src*="images/img_1.jpg"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		testCoordinates(cy.iframe().find('img[src*="images/img_1.jpg"]'), 0, 0, 1280, 720);

	});
});
