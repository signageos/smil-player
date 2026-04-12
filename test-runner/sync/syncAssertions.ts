import { expect, Locator, Page } from '@playwright/test';
import { SyncDevice } from '../syncHelpers';

export async function waitForMasterElection(
	devices: SyncDevice[],
	timeoutMs = 20000,
): Promise<SyncDevice> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		for (const dev of devices) {
			if (dev.console.matching('isMaster').some((m) => /true|becoming master/i.test(m.text))) {
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

export async function assertAllDevicesShow(
	devices: SyncDevice[],
	locatorForPage: (p: Page) => Locator,
	timeoutMs = 15000,
) {
	for (const dev of devices) {
		await expect(locatorForPage(dev.page)).toBeVisible({ timeout: timeoutMs });
	}
}

export async function assertAllDevicesHide(
	devices: SyncDevice[],
	locatorForPage: (p: Page) => Locator,
	timeoutMs = 15000,
) {
	for (const dev of devices) {
		await expect(locatorForPage(dev.page)).not.toBeVisible({ timeout: timeoutMs });
	}
}

export function countSyncEvents(dev: SyncDevice, pattern: RegExp): number {
	return dev.console.messages.filter((m) => pattern.test(m.text)).length;
}

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
