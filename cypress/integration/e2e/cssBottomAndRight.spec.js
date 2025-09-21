"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tools_1 = require("../../tools/tools");
const enums_1 = require("../../enums/enums");
describe('cssBottomAndRight.smil test', () => {
    it('processes smil file correctly', () => {
        cy.visit('/');
        cy.frameLoaded('iframe');
        cy.iframe().find('#SMILUrl').clear().type(enums_1.SMILUrls.cssBottom);
        cy.wait(enums_1.CypressTimeouts.submitTimeout);
        cy.iframe().find('#SMILUrlWrapper').submit();
        cy.iframe()
            .find('img[id*="img_1_64a7_d8cb3084.jpg-video2-img1"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout })
            .should('be.visible');
        tools_1.testCoordinates(cy.iframe().find('img[id*="img_1_64a7_d8cb3084.jpg-video2-img1"]'), 252, 825, 540, 608);
        cy.get('video[src*="videos/video-test_54188510.mp4"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout }).should('be.visible');
        tools_1.testCoordinates(cy.get('video[src*="videos/video-test_54188510.mp4"]'), 364, 1188, 540, 608);
    });
});
