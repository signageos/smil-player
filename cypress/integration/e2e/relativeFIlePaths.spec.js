"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tools_1 = require("../../tools/tools");
const enums_1 = require("../../enums/enums");
describe('relativeFilePaths.smil test', () => {
    it('processes smil file correctly', () => {
        cy.visit('/');
        cy.frameLoaded('iframe');
        cy.iframe().find('#SMILUrl').clear().type(enums_1.SMILUrls.relativeFilePaths);
        cy.wait(enums_1.CypressTimeouts.submitTimeout);
        cy.iframe().find('#SMILUrlWrapper').submit();
        cy.get('video[src*="videos/loader_a667ec98.mp4"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout }).should('be.visible');
        tools_1.testCoordinates(cy.get('video[src*="videos/loader_a667ec98.mp4"]'), 0, 0, 1920, 1080);
        cy.get('video[src*="videos/landscape1_86c12946.mp4"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout }).should('be.visible');
        tools_1.testCoordinates(cy.get('video[src*="videos/landscape1_86c12946.mp4"]'), 270, 480, 960, 540);
        // doesNotExist(cy.get('body'), 'video[src*="videos/loader_a667ec98.mp4"]');
        cy.wait(enums_1.CypressTimeouts.videoTransitionTimeout);
        cy.wait(enums_1.CypressTimeouts.videoTransitionTimeout);
        cy.wait(enums_1.CypressTimeouts.videoTransitionTimeout);
        cy.get('video[src*="videos/landscape1_86c12946.mp4"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout }).should('be.visible');
        tools_1.testCoordinates(cy.get('video[src*="videos/landscape1_86c12946.mp4"]'), 270, 480, 960, 540);
    });
});
