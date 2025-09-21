"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function testVisible(element) {
    element.then(($header) => {
        if ($header.is(':visible')) {
            assert.isOk('visibility', `element is VISIBLE at this moment ${$header.src}`);
            return;
        }
        assert.isNotOk('invisibility', `element is INVISIBLE at this moment ${$header.src}`);
    });
}
exports.testVisible = testVisible;
function testInvisible(element) {
    element.then(($header) => {
        if ($header.is(':visible')) {
            assert.isNotOk('visibility', `element is VISIBLE at this moment ${$header.src}`);
            return;
        }
        assert.isOk('invisibility', `element is INVISIBLE at this moment ${$header.src}`);
    });
}
exports.testInvisible = testInvisible;
function doesNotExist(parentElement, elementIdentifier) {
    parentElement.then(($element) => {
        if ($element.find(elementIdentifier).length > 0) {
            assert.isNotOk('doesNotExist', 'element should not exists at this moment');
            return;
        }
        assert.isOk('doesNotExist', 'element does not exist at this moment');
    });
}
exports.doesNotExist = doesNotExist;
function numberOfElementsExists(parentElement, elementIdentifier, limit) {
    parentElement.then(($element) => {
        if ($element.find(elementIdentifier).length !== limit) {
            assert.isNotOk('Correct amount', 'incorrect number of elements exists on the page');
            return;
        }
        assert.isOk('Correct amount', 'correct number of elements exists on the page');
    });
}
exports.numberOfElementsExists = numberOfElementsExists;
function testCoordinates(element, top, left, width, height) {
    element.then(($target) => {
        const coords = $target[0].getBoundingClientRect();
        expectCoordinates(coords, top, left, width, height);
    });
}
exports.testCoordinates = testCoordinates;
function expectCoordinates(coords, top, left, width, height) {
    expect(coords.y).to.equal(top);
    expect(coords.x).to.equal(left);
    expect(coords.width).to.equal(width);
    expect(coords.height).to.equal(height);
}
exports.expectCoordinates = expectCoordinates;
