import { expect, Locator } from '@playwright/test';

export async function testCoordinates(
	locator: Locator, top: number, left: number, width: number, height: number,
) {
	const box = await locator.boundingBox();
	expect(box).not.toBeNull();
	expect(box!.x).toBe(left);
	expect(box!.y).toBe(top);
	expect(box!.width).toBe(width);
	expect(box!.height).toBe(height);
}
