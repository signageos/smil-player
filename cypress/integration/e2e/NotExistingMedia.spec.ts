import { testCoordinates } from '../../tools/tools';
import { CypressTimeouts, SMILUrls } from '../../enums/enums';

describe("NonExistingMedia.smil test", () => {
	it("processes smil file correctly", () => {
		cy.visit("/");
		cy.frameLoaded('iframe');
		cy.iframe().find('#SMILUrl').clear().type(SMILUrls.notExistingMedia);
		cy.wait(CypressTimeouts.submitTimeout);
		cy.iframe().find('#SMILUrlWrapper').submit();
		cy.iframe().find('img[id*="landscape2_20622151.jpg-rootLayout"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		testCoordinates(cy.iframe().find('img[id*="landscape2_20622151.jpg-rootLayout"]'), 0, 0, 1920, 1080);

		cy.iframe().find('img[id*="img_1_64a7_d8cb3084.jpg-main-img2"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		testCoordinates(cy.iframe().find('img[id*="img_1_64a7_d8cb3084.jpg-main-img2"]'), 0, 0, 1920, 1080);

		cy.iframe().find('img[id*="img_1_64a7_d8cb3084.jpg-main-img2"]', { timeout: CypressTimeouts.elementAwaitTimeout })
			.should('not.be.visible');
		cy.get('video[src*="videos/video-test_54188510.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		testCoordinates(cy.get('video[src*="videos/video-test_54188510.mp4"]'), 0, 0, 1920, 1080);

		cy.get('video[src*="videos/video-test_54188510.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('not.be.visible');
		cy.iframe().find('img[id*="img_1_64a7_d8cb3084.jpg-main-img2"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		testCoordinates(cy.iframe().find('img[id*="img_1_64a7_d8cb3084.jpg-main-img2"]'), 0, 0, 1920, 1080);
	});
});
