import Chainable = Cypress.Chainable;

export function testVisible(element: Chainable) {
	element.then($header => {
		if ($header.is(':visible')) {
			assert.isOk('visibility', 'element is VISIBLE at this moment');
			return;
		}
		assert.isNotOk('invisibility', 'element is INVISIBLE at this moment');
	});
}

export function testInvisible(element: Chainable) {
	element.then($header => {
		if ($header.is(':visible')) {
			assert.isNotOk('visibility', 'element is VISIBLE at this moment');
			return;
		}
		assert.isOk('invisibility', 'element is INVISIBLE at this moment');
	});
}

export function doesNotExist(parentElement: Chainable, elementIdentifier: string) {
	parentElement.then($element => {
		if ($element.find(elementIdentifier).length > 0) {
			assert.isNotOk('doesNotExist', 'element should not exists at this moment');
			return;
		}
		assert.isOk('doesNotExist', 'element does not exist at this moment');
	});
}

export function numberOfElementsExists(parentElement: Chainable, elementIdentifier: string, limit: number) {
	parentElement.then($element => {
		if ($element.find(elementIdentifier).length !== limit) {
			assert.isNotOk('Correct amount', 'incorrect number of elements exists on the page');
			return;
		}
		assert.isOk('Correct amount', 'correct number of elements exists on the page');
	});
}

export function testCoordinates(element: Chainable, top: number, left: number, width: number, height: number) {
	element.then($target => {
		const coords = $target[0].getBoundingClientRect();
		expectCoordinates(coords, top, left, width, height);
	});
}

export function expectCoordinates(coords: any, top: number, left: number, width: number, height: number) {
	expect(coords.y).to.equal(top);
	expect(coords.x).to.equal(left);
	expect(coords.width).to.equal(width);
	expect(coords.height).to.equal(height);
}
