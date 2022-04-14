import { testCoordinates } from '../../tools/tools';
import { CypressTimeouts, SMILUrls } from '../../enums/enums';

describe('videoStreams.smil test', () => {
	it('processes smil file correctly', () => {
		cy.visit('/');
		cy.frameLoaded('iframe');
		cy.iframe().find('#SMILUrl').clear().type(SMILUrls.videoStreams);
		cy.wait(CypressTimeouts.submitTimeout);
		cy.iframe().find('#SMILUrlWrapper').submit();
		cy.get('video[src*="videos/loader_fe864e57.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should(
			'be.visible',
		);
		testCoordinates(cy.get('video[src*="videos/loader_fe864e57.mp4"]'), 0, 0, 1920, 1080);
		//https://www.rmp-streaming.com/media/bbb-360p.mp4
		//filesystem:http://192.168.0.94:8090/persistent/smil/videos/video-test_54188510.mp4
		cy.get('video[src*="videos/loader_fe864e57.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should(
			'not.be.visible',
		);
		cy.iframe()
			.find('img[id*="landscape1_7a8cff48.jpg-top-right-img1"]', { timeout: CypressTimeouts.elementAwaitTimeout })
			.should('be.visible');
		testCoordinates(cy.iframe().find('img[id*="landscape1_7a8cff48.jpg-top-right-img1"]'), 0, 960, 960, 540);

		cy.iframe()
			.find('img[id*="landscape1_7a8cff48.jpg-top-right-img1"]', { timeout: CypressTimeouts.elementAwaitTimeout })
			.should('not.be.visible');
		cy.get('video[src*="videos/video-test_54188510.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should(
			'be.visible',
		);
		testCoordinates(cy.get('video[src*="videos/video-test_54188510.mp4"]'), 0, 960, 960, 540);

		cy.get('video[src*="videos/video-test_54188510.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should(
			'not.be.visible',
		);
		cy.get('video[src*="https://www.rmp-streaming.com/media/bbb-360p.mp4"]', {
			timeout: CypressTimeouts.elementAwaitTimeout,
		}).should('be.visible');
		testCoordinates(cy.get('video[src*="https://www.rmp-streaming.com/media/bbb-360p.mp4"]'), 0, 960, 960, 540);

		cy.get('video[src*="https://www.rmp-streaming.com/media/bbb-360p.mp4"]', {
			timeout: CypressTimeouts.elementAwaitTimeout,
		}).should('not.be.visible');
		cy.iframe()
			.find('img[id*="landscape1_7a8cff48.jpg-top-right-img1"]', { timeout: CypressTimeouts.elementAwaitTimeout })
			.should('be.visible');
		testCoordinates(cy.iframe().find('img[id*="landscape1_7a8cff48.jpg-top-right-img1"]'), 0, 960, 960, 540);
	});
});
