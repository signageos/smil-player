import { testCoordinates } from '../../tools/tools';
import { CypressTimeouts, SMILUrls } from '../../enums/enums';

describe('widgetExtensions.smil test', () => {
	it('processes smil file correctly', () => {
		cy.visit('/');
		cy.frameLoaded('iframe');
		cy.iframe().find('#SMILUrl').clear().type(SMILUrls.widgetExtensions);
		cy.wait(CypressTimeouts.submitTimeout);
		cy.iframe().find('#SMILUrlWrapper').submit();

		cy.iframe()
			.find('iframe[id*="index_f86c9931.html-top-right-ref1"]', { timeout: CypressTimeouts.elementAwaitTimeout })
			.should('be.visible');
		cy.iframe()
			.find('iframe[id*="index_5922c6df.html-top-left-ref2"]', { timeout: CypressTimeouts.elementAwaitTimeout })
			.should('be.visible');
		cy.iframe()
			.find('iframe[id*="index_01d0e4ae.html-bottom-right-ref3"]', {
				timeout: CypressTimeouts.elementAwaitTimeout,
			})
			.should('be.visible');
		cy.iframe()
			.find('iframe[id*="index_c60fe849.html-bottom-left-ref4"]', {
				timeout: CypressTimeouts.elementAwaitTimeout,
			})
			.should('be.visible');

		testCoordinates(cy.iframe().find('iframe[id*="index_f86c9931.html-top-right-ref1"]'), 0, 960, 960, 540);
		testCoordinates(cy.iframe().find('iframe[id*="index_5922c6df.html-top-left-ref2"]'), 0, 0, 960, 540);
		testCoordinates(cy.iframe().find('iframe[id*="index_01d0e4ae.html-bottom-right-ref3"]'), 540, 960, 960, 540);
		testCoordinates(cy.iframe().find('iframe[id*="index_c60fe849.html-bottom-left-ref4"]'), 540, 0, 960, 540);
	});
});
