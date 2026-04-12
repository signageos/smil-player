import { expect, Locator, Page } from '@playwright/test';
import { SyncDevice } from '../syncHelpers';

export async function waitForMasterElection(
	devices: SyncDevice[],
	timeoutMs = 20000,
): Promise<SyncDevice> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		for (const dev of devices) {
			if (dev.console.messages.some((m) => /\bisMaster\b[^a-z]*(?:=|:|\s)\s*true|becoming\s+master/i.test(m.text))) {
				return dev;
			}
		}
		await new Promise((r) => setTimeout(r, 250));
	}
	throw new Error(
		`No master elected within ${timeoutMs}ms. Console tails:\n` +
			devices
				.map((d, i) => `dev${i}:\n${d.console.messages.slice(-20).map((m) => m.text).join('\n')}`)
				.join('\n\n'),
	);
}

/**
 * Asserts each device's locator becomes visible within `timeoutMs`.
 * NOTE: This checks **eventual** visibility per device, not simultaneous visibility.
 * For "all devices show the same element at the same moment" use `waitForConvergence`.
 */
export async function assertAllDevicesShow(
	devices: SyncDevice[],
	locatorForPage: (p: Page) => Locator,
	timeoutMs = 15000,
) {
	await Promise.all(
		devices.map((d) => expect(locatorForPage(d.page)).toBeVisible({ timeout: timeoutMs })),
	);
}

/**
 * Asserts each device's locator becomes hidden within `timeoutMs`.
 * NOTE: This checks **eventual** non-visibility per device, not simultaneous.
 */
export async function assertAllDevicesHide(
	devices: SyncDevice[],
	locatorForPage: (p: Page) => Locator,
	timeoutMs = 15000,
) {
	await Promise.all(
		devices.map((d) => expect(locatorForPage(d.page)).not.toBeVisible({ timeout: timeoutMs })),
	);
}

export function countSyncEvents(dev: SyncDevice, pattern: RegExp): number {
	return dev.console.messages.filter((m) => pattern.test(m.text)).length;
}

/**
 * Returns true if ANY matching line appears in either `errors` or `messages`.
 * Despite the name, this searches logs at every level — use for "did this string
 * ever appear in the console" assertions regardless of log level.
 */
export function hasConsoleError(dev: SyncDevice, pattern: RegExp): boolean {
	return (
		dev.console.errors.some((e) => pattern.test(e)) ||
		dev.console.messages.some((m) => pattern.test(m.text))
	);
}

/**
 * Poll until every device's locator is visible simultaneously. Used to prove
 * master/slave converge to the same element.
 */
export async function waitForConvergence(
	devices: SyncDevice[],
	locatorForPage: (p: Page) => Locator,
	timeoutMs = 30000,
) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const all = await Promise.all(devices.map((d) => locatorForPage(d.page).isVisible().catch(() => false)));
		if (all.every(Boolean)) return;
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error(
		`Devices never converged within ${timeoutMs}ms.\nPer-device last messages:\n` +
			devices
				.map((d, i) => `dev${i}:\n${d.console.messages.slice(-10).map((m) => m.text).join('\n')}`)
				.join('\n\n'),
	);
}
