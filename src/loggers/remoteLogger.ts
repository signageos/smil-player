import { formatMessage, LogEntry, Logger } from '../logger';

export interface RemoteLoggerOptions {
	/** Flush period in ms. 0 disables the timer (tests). Default 5000. */
	flushMs?: number;
	/** Buffer cap; the oldest entries are dropped past it. Default 1000. */
	maxEntries?: number;
}

interface RemoteEntry {
	timestamp: number;
	level: string;
	namespace: string;
	text: string;
}

/**
 * Batches log lines and POSTs them as JSON to `endpoint`, so logs can be read off devices that have no
 * developer console. Honours isEnabled() per write (same predicate as ConsoleLogger: sos.config.debugEnabled),
 * so the stream can be switched on and off from applet config without a redeploy.
 *
 * Lines are rendered to text at write time: the wire never sees DOM nodes, Errors or playlist structures.
 * Body is JSON sent as text/plain, which keeps the request a CORS "simple request" (no preflight), so the
 * bytes reach the server even when it sends no CORS headers. Chrome 38 has neither fetch nor sendBeacon.
 */
export class RemoteLogger implements Logger {
	private buffer: RemoteEntry[] = [];
	private deviceId: string = 'unknown';
	private readonly maxEntries: number;
	private readonly timer: ReturnType<typeof setInterval> | undefined;
	private readonly onPageHide: () => void;

	constructor(
		private readonly endpoint: string,
		private readonly isEnabled: () => boolean,
		getDeviceId: () => Promise<string>,
		options: RemoteLoggerOptions = {},
	) {
		this.onPageHide = () => this.flush();
		this.maxEntries = options.maxEntries === undefined ? 1000 : options.maxEntries;
		const flushMs = options.flushMs === undefined ? 5000 : options.flushMs;
		try {
			getDeviceId().then(
				(id) => {
					this.deviceId = String(id);
				},
				() => undefined,
			);
		} catch (_e) {
			// getDeviceId threw synchronously (no management API); deviceId stays 'unknown'
		}
		if (flushMs > 0) {
			this.timer = setInterval(() => this.flush(), flushMs);
		}
		if (typeof window !== 'undefined') {
			window.addEventListener('pagehide', this.onPageHide);
		}
	}

	public write(entry: LogEntry): void {
		let enabled = false;
		try {
			enabled = this.isEnabled();
		} catch (_e) {
			enabled = false;
		}
		if (!enabled) {
			return;
		}
		this.buffer.push({
			timestamp: entry.timestamp,
			level: entry.level,
			namespace: entry.namespace,
			text: formatMessage(entry.message, entry.args),
		});
		if (this.buffer.length > this.maxEntries) {
			// ponytail: drop-oldest on overflow and no retry on failed POST; add a retry queue if lost lines matter
			this.buffer.splice(0, this.buffer.length - this.maxEntries);
		}
	}

	public flush(): void {
		if (this.buffer.length === 0) {
			return;
		}
		const body = JSON.stringify({ deviceId: this.deviceId, entries: this.buffer });
		this.buffer = [];
		try {
			const xhr = new XMLHttpRequest();
			xhr.open('POST', this.endpoint, true);
			xhr.setRequestHeader('Content-Type', 'text/plain');
			xhr.send(body);
		} catch (_e) {
			// a logger must never throw into the player; the batch is lost
		}
	}

	public stop(): void {
		if (this.timer !== undefined) {
			clearInterval(this.timer);
		}
		if (typeof window !== 'undefined') {
			window.removeEventListener('pagehide', this.onPageHide);
		}
	}
}
