import { testCoordinates } from '../../tools/tools';
import { CypressTimeouts, SMILUrls } from '../../enums/enums';

describe('brokenXml.smil test', () => {
	it('processes smil file correctly', () => {
		cy.visit('/');
		cy.frameLoaded('iframe');
		cy.iframe().find('#SMILUrl').clear().type(SMILUrls.brokenXml);
		cy.wait(CypressTimeouts.submitTimeout);
		cy.iframe().find('#SMILUrlWrapper').submit();

		cy.iframe()
			.find('img[id*="63f74b87df.jpg-rootLayout-img"]', { timeout: CypressTimeouts.elementAwaitTimeout })
			.should('be.visible');
		testCoordinates(cy.iframe().find('img[id*="63f74b87df.jpg-rootLayout-img"]'), 0, 0, 1920, 1080);

		cy.wait(CypressTimeouts.videoTransitionTimeout);

		cy.iframe()
			.find('img[id*="63f74b87df.jpg-rootLayout-img"]', { timeout: CypressTimeouts.elementAwaitTimeout })
			.should('be.visible');
		testCoordinates(cy.iframe().find('img[id*="63f74b87df.jpg-rootLayout-img"]'), 0, 0, 1920, 1080);
	});
});
