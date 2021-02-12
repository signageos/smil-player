import { testInvisible, testCoordinates } from '../../tools/tools';
import { CypressTimeouts, SMILUrls } from '../../enums/enums';

describe("wallclockNoActiveSeq.smil test", () => {
	it("processes smil file correctly", () => {
		cy.visit("/");
		cy.frameLoaded('iframe');
		cy.iframe().find('#SMILUrl').clear().type(SMILUrls.noActiveSeq);
		cy.wait(CypressTimeouts.submitTimeout);
		cy.iframe().find('#SMILUrlWrapper').submit();
		cy.get('video[src*="videos/loader.mp4"]', { timeout: CypressTimeouts.elementAwaitTimeout }).should('be.visible');
		testCoordinates(cy.get('video[src*="videos/loader.mp4"]'), 0, 0, 1920, 1080);
		cy.wait(CypressTimeouts.videoTransitionTimeout);
		testInvisible(cy.get('video[src*="videos/loader.mp4"]'));

	});
});
