"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tools_1 = require("../../tools/tools");
const enums_1 = require("../../enums/enums");
describe('NonExistingMedia.smil test', () => {
    it('processes smil file correctly', () => {
        cy.visit('/');
        cy.frameLoaded('iframe');
        cy.iframe().find('#SMILUrl').clear().type(enums_1.SMILUrls.notExistingMedia);
        cy.wait(enums_1.CypressTimeouts.submitTimeout);
        cy.iframe().find('#SMILUrlWrapper').submit();
        cy.iframe()
            .find('img[id*="landscape2_20622151.jpg-rootLayout-img0"]', {
            timeout: enums_1.CypressTimeouts.elementAwaitTimeout,
        })
            .should('be.visible');
        tools_1.testCoordinates(cy.iframe().find('img[id*="landscape2_20622151.jpg-rootLayout-img0"]'), 0, 0, 1920, 1080);
        cy.iframe()
            .find('img[id*="img_1_64a7_d8cb3084.jpg-main-img2"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout })
            .should('be.visible');
        tools_1.testCoordinates(cy.iframe().find('img[id*="img_1_64a7_d8cb3084.jpg-main-img2"]'), 0, 0, 1920, 1080);
        cy.iframe()
            .find('img[id*="img_1_64a7_d8cb3084.jpg-main-img2"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout })
            .should('not.be.visible');
        cy.get('video[src*="videos/video-test_54188510.mp4"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout }).should('be.visible');
        tools_1.testCoordinates(cy.get('video[src*="videos/video-test_54188510.mp4"]'), 0, 0, 1920, 1080);
        cy.get('video[src*="videos/video-test_54188510.mp4"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout }).should('not.be.visible');
        cy.iframe()
            .find('img[id*="img_1_64a7_d8cb3084.jpg-main-img2"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout })
            .should('be.visible');
        tools_1.testCoordinates(cy.iframe().find('img[id*="img_1_64a7_d8cb3084.jpg-main-img2"]'), 0, 0, 1920, 1080);
    });
});
