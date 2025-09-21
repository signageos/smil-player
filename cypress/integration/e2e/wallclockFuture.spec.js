"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tools_1 = require("../../tools/tools");
const enums_1 = require("../../enums/enums");
describe('wallclockFuture.smil test', () => {
    it('processes smil file correctly', () => {
        cy.visit('/');
        cy.frameLoaded('iframe');
        cy.iframe().find('#SMILUrl').clear().type(enums_1.SMILUrls.wallclockFuture);
        cy.wait(enums_1.CypressTimeouts.submitTimeout);
        cy.iframe().find('#SMILUrlWrapper').submit();
        cy.get('video[src*="videos/loader_fe864e57.mp4"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout }).should('be.visible');
        tools_1.testCoordinates(cy.get('video[src*="videos/loader_fe864e57.mp4"]'), 0, 0, 1920, 1080);
        cy.wait(enums_1.CypressTimeouts.videoTransitionTimeout);
        cy.get('video[src*="videos/loader_fe864e57.mp4"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout }).should('be.visible');
        cy.wait(enums_1.CypressTimeouts.videoTransitionTimeout);
        cy.wait(enums_1.CypressTimeouts.videoTransitionTimeout);
        cy.get('video[src*="videos/video-test_17354648.mp4"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout }).should('be.visible');
        cy.get('video[src*="videos/loader_fe864e57.mp4"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout }).should('not.be.visible');
        tools_1.testCoordinates(cy.get('video[src*="videos/video-test_17354648.mp4"]'), 0, 0, 1280, 720);
        cy.get('video[src*="videos/video-test_17354648.mp4"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout }).should('not.be.visible');
        cy.iframe()
            .find('img[src*="images/img_1_64a752b2.jpg"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout })
            .should('be.visible');
        tools_1.testCoordinates(cy.iframe().find('img[src*="images/img_1_64a752b2.jpg"]'), 0, 0, 1280, 720);
    });
});
