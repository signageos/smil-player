import { Browser, BrowserContext, Page } from '@playwright/test';
import { createConsoleCollector } from './helpers';
import { DUID } from './config';

export const DEFAULT_SYNC_SERVER_URL = 'https://sync.signage-cdn.com';

/** Hostname substring used to filter sync-server WebSocket frames from any
 * incidental WS traffic the page might open. Matches DEFAULT_SYNC_SERVER_URL. */
const SYNC_WS_HOST_FILTER = 'sync.signage-cdn.com';

/**
 * One captured WebSocket frame on a SyncDevice. Buffer payloads are base64-
 * encoded into `payload` and flagged with `isBinary: true`; text frames keep
 * their string verbatim. `timestamp` is controller-side `Date.now()` at the
 * moment Playwright fired the frame event.
 */
export interface WsFrame {
	direction: 'sent' | 'received';
	timestamp: number;
	payload: string;
	isBinary: boolean;
	url: string;
}

export interface SyncDevice {
	context: BrowserContext;
	page: Page;
	console: ReturnType<typeof createConsoleCollector>;
	/** All WebSocket frames captured from sync-server connections opened by
	 * this device's page. Populated automatically by `createSyncGroup`. */
	wsFrames: WsFrame[];
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
	/** Hard cap on per-device captured WS frames. Default 20_000 handles ~10 min
	 * of typical sync traffic; longer tests should raise or disable this. */
	wsFramesMaxLen?: number;
	/** Hard cap on collected console messages per device. Default 10_000 keeps
	 * typical 1–2 min sync runs well within memory; raise for long-running tests. */
	consoleMaxMessages?: number;
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
		wsFramesMaxLen = 20_000,
		consoleMaxMessages = 10_000,
	} = opts;

	const devices: SyncDevice[] = [];
	for (let i = 0; i < deviceCount; i++) {
		const duid = DUID.slice(0, 48) + i.toString().padStart(2, '0');
		const deviceId = `dev-${i}`;
		const context = await browser.newContext({ viewport, bypassCSP: true });
		const page = await context.newPage();
		const collector = createConsoleCollector(page, { maxMessages: consoleMaxMessages });
		// WebSocket frame capture. Listener attaches before page.goto so the
		// sync-server WS opened later by the player (after connectSyncSafe) is
		// caught from its first frame. Filter by host to ignore incidental WS
		// traffic. Buffer payloads are base64-encoded; text payloads pass through.
		const wsFrames: WsFrame[] = [];
		page.on('websocket', (ws) => {
			if (!ws.url().includes(SYNC_WS_HOST_FILTER)) return;
			const url = ws.url();
			ws.on('framesent', (event) => {
				const payload = event.payload;
				wsFrames.push({
					direction: 'sent',
					timestamp: Date.now(),
					payload: typeof payload === 'string' ? payload : payload.toString('base64'),
					isBinary: typeof payload !== 'string',
					url,
				});
				if (wsFrames.length > wsFramesMaxLen) wsFrames.shift();
			});
			ws.on('framereceived', (event) => {
				const payload = event.payload;
				wsFrames.push({
					direction: 'received',
					timestamp: Date.now(),
					payload: typeof payload === 'string' ? payload : payload.toString('base64'),
					isBinary: typeof payload !== 'string',
					url,
				});
				if (wsFrames.length > wsFramesMaxLen) wsFrames.shift();
			});
		});
		await context.addInitScript(
			(cfg: {
				smilUrl: string;
				sync: {
					syncGroupName: string;
					syncDeviceId: string;
					syncServerUrl: string;
					debugEnabled: string;
				};
			}) => {
				(window as any).__SMIL_URL__ = cfg.smilUrl;
				// __SYNC_CONFIG__ flows to smilPlayer.ts as configOverrides and is
				// applied key-by-key to sos.config. Including `debugEnabled: 'true'`
				// is what makes the player re-enable @signageos/smil-player:* debug
				// logs after its Debug.disable() call — the sync assertions grep
				// console for [sync]/[syncGroup] lines that only appear then.
				(window as any).__SYNC_CONFIG__ = cfg.sync;
			},
			{
				smilUrl,
				sync: {
					syncGroupName: groupName,
					syncDeviceId: deviceId,
					syncServerUrl,
					debugEnabled: 'true',
				},
			},
		);
		await page.goto(`${emulatorUrl}/?duid=${duid}`);
		devices.push({ context, page, console: collector, wsFrames, duid, deviceId });
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
