import { testCoordinates, doesNotExist } from '../../tools/tools';
import { CypressTimeouts, SMILUrls } from '../../enums/enums';

describe('zonesCypress.smil test', () => {
	it('processes smil file correctly', () => {
		cy.visit('/');
		cy.frameLoaded('iframe');
		cy.iframe().find('#SMILUrl').clear().type(SMILUrls.zones);
		cy.wait(CypressTimeouts.submitTimeout);
		cy.iframe().find('#SMILUrlWrapper').submit();
		cy.get('video[src*="videos/loader_fe864e57.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should(
			'be.visible',
		);
		testCoordinates(cy.get('video[src*="videos/loader_fe864e57.mp4"]'), 0, 0, 1920, 1080);
		cy.iframe()
			.find('img[src*="images/widget_ima_011645d5.png"]', { timeout: CypressTimeouts.elementAwaitTimeout })
			.should('be.visible');
		cy.iframe()
			.find('iframe[src*="widgets/extracted/bottomWidg_f23be3fb.wgt"]', {
				timeout: CypressTimeouts.elementAwaitTimeout,
			})
			.should('be.visible');
		cy.iframe()
			.find('img[src*="images/widget_ima_db3167f1.png"]', { timeout: CypressTimeouts.elementAwaitTimeout })
			.should('be.visible');
		cy.get('video[src*="videos/video-test_17354648.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should(
			'be.visible',
		);

		// doesNotExist(cy.get('body'), 'video[src*="videos/loader_fe864e57.mp4"]');

		testCoordinates(cy.iframe().find('img[src*="images/widget_ima_011645d5.png"]'), 0, 1280, 640, 506);
		// top is specified as bottom=0 in smil
		testCoordinates(
			cy.iframe().find('iframe[src*="widgets/extracted/bottomWidg_f23be3fb.wgt"]'),
			1080 - 360,
			0,
			1280,
			360,
		);
		testCoordinates(cy.iframe().find('img[src*="images/widget_ima_db3167f1.png"]'), 506, 1280, 640, 574);
		testCoordinates(cy.get('video[src*="videos/video-test_17354648.mp4"]'), 0, 0, 1280, 720);

		cy.get('video[src*="videos/video-test_17354648.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should(
			'not.be.visible',
		);
		cy.get('video[src*="videos/video-test_54188510.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should(
			'be.visible',
		);
		testCoordinates(cy.get('video[src*="videos/video-test_54188510.mp4"]'), 0, 0, 1280, 720);

		cy.get('video[src*="videos/video-test_54188510.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should(
			'not.be.visible',
		);
		cy.iframe()
			.find('img[src*="images/img_1_64a752b2.jpg"]', { timeout: CypressTimeouts.elementAwaitTimeout })
			.should('be.visible');

		testCoordinates(cy.iframe().find('img[src*="images/img_1_64a752b2.jpg"]'), 0, 0, 1280, 720);

		cy.iframe()
			.find('img[src*="images/img_1_64a752b2.jpg"]', { timeout: CypressTimeouts.elementAwaitTimeout })
			.should('not.be.visible');
		cy.iframe()
			.find('img[src*="images/img_2_beb3502d.jpg"]', { timeout: CypressTimeouts.elementAwaitTimeout })
			.should('be.visible');
		testCoordinates(cy.iframe().find('img[src*="images/img_2_beb3502d.jpg"]'), 0, 0, 1280, 720);

		cy.get('video[src*="videos/video-test_17354648.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should(
			'be.visible',
		);
		testCoordinates(cy.get('video[src*="videos/video-test_17354648.mp4"]'), 0, 0, 1280, 720);
		testCoordinates(cy.iframe().find('img[src*="images/widget_ima_011645d5.png"]'), 0, 1280, 640, 506);
		// top is specified as bottom=0 in smil
		testCoordinates(
			cy.iframe().find('iframe[src*="widgets/extracted/bottomWidg_f23be3fb.wgt"]'),
			1080 - 360,
			0,
			1280,
			360,
		);
		testCoordinates(cy.iframe().find('img[src*="images/widget_ima_db3167f1.png"]'), 506, 1280, 640, 574);
		cy.iframe()
			.find('img[src*="images/widget_ima_011645d5.png"]', { timeout: CypressTimeouts.elementAwaitTimeout })
			.should('be.visible');
		cy.iframe()
			.find('iframe[src*="widgets/extracted/bottomWidg_f23be3fb.wgt"]', {
				timeout: CypressTimeouts.elementAwaitTimeout,
			})
			.should('be.visible');
		cy.iframe()
			.find('img[src*="images/widget_ima_db3167f1.png"]', { timeout: CypressTimeouts.elementAwaitTimeout })
			.should('be.visible');
	});
});
