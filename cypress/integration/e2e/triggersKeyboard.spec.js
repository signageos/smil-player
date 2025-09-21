"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tools_1 = require("../../tools/tools");
const enums_1 = require("../../enums/enums");
describe('triggersKeyboard.smil test', () => {
    it('processes smil file correctly', () => {
        cy.visit('/');
        cy.frameLoaded('iframe');
        cy.iframe().find('#SMILUrl').clear().type(enums_1.SMILUrls.triggersKeyboard);
        cy.wait(enums_1.CypressTimeouts.submitTimeout);
        cy.iframe().find('#SMILUrlWrapper').submit();
        cy.get('video[src*="videos/video-test_17354648.mp4"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout }).should('be.visible');
        tools_1.testCoordinates(cy.get('video[src*="videos/video-test_17354648.mp4"]'), 10, 10, 1280, 720);
        cy.wait(enums_1.CypressTimeouts.transitionTimeout);
        cy.get('body').trigger('keydown', { eventConstructor: 'KeyboardEvent', key: 4 });
        cy.get('body').trigger('keydown', { eventConstructor: 'KeyboardEvent', key: 5 });
        cy.get('body').trigger('keydown', { eventConstructor: 'KeyboardEvent', key: 6 });
        cy.get('video[src*="videos/video-test_54188510.mp4"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout }).should('be.visible');
        tools_1.testCoordinates(cy.get('video[src*="videos/video-test_54188510.mp4"]'), 10, 10, 640, 720);
        cy.get('video[src*="videos/video-test_54188510.mp4"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout }).should('not.be.visible');
        cy.iframe()
            .find('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout })
            .should('be.visible');
        tools_1.testCoordinates(cy.iframe().find('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]'), 10, 10, 640, 720);
        cy.iframe()
            .find('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout })
            .should('not.be.visible');
        cy.get('video[src*="videos/video-test_54188510.mp4"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout }).should('be.visible');
        tools_1.testCoordinates(cy.get('video[src*="videos/video-test_54188510.mp4"]'), 10, 10, 640, 720);
        cy.get('video[src*="videos/video-test_54188510.mp4"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout }).should('not.be.visible');
        cy.iframe()
            .find('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout })
            .should('be.visible');
        tools_1.testCoordinates(cy.iframe().find('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]'), 10, 10, 640, 720);
        cy.iframe()
            .find('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout })
            .should('not.be.visible');
        cy.iframe()
            .find('img[id*="img_2_beb3_e6b35b8b.jpg-video-img1"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout })
            .should('be.visible');
        tools_1.testCoordinates(cy.iframe().find('img[id*="img_2_beb3_e6b35b8b.jpg-video-img1"]'), 10, 10, 1280, 720);
        cy.wait(enums_1.CypressTimeouts.transitionTimeout);
        cy.get('body').trigger('keydown', { eventConstructor: 'KeyboardEvent', key: 4 });
        cy.get('body').trigger('keydown', { eventConstructor: 'KeyboardEvent', key: 5 });
        cy.get('body').trigger('keydown', { eventConstructor: 'KeyboardEvent', key: 6 });
        cy.wait(enums_1.CypressTimeouts.transitionTimeout);
        cy.get('body').trigger('keydown', { eventConstructor: 'KeyboardEvent', key: 7 });
        cy.get('body').trigger('keydown', { eventConstructor: 'KeyboardEvent', key: 8 });
        cy.get('body').trigger('keydown', { eventConstructor: 'KeyboardEvent', key: 9 });
        cy.get('video[src*="videos/video-test_54188510.mp4"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout }).should('be.visible');
        tools_1.testCoordinates(cy.get('video[src*="videos/video-test_54188510.mp4"]'), 10, 10, 640, 720);
        cy.get('video[src*="videos/video-test_17354648.mp4"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout }).should('be.visible');
        tools_1.testCoordinates(cy.get('video[src*="videos/video-test_17354648.mp4"]'), 10, 650, 640, 720);
        cy.get('video[src*="videos/video-test_54188510.mp4"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout }).should('not.be.visible');
        cy.iframe()
            .find('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout })
            .should('be.visible');
        tools_1.testCoordinates(cy.iframe().find('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]'), 10, 10, 640, 720);
        cy.get('video[src*="videos/video-test_17354648.mp4"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout }).should('not.be.visible');
        cy.iframe()
            .find('img[id*="img_4_3fe3_e33c3741.jpg-video-img5"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout })
            .should('be.visible');
        tools_1.testCoordinates(cy.iframe().find('img[id*="img_4_3fe3_e33c3741.jpg-video-img5"]'), 10, 650, 640, 720);
        cy.iframe()
            .find('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout })
            .should('not.be.visible');
        cy.get('video[src*="videos/video-test_54188510.mp4"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout }).should('be.visible');
        tools_1.testCoordinates(cy.get('video[src*="videos/video-test_54188510.mp4"]'), 10, 10, 640, 720);
        cy.iframe()
            .find('img[id*="img_4_3fe3_e33c3741.jpg-video-img5"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout })
            .should('not.be.visible');
        cy.get('video[src*="videos/video-test_54188510.mp4"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout }).should('not.be.visible');
        cy.iframe()
            .find('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout })
            .should('be.visible');
        tools_1.testCoordinates(cy.iframe().find('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]'), 10, 10, 640, 720);
        cy.iframe()
            .find('img[id*="img_2_beb3_e6b35b8b.jpg-video-img3"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout })
            .should('not.be.visible');
        cy.iframe()
            .find('img[id*="img_2_beb3_e6b35b8b.jpg-video-img1"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout })
            .should('be.visible');
        tools_1.testCoordinates(cy.iframe().find('img[id*="img_2_beb3_e6b35b8b.jpg-video-img1"]'), 10, 10, 1280, 720);
        cy.get('video[src*="videos/video-test_17354648.mp4"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout }).should('be.visible');
        cy.iframe()
            .find('img[id*="img_2_beb3_e6b35b8b.jpg-video-img1"]', { timeout: enums_1.CypressTimeouts.elementAwaitTimeout })
            .should('not.be.visible');
        tools_1.testCoordinates(cy.get('video[src*="videos/video-test_17354648.mp4"]'), 10, 10, 1280, 720);
    });
});
