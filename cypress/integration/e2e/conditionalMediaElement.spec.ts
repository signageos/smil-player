import { doesNotExist, testCoordinates, expectCoordinates } from '../../tools/tools';
import { CypressTimeouts, SMILUrls } from '../../enums/enums';

describe("conditionalMediaElement.smil test", () => {
	const video1Coords = [[0, 0, 960, 540], [540, 960, 960, 540]];
	const video2Coords = [[540, 0, 960, 540], [540, 960, 960, 540]];
	it("processes smil file correctly", () => {
		cy.visit("/");
		cy.frameLoaded('iframe');
		cy.iframe().find('#SMILUrl').clear().type(SMILUrls.conditionalMediaElement);
		cy.wait(CypressTimeouts.submitTimeout);
		cy.iframe().find('#SMILUrlWrapper').submit();
		cy.get('video[src*="videos/loader.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		testCoordinates(cy.get('video[src*="videos/loader.mp4"]'), 0, 0, 1920, 1080);

		cy.get('video[src*="videos/video-test-1_e07fc21a7a72e3d33478243bd75d7743.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		cy.get('video[src*="videos/video-test-2_e2ffa51f6a4473b815f39e7fb39239da.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		cy.iframe().find('img[src*="images/landscape1.jpg"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		doesNotExist(cy.get('body'), 'video[src*="videos/loader.mp4"]');

		cy.get('video[src*="videos/video-test-2_e2ffa51f6a4473b815f39e7fb39239da.mp4"]').each(($element, index) => {
			const coords = $element[0].getBoundingClientRect();
			// @ts-ignore
			expectCoordinates(coords, ...video2Coords[index]);
		});
		testCoordinates(cy.get('video[src*="videos/video-test-1_e07fc21a7a72e3d33478243bd75d7743.mp4"]'), 0, 0, 960, 540);
		testCoordinates(cy.iframe().find('img[src*="images/landscape1.jpg"]'), 0, 960, 960, 540);

		cy.iframe().find('img[src*="images/landscape1.jpg"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		cy.iframe().find('img[src*="images/landscape2.jpg"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		cy.get('video[src*="videos/video-test-1_e07fc21a7a72e3d33478243bd75d7743.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		cy.get('video[src*="videos/video-test-2_e2ffa51f6a4473b815f39e7fb39239da.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('not.be.visible');

		testCoordinates(cy.iframe().find('img[src*="images/landscape1.jpg"]'), 0, 960, 960, 540);
		testCoordinates(cy.iframe().find('img[src*="images/landscape2.jpg"]'), 540, 0, 960, 540);
		cy.get('video[src*="videos/video-test-1_e07fc21a7a72e3d33478243bd75d7743.mp4"]').each(($element, index) => {
			const coords = $element[0].getBoundingClientRect();
			// @ts-ignore
			expectCoordinates(coords, ...video1Coords[index]);
		});

		cy.iframe().find('img[src*="images/landscape1.jpg"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		cy.iframe().find('img[src*="images/landscape2.jpg"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('not.be.visible');
		cy.get('video[src*="videos/video-test-1_e07fc21a7a72e3d33478243bd75d7743.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');

		testCoordinates(cy.get('video[src*="videos/video-test-1_e07fc21a7a72e3d33478243bd75d7743.mp4"]'), 0, 0, 960, 540);
		testCoordinates(cy.iframe().find('img[id*="landscape1.jpg-top-right"]'), 0, 960, 960, 540);
		testCoordinates(cy.iframe().find('img[id*="landscape1.jpg-bottom-left"]'), 540, 0, 960, 540);
		testCoordinates(cy.iframe().find('img[id*="landscape1.jpg-bottom-right"]'), 540, 960, 960, 540);

		cy.iframe().find('img[src*="images/landscape1.jpg"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		cy.iframe().find('img[src*="images/landscape2.jpg"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('not.be.visible');
		cy.get('video[src*="videos/video-test-1_e07fc21a7a72e3d33478243bd75d7743.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		cy.get('video[src*="videos/video-test-2_e2ffa51f6a4473b815f39e7fb39239da.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');

		cy.wait(CypressTimeouts.transitionTimeout);
		cy.get('video[src*="videos/video-test-2_e2ffa51f6a4473b815f39e7fb39239da.mp4"]').each(($element, index) => {
			const coords = $element[0].getBoundingClientRect();
			// reverse order because one of playlists is shorted and "second" video appears first at second iteration of smil
			const correctIndex = video2Coords.length - 1 - index;
			// @ts-ignore
			expectCoordinates(coords, ...video2Coords[correctIndex]);
		});
		testCoordinates(cy.get('video[src*="videos/video-test-1_e07fc21a7a72e3d33478243bd75d7743.mp4"]'), 0, 0, 960, 540);
		testCoordinates(cy.iframe().find('img[src*="images/landscape1.jpg"]'), 0, 960, 960, 540);

	});
});
