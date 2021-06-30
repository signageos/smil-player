import { testCoordinates } from '../../tools/tools';
import { CypressTimeouts, SMILUrls } from '../../enums/enums';

describe("triggersMouse.smil test", () => {
	it("processes smil file correctly", () => {
		cy.visit("/");
		cy.frameLoaded('iframe');
		cy.iframe().find('#SMILUrl').clear().type(SMILUrls.triggersMouse);
		cy.wait(CypressTimeouts.submitTimeout);
		cy.iframe().find('#SMILUrlWrapper').submit();

		cy.get('video[src*="videos/video-test_17354648.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		testCoordinates(cy.get('video[src*="videos/video-test_17354648.mp4"]'), 10, 10, 1280, 720);

		cy.wait(CypressTimeouts.transitionTimeout);
		cy.get('body').trigger('click', { eventConstructor: 'MouseEvent'});

		cy.get('video[src*="videos/video-test_54188510.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		testCoordinates(cy.get('video[src*="videos/video-test_54188510.mp4"]'), 10, 10, 640, 720);

		cy.get('video[src*="videos/video-test_54188510.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('not.be.visible');
		cy.iframe().find('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		testCoordinates(cy.iframe().find('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]'), 10, 10, 640, 720);

		cy.iframe().find('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('not.be.visible');
		cy.iframe().find('img[id*="img_2_beb3_e6b35b8b.jpg-video-img1"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		testCoordinates(cy.iframe().find('img[id*="img_2_beb3_e6b35b8b.jpg-video-img1"]'), 10, 10, 1280, 720);

		cy.wait(CypressTimeouts.transitionTimeout);

		cy.get('body').trigger('click', { eventConstructor: 'MouseEvent'});

		cy.get('video[src*="videos/video-test_54188510.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		testCoordinates(cy.get('video[src*="videos/video-test_54188510.mp4"]'), 10, 10, 640, 720);

		cy.get('body').trigger('click', { eventConstructor: 'MouseEvent'});

		cy.get('video[src*="videos/video-test_54188510.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('not.be.visible');
		cy.iframe().find('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		testCoordinates(cy.iframe().find('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]'), 10, 10, 640, 720);

		cy.get('body').trigger('click', { eventConstructor: 'MouseEvent'});

		cy.get('video[src*="videos/video-test_54188510.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		cy.iframe().find('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('not.be.visible');
		testCoordinates(cy.get('video[src*="videos/video-test_54188510.mp4"]'), 10, 10, 640, 720);

		cy.get('body').trigger('click', { eventConstructor: 'MouseEvent'});

		cy.get('video[src*="videos/video-test_54188510.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('not.be.visible');
		cy.iframe().find('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		testCoordinates(cy.iframe().find('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]'), 10, 10, 640, 720);

		cy.get('video[src*="videos/video-test_17354648.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		cy.iframe().find('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('not.be.visible');
		testCoordinates(cy.get('video[src*="videos/video-test_17354648.mp4"]'), 10, 10, 1280, 720);

		cy.get('video[src*="videos/video-test_17354648.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('not.be.visible');
		cy.iframe().find('img[id*="img_2_beb3_e6b35b8b.jpg-video-img1"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		testCoordinates(cy.iframe().find('img[id*="img_2_beb3_e6b35b8b.jpg-video-img1"]'), 10, 10, 1280, 720);
	});
});
