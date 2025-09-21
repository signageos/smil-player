"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const enums_1 = require("../../enums/enums");
describe('wallclockNoActiveSeq.smil test', () => {
    it('processes smil file correctly', () => {
        cy.visit('/');
        cy.frameLoaded('iframe');
        cy.iframe().find('#SMILUrl').clear().type('http://localhost:3000/testing.smil');
        cy.wait(enums_1.CypressTimeouts.submitTimeout);
        cy.iframe().find('#SMILUrlWrapper').submit();
    });
});
