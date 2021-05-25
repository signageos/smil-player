import { doesNotExist, testCoordinates } from '../../tools/tools';
import { CypressTimeouts, SMILUrls } from '../../enums/enums';

describe("relativeFilePaths.smil test", () => {
	it("processes smil file correctly", () => {
		cy.visit("/");
		cy.frameLoaded('iframe');
		cy.iframe().find('#SMILUrl').clear().type(SMILUrls.relativeFilePaths);
		cy.wait(CypressTimeouts.submitTimeout);
		cy.iframe().find('#SMILUrlWrapper').submit();
		cy.get('video[src*="videos/loader_a667ec98.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		testCoordinates(cy.get('video[src*="videos/loader_a667ec98.mp4"]'), 0, 0, 1920, 1080);
		cy.get('video[src*="videos/landscape1_86c12946.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		testCoordinates(cy.get('video[src*="videos/landscape1_86c12946.mp4"]'), 270, 480, 960, 540);
		// doesNotExist(cy.get('body'), 'video[src*="videos/loader_a667ec98.mp4"]');
		cy.wait(CypressTimeouts.videoTransitionTimeout);
		cy.wait(CypressTimeouts.videoTransitionTimeout);
		cy.wait(CypressTimeouts.videoTransitionTimeout);

		cy.get('video[src*="videos/landscape1_86c12946.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		testCoordinates(cy.get('video[src*="videos/landscape1_86c12946.mp4"]'), 270, 480, 960, 540);

	});
});
