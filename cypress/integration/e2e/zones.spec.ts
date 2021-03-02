import { testCoordinates, doesNotExist } from '../../tools/tools';
import { CypressTimeouts, SMILUrls } from '../../enums/enums';

describe("zonesCypress.smil test", () => {
	it("processes smil file correctly", () => {
		cy.visit("/");
		cy.frameLoaded('iframe');
		cy.iframe().find('#SMILUrl').clear().type(SMILUrls.zones);
		cy.wait(CypressTimeouts.submitTimeout);
		cy.iframe().find('#SMILUrlWrapper').submit();
		cy.get('video[src*="videos/loader.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		testCoordinates(cy.get('video[src*="videos/loader.mp4"]'), 0, 0, 1920, 1080);
		cy.iframe().find('img[src*="images/widget_image_1.png"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		cy.iframe().find('iframe[src*="widgets/extracted/bottomWidget.wgt"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		cy.iframe().find('img[src*="images/widget_image_2.png"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		cy.get('video[src*="videos/video-test-1_e07fc21a7a72e3d33478243bd75d7743.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');

		doesNotExist(cy.get('body'), 'video[src*="videos/loader.mp4"]');

		testCoordinates(cy.iframe().find('img[src*="images/widget_image_1.png"]'), 0, 1280, 640, 506);
		// top is specified as bottom=0 in smil
		testCoordinates(cy.iframe().find('iframe[src*="widgets/extracted/bottomWidget.wgt"]'), 1080 - 360, 0, 1280, 360);
		testCoordinates(cy.iframe().find('img[src*="images/widget_image_2.png"]'), 506, 1280, 640, 574);
		testCoordinates(cy.get('video[src*="videos/video-test-1_e07fc21a7a72e3d33478243bd75d7743.mp4"]'), 0, 0, 1280, 720);

		cy.get('video[src*="videos/video-test-1_e07fc21a7a72e3d33478243bd75d7743.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('not.be.visible');
		cy.get('video[src*="videos/video-test-2_e2ffa51f6a4473b815f39e7fb39239da.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		testCoordinates(cy.get('video[src*="videos/video-test-2_e2ffa51f6a4473b815f39e7fb39239da.mp4"]'), 0, 0, 1280, 720);

		cy.get('video[src*="videos/video-test-2_e2ffa51f6a4473b815f39e7fb39239da.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('not.be.visible');
		cy.iframe().find('img[src*="images/img_1.jpg"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');

		testCoordinates(cy.iframe().find('img[src*="images/img_1.jpg"]'), 0, 0, 1280, 720);

		cy.iframe().find('img[src*="images/img_1.jpg"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('not.be.visible');
		cy.iframe().find('img[src*="images/img_2.jpg"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		testCoordinates(cy.iframe().find('img[src*="images/img_2.jpg"]'), 0, 0, 1280, 720);

		cy.get('video[src*="videos/video-test-1_e07fc21a7a72e3d33478243bd75d7743.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		testCoordinates(cy.get('video[src*="videos/video-test-1_e07fc21a7a72e3d33478243bd75d7743.mp4"]'), 0, 0, 1280, 720);
		testCoordinates(cy.iframe().find('img[src*="images/widget_image_1.png"]'), 0, 1280, 640, 506);
		// top is specified as bottom=0 in smil
		testCoordinates(cy.iframe().find('iframe[src*="widgets/extracted/bottomWidget.wgt"]'), 1080 - 360, 0, 1280, 360);
		testCoordinates(cy.iframe().find('img[src*="images/widget_image_2.png"]'), 506, 1280, 640, 574);
		cy.iframe().find('img[src*="images/widget_image_1.png"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		cy.iframe().find('iframe[src*="widgets/extracted/bottomWidget.wgt"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		cy.iframe().find('img[src*="images/widget_image_2.png"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
	});
});
