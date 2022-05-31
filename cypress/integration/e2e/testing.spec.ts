import { testCoordinates } from '../../tools/tools';
import { CypressTimeouts, SMILUrls } from '../../enums/enums';

describe('wallclockNoActiveSeq.smil test', () => {
	it('processes smil file correctly', () => {
		cy.visit('/');
		cy.frameLoaded('iframe');
		cy.iframe().find('#SMILUrl').clear().type('http://localhost:3000/testing.smil');
		cy.wait(CypressTimeouts.submitTimeout);
		cy.iframe().find('#SMILUrlWrapper').submit();
	});
});
