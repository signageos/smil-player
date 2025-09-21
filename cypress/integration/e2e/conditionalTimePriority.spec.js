"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tools_1 = require("../../tools/tools");
const enums_1 = require("../../enums/enums");
describe('conditionalTimePriority.smil test', () => {
    it('processes smil file correctly', () => {
        cy.visit('/');
        cy.frameLoaded('iframe');
        cy.iframe().find('#SMILUrl').clear().type(enums_1.SMILUrls.conditionalTimePriority);
        cy.wait(enums_1.CypressTimeouts.submitTimeout);
        cy.iframe().find('#SMILUrlWrapper').submit();
        cy.get('video[src*="videos/video-test_17354648.mp4"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout }).should('be.visible');
        tools_1.testCoordinates(cy.get('video[src*="videos/video-test_17354648.mp4"]'), 0, 0, 1920, 1080);
        cy.iframe()
            .find('img[id*="img_1_64a7_1f16f683.jpg-video-img2"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout })
            .should('be.visible');
        cy.get('video[src*="videos/video-test_17354648.mp4"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout }).should('not.be.visible');
        tools_1.testCoordinates(cy.iframe().find('img[id*="img_1_64a7_1f16f683.jpg-video-img2"]'), 0, 0, 1920, 1080);
        cy.get('video[src*="videos/video-test_17354648.mp4"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout }).should('be.visible');
        cy.iframe()
            .find('img[id*="img_1_64a7_1f16f683.jpg-video-img2"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout })
            .should('not.be.visible');
        tools_1.testCoordinates(cy.get('video[src*="videos/video-test_17354648.mp4"]'), 0, 0, 1920, 1080);
        cy.iframe()
            .find('img[id*="img_1_64a7_1f16f683.jpg-video-img2"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout })
            .should('be.visible');
        cy.get('video[src*="videos/video-test_17354648.mp4"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout }).should('not.be.visible');
        tools_1.testCoordinates(cy.iframe().find('img[id*="img_1_64a7_1f16f683.jpg-video-img2"]'), 0, 0, 1920, 1080);
        cy.iframe()
            .find('img[id*="img_2_beb3_926b4da4.jpg-video-img3"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout })
            .should('be.visible');
        cy.iframe()
            .find('img[id*="img_1_64a7_1f16f683.jpg-video-img2"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout })
            .should('not.be.visible');
        tools_1.testCoordinates(cy.iframe().find('img[id*="img_2_beb3_926b4da4.jpg-video-img3"]'), 0, 0, 1920, 1080);
        cy.iframe()
            .find('img[id*="img_1_64a7_1f16f683.jpg-video-img4"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout })
            .should('be.visible');
        cy.iframe()
            .find('img[id*="img_2_beb3_926b4da4.jpg-video-img3"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout })
            .should('not.be.visible');
        tools_1.testCoordinates(cy.iframe().find('img[id*="img_1_64a7_1f16f683.jpg-video-img4"]'), 0, 0, 1920, 1080);
        cy.get('video[src*="videos/video-test_17354648.mp4"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout }).should('be.visible');
        cy.iframe()
            .find('img[id*="img_1_64a7_1f16f683.jpg-video-img4"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout })
            .should('not.be.visible');
        tools_1.testCoordinates(cy.get('video[src*="videos/video-test_17354648.mp4"]'), 0, 0, 1920, 1080);
    });
});
