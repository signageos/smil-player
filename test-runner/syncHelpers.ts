import { Browser, BrowserContext, Page } from '@playwright/test';
import { createConsoleCollector } from './helpers';

export interface SyncDevice {
	context: BrowserContext;
	page: Page;
	console: ReturnType<typeof createConsoleCollector>;
	duid: string;
	deviceId: string;
}

/**
 * Create a sync-enabled device (browser context) for multi-device tests.
 *
 * Each device gets:
 * - Unique DUID and syncDeviceId
 * - Shared syncGroupName and syncServerUrl
 * - Console log collector
 *
 * Usage:
 *   const dev1 = await createSyncDevice(browser, smilUrl, {
 *     syncGroupName: 'test-group',
 *     syncDeviceId: 'device-0',
 *     syncServerUrl: 'http://sync-server:port',
 *   }, 'duid-0');
 */
export async function createSyncDevice(
	browser: Browser,
	smilUrl: string,
	syncConfig: { syncGroupName: string; syncDeviceId: string; syncServerUrl: string },
	duid: string,
): Promise<SyncDevice> {
	const context = await browser.newContext({
		viewport: { width: 1080, height: 1920 },
		bypassCSP: true,
	});
	const page = await context.newPage();
	const collector = createConsoleCollector(page);

	await context.addInitScript(
		(cfg: { smilUrl: string; syncConfig: Record<string, string> }) => {
			(window as any).__SMIL_URL__ = cfg.smilUrl;
			(window as any).__SYNC_CONFIG__ = cfg.syncConfig;
		},
		{ smilUrl, syncConfig },
	);

	await page.goto(`http://localhost:8090/?duid=${duid}`);

	return { context, page, console: collector, duid, deviceId: syncConfig.syncDeviceId };
}

/**
 * Close all sync device contexts.
 */
export async function cleanupSyncDevices(devices: SyncDevice[]) {
	for (const dev of devices) {
		await dev.context.close();
	}
}
