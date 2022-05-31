import { doesNotExist, testCoordinates } from '../../tools/tools';
import { CypressTimeouts, SMILUrls } from '../../enums/enums';

describe('wallclockFixedParWebsite.smil test', () => {
	it('processes smil file correctly', () => {
		cy.visit('/');
		cy.frameLoaded('iframe');
		cy.iframe().find('#SMILUrl').clear().type(SMILUrls.wallclockFixedParWebsite);
		cy.wait(CypressTimeouts.submitTimeout);
		cy.iframe().find('#SMILUrlWrapper').submit();
		cy.get('video[src*="videos/loader_fe864e57.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should(
			'be.visible',
		);
		testCoordinates(cy.get('video[src*="videos/loader_fe864e57.mp4"]'), 0, 0, 1920, 1080);
		cy.iframe()
			.find('iframe[src*="https://www.signageos.io"]', { timeout: CypressTimeouts.elementAwaitTimeout })
			.should('be.visible');
		cy.get('video[src*="videos/video-test_17354648.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should(
			'be.visible',
		);
		// doesNotExist(cy.get('body'), 'video[src*="videos/loader_fe864e57.mp4"]');

		testCoordinates(cy.get('video[src*="videos/video-test_17354648.mp4"]'), 0, 0, 960, 540);
		doesNotExist(cy.get('body'), 'video[src*="videos/video-test_54188510.mp4"]');

		cy.get('video[src*="videos/video-test_17354648.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should(
			'not.be.visible',
		);
		cy.iframe()
			.find('img[src*="images/landscape1_68241f63.jpg"]', { timeout: CypressTimeouts.elementAwaitTimeout })
			.should('be.visible');
		testCoordinates(cy.iframe().find('img[src*="images/landscape1_68241f63.jpg"]'), 0, 0, 960, 540);
		doesNotExist(cy.iframe(), 'img[src*="images/landscape2_9a769e36.jpg"]');

		cy.get('video[src*="videos/video-test_17354648.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should(
			'be.visible',
		);
		cy.iframe()
			.find('img[src*="images/landscape1_68241f63.jpg"]', { timeout: CypressTimeouts.elementAwaitTimeout })
			.should('not.be.visible');
		testCoordinates(cy.get('video[src*="videos/video-test_17354648.mp4"]'), 0, 0, 960, 540);
		doesNotExist(cy.get('body'), 'video[src*="videos/video-test_54188510.mp4"]');
		cy.iframe()
			.find('iframe[src*="https://www.signageos.io"]', { timeout: CypressTimeouts.elementAwaitTimeout })
			.should('be.visible');
	});
});
