import { doesNotExist, testCoordinates, expectCoordinates } from '../../tools/tools';
import { CypressTimeouts, SMILUrls } from '../../enums/enums';

describe('conditionalMediaElement.smil test', () => {
	const video1Coords = [
		[540, 960, 960, 540],
		[0, 0, 960, 540],
	];
	const video2Coords = [
		[540, 0, 960, 540],
		[540, 960, 960, 540],
	];
	it('processes smil file correctly', () => {
		cy.visit('/');
		cy.frameLoaded('iframe');
		cy.iframe().find('#SMILUrl').clear().type(SMILUrls.conditionalMediaElement);
		cy.wait(CypressTimeouts.submitTimeout);
		cy.iframe().find('#SMILUrlWrapper').submit();
		cy.get('video[src*="videos/loader_fe864e57.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should(
			'be.visible',
		);
		testCoordinates(cy.get('video[src*="videos/loader_fe864e57.mp4"]'), 0, 0, 1920, 1080);

		cy.get('video[src*="videos/video-test_17354648.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should(
			'be.visible',
		);
		cy.get('video[src*="videos/video-test_54188510.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should(
			'be.visible',
		);
		cy.iframe()
			.find('img[src*="images/landscape1_68241f63.jpg"]', { timeout: CypressTimeouts.elementAwaitTimeout })
			.should('be.visible');
		// doesNotExist(cy.get('body'), 'video[src*="videos/loader_fe864e57.mp4"]');

		cy.get('video[src*="videos/video-test_54188510.mp4"]').each(($element, index) => {
			const coords = $element[0].getBoundingClientRect();
			// @ts-ignore
			expectCoordinates(coords, ...video2Coords[index]);
		});
		testCoordinates(cy.get('video[src*="videos/video-test_17354648.mp4"]'), 0, 0, 960, 540);
		testCoordinates(cy.iframe().find('img[src*="images/landscape1_68241f63.jpg"]'), 0, 960, 960, 540);

		cy.iframe()
			.find('img[src*="images/landscape1_68241f63.jpg"]', { timeout: CypressTimeouts.elementAwaitTimeout })
			.should('be.visible');
		cy.iframe()
			.find('img[src*="images/landscape2_9a769e36.jpg"]', { timeout: CypressTimeouts.elementAwaitTimeout })
			.should('be.visible');
		cy.get('video[src*="videos/video-test_17354648.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should(
			'be.visible',
		);
		cy.get('video[src*="videos/video-test_54188510.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should(
			'not.be.visible',
		);

		testCoordinates(cy.iframe().find('img[src*="images/landscape1_68241f63.jpg"]'), 0, 960, 960, 540);
		testCoordinates(cy.iframe().find('img[src*="images/landscape2_9a769e36.jpg"]'), 540, 0, 960, 540);
		cy.get('video[src*="videos/video-test_17354648.mp4"]').each(($element, index) => {
			const coords = $element[0].getBoundingClientRect();
			// @ts-ignore
			expectCoordinates(coords, ...video1Coords[index]);
		});

		cy.iframe()
			.find('img[src*="images/landscape1_68241f63.jpg"]', { timeout: CypressTimeouts.elementAwaitTimeout })
			.should('be.visible');
		cy.iframe()
			.find('img[src*="images/landscape2_9a769e36.jpg"]', { timeout: CypressTimeouts.elementAwaitTimeout })
			.should('not.be.visible');
		cy.get('video[src*="videos/video-test_17354648.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should(
			'be.visible',
		);

		testCoordinates(cy.get('video[src*="videos/video-test_17354648.mp4"]').last(), 0, 0, 960, 540);
		testCoordinates(cy.iframe().find('img[id*="landscape1_7a8cff48.jpg-top-right-img4"]'), 0, 960, 960, 540);
		testCoordinates(cy.iframe().find('img[id*="landscape1_7a8cff48.jpg-bottom-left-img8"]'), 540, 0, 960, 540);
		testCoordinates(cy.iframe().find('img[id*="landscape1_7a8cff48.jpg-bottom-right-img12"]'), 540, 960, 960, 540);

		cy.iframe()
			.find('img[src*="images/landscape1_68241f63.jpg"]', { timeout: CypressTimeouts.elementAwaitTimeout })
			.should('be.visible');
		cy.iframe()
			.find('img[src*="images/landscape2_9a769e36.jpg"]', { timeout: CypressTimeouts.elementAwaitTimeout })
			.should('not.be.visible');
		cy.get('video[src*="videos/video-test_17354648.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should(
			'be.visible',
		);
		cy.get('video[src*="videos/video-test_54188510.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should(
			'be.visible',
		);

		cy.wait(CypressTimeouts.transitionTimeout);
		cy.get('video[src*="videos/video-test_54188510.mp4"]').each(($element, index) => {
			const coords = $element[0].getBoundingClientRect();
			// reverse order because one of playlists is shorted and "second" video appears first at second iteration of smil
			const correctIndex = video2Coords.length - 1 - index;
			// @ts-ignore
			expectCoordinates(coords, ...video2Coords[correctIndex]);
		});
		testCoordinates(cy.get('video[src*="videos/video-test_17354648.mp4"]').last(), 0, 0, 960, 540);
		testCoordinates(cy.iframe().find('img[id*="landscape1_7a8cff48.jpg-top-right-img4"]'), 0, 960, 960, 540);
	});
});
