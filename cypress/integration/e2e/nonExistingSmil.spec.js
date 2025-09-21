"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tools_1 = require("../../tools/tools");
const enums_1 = require("../../enums/enums");
describe('nonExistingSmil.smil test', () => {
    it('processes smil file correctly', () => {
        cy.visit('/');
        cy.frameLoaded('iframe');
        cy.iframe().find('#SMILUrl').clear().type(enums_1.SMILUrls.nonExisting);
        cy.wait(enums_1.CypressTimeouts.submitTimeout);
        cy.iframe().find('#SMILUrlWrapper').submit();
        cy.iframe()
            .find('img[id*="63f74b87df.jpg-rootLayout-img"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout })
            .should('be.visible');
        tools_1.testCoordinates(cy.iframe().find('img[id*="63f74b87df.jpg-rootLayout-img"]'), 0, 0, 1920, 1080);
        cy.wait(enums_1.CypressTimeouts.videoTransitionTimeout);
        cy.iframe()
            .find('img[id*="63f74b87df.jpg-rootLayout-img"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout })
            .should('be.visible');
        tools_1.testCoordinates(cy.iframe().find('img[id*="63f74b87df.jpg-rootLayout-img"]'), 0, 0, 1920, 1080);
    });
});
