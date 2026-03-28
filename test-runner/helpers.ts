import { expect, Locator, Page } from '@playwright/test';

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

/**
 * Creates a console log collector. Attach to a page BEFORE navigation.
 * Returns live arrays and helper methods for querying collected messages.
 */
export function createConsoleCollector(page: Page) {
	const messages: Array<{ level: string; text: string; time: number }> = [];
	const errors: string[] = [];

	page.on('console', (msg) => {
		messages.push({ level: msg.type(), text: msg.text(), time: Date.now() });
		if (msg.type() === 'error') errors.push(msg.text());
	});
	page.on('pageerror', (err) => errors.push(err.message));

	return {
		messages,
		errors,
		/** Count messages matching a substring pattern */
		count: (pattern: string) => messages.filter((m) => m.text.includes(pattern)).length,
		/** Check if any error matches a pattern */
		hasError: (pattern: string) => errors.some((e) => e.includes(pattern)),
		/** Get all messages matching a pattern */
		matching: (pattern: string) => messages.filter((m) => m.text.includes(pattern)),
	};
}

/**
 * Wait until a console message pattern appears at least minCount times.
 * Uses Playwright's .toPass() for polling with retry.
 */
export async function waitForConsolePattern(
	collector: ReturnType<typeof createConsoleCollector>,
	pattern: string,
	minCount: number,
	timeout: number = 60000,
) {
	await expect(async () => {
		const count = collector.count(pattern);
		if (count < minCount) throw new Error(`"${pattern}": ${count}/${minCount}`);
	}).toPass({ intervals: [1000], timeout });
}

/**
 * Capture current DOM state from main page (videos) and applet iframe (images/iframes).
 */
export async function captureDomState(page: Page) {
	const videos = await page.evaluate(() =>
		[...document.querySelectorAll('video')].map((v) => ({
			src: v.src || null,
			visible: v.offsetWidth > 0 && v.offsetHeight > 0,
			width: v.offsetWidth,
			height: v.offsetHeight,
			currentTime: v.currentTime || 0,
			paused: v.paused,
		})),
	);

	const appletFrame = page.frames().find((f) => f.url().includes(':8091') || f.url().includes('/applet'));

	let images: Array<{ src: string | null; visible: boolean; width: number; height: number }> = [];
	let iframes: Array<{ src: string | null; visible: boolean; width: number; height: number }> = [];

	if (appletFrame) {
		try {
			images = await appletFrame.evaluate(() =>
				[...document.querySelectorAll('img')].map((img) => ({
					src: img.src || null,
					visible: img.offsetWidth > 0 && img.offsetHeight > 0,
					width: img.offsetWidth,
					height: img.offsetHeight,
				})),
			);
			iframes = await appletFrame.evaluate(() =>
				[...document.querySelectorAll('iframe')].map((f) => ({
					src: f.src || null,
					visible: f.offsetWidth > 0 && f.offsetHeight > 0,
					width: f.offsetWidth,
					height: f.offsetHeight,
				})),
			);
		} catch (_e) {
			// Frame may have navigated
		}
	}

	return { videos, images, iframes };
}
