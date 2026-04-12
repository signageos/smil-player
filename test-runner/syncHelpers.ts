import { Browser, BrowserContext, Page } from '@playwright/test';
import { createConsoleCollector } from './helpers';
import { DUID } from './config';

export const DEFAULT_SYNC_SERVER_URL = 'https://sync.signage-cdn.com';

export interface SyncDevice {
	context: BrowserContext;
	page: Page;
	console: ReturnType<typeof createConsoleCollector>;
	duid: string;
	deviceId: string;
}

export interface SyncGroupOptions {
	smilUrl: string;
	groupName: string;
	syncServerUrl?: string;
	deviceCount?: number;
	launchStaggerMs?: number;
	emulatorUrl?: string;
	viewport?: { width: number; height: number };
}

export async function createSyncGroup(
	browser: Browser,
	opts: SyncGroupOptions,
): Promise<SyncDevice[]> {
	const {
		smilUrl,
		groupName,
		syncServerUrl = DEFAULT_SYNC_SERVER_URL,
		deviceCount = 3,
		launchStaggerMs = 1500,
		emulatorUrl = 'http://localhost:8090',
		viewport = { width: 1080, height: 1920 },
	} = opts;

	const devices: SyncDevice[] = [];
	for (let i = 0; i < deviceCount; i++) {
		const duid = DUID.slice(0, 48) + i.toString().padStart(2, '0');
		const deviceId = `dev-${i}`;
		const context = await browser.newContext({ viewport, bypassCSP: true });
		const page = await context.newPage();
		const collector = createConsoleCollector(page);
		await context.addInitScript(
			(cfg: { smilUrl: string; sync: { syncGroupName: string; syncDeviceId: string; syncServerUrl: string } }) => {
				(window as any).__SMIL_URL__ = cfg.smilUrl;
				(window as any).__SYNC_CONFIG__ = cfg.sync;
			},
			{ smilUrl, sync: { syncGroupName: groupName, syncDeviceId: deviceId, syncServerUrl } },
		);
		await page.goto(`${emulatorUrl}/?duid=${duid}`);
		devices.push({ context, page, console: collector, duid, deviceId });
		if (i < deviceCount - 1) {
			await new Promise((r) => setTimeout(r, launchStaggerMs));
		}
	}
	return devices;
}

export async function cleanupSyncGroup(devices: SyncDevice[]) {
	await Promise.allSettled(devices.map((d) => d.context.close()));
}

export function uniqueGroupName(testTitle: string): string {
	const slug = testTitle.replace(/[^a-z0-9]/gi, '').slice(0, 20).toLowerCase();
	return `smil-e2e-${slug}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}
