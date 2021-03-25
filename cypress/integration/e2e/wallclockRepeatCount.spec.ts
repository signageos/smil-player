import { doesNotExist, testCoordinates } from '../../tools/tools';
import { CypressTimeouts, SMILUrls } from '../../enums/enums';

describe("wallclockNoActiveSeq.smil test", () => {
	it("processes smil file correctly", () => {
		cy.visit("/");
		cy.frameLoaded('iframe');
		cy.iframe().find('#SMILUrl').clear().type(SMILUrls.wallclockRepeatCount);
		cy.wait(CypressTimeouts.submitTimeout);
		cy.iframe().find('#SMILUrlWrapper').submit();
		cy.get('video[src*="videos/loader.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		testCoordinates(cy.get('video[src*="videos/loader.mp4"]'), 0, 0, 1920, 1080);

		cy.get('video[src*="videos/video-test-1_e07fc21a7a72e3d33478243bd75d7743.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		cy.get('video[src*="videos/video-test-2_e2ffa51f6a4473b815f39e7fb39239da.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		cy.iframe().find('img[src*="images/landscape1.jpg"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		doesNotExist(cy.get('body'), 'video[src*="videos/loader.mp4"]');

		testCoordinates(cy.get('video[src*="videos/video-test-1_e07fc21a7a72e3d33478243bd75d7743.mp4"]'), 0, 0, 960, 540);
		testCoordinates(cy.get('video[src*="videos/video-test-2_e2ffa51f6a4473b815f39e7fb39239da.mp4"]'), 540, 960, 960, 540);
		testCoordinates(cy.iframe().find('img[src*="images/landscape1.jpg"]'), 0, 960, 960, 540);

		cy.wait(CypressTimeouts.transitionTimeout);

		cy.get('video[src*="videos/video-test-1_e07fc21a7a72e3d33478243bd75d7743.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		cy.get('video[src*="videos/video-test-2_e2ffa51f6a4473b815f39e7fb39239da.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		cy.iframe().find('img[src*="images/landscape1.jpg"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');

		testCoordinates(cy.get('video[src*="videos/video-test-1_e07fc21a7a72e3d33478243bd75d7743.mp4"]'), 0, 0, 960, 540);
		testCoordinates(cy.get('video[src*="videos/video-test-2_e2ffa51f6a4473b815f39e7fb39239da.mp4"]'), 540, 960, 960, 540);
		testCoordinates(cy.iframe().find('img[src*="images/landscape1.jpg"]'), 0, 960, 960, 540);
	});
});
