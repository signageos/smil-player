import { LogEntry, Logger } from '../index';
import { ConsoleLogger } from './consoleLogger';
import { RemoteLogger } from './remoteLogger';

export { ConsoleLogger } from './consoleLogger';
export { RemoteLogger } from './remoteLogger';

/** The slice of the player's `sos` object the loggers read. Declared here so the package needs nothing from the player. */
export type LoggerHost = {
	readonly config: { readonly logger?: unknown; readonly loggerUrl?: unknown; readonly debugEnabled?: unknown };
	readonly management: { getSerialNumber(): Promise<string> };
};

/** Returns `undefined` when the logger's config is incomplete; createLogger then writes to the default logger instead (once). */
export type LoggerFactory = (sos: LoggerHost) => Logger | undefined;

const isDebugEnabled = (sos: LoggerHost) => () => sos.config.debugEnabled === true || sos.config.debugEnabled === 'true';

const consoleFactory: LoggerFactory = (sos) => new ConsoleLogger(isDebugEnabled(sos));

/** Loggers selectable through the `logger` applet config key. Add new implementations here. */
export const loggerFactories: Record<string, LoggerFactory> = {
	console: consoleFactory,
	// `remote` needs `loggerUrl`; without it there is nowhere to send, so leave the line to the default logger
	// instead of buffering into nothing.
	remote: (sos) =>
		sos.config.loggerUrl
			? new RemoteLogger(String(sos.config.loggerUrl), isDebugEnabled(sos), () => sos.management.getSerialNumber())
			: undefined,
};

export const DEFAULT_LOGGER_NAME = 'console';

/** `logger` config: a name, a comma-separated list or an array. Unknown names are dropped; nothing known selects console. */
function selectedLoggerNames(value: unknown, factories: Record<string, LoggerFactory>): string[] {
	const raw = Array.isArray(value) ? value.join(',') : String(value || '');
	const names = raw
		.split(',')
		.map((n) => n.trim())
		.filter((n, i, all) => !!factories[n] && all.indexOf(n) === i);
	return names.length ? names : [DEFAULT_LOGGER_NAME];
}

/**
 * Returns a Logger that fans every entry out to the implementations named by `sos.config.logger`
 * (one name or a comma-separated list, e.g. `console,remote`).
 * The names are re-read on every write, so the selection follows config changes applied after
 * construction (e2e overrides land in SmilPlayer.start(), and sos.config may be incomplete before onReady).
 * Unknown names are ignored, and a name whose factory returns undefined (incomplete config) is replaced by
 * 'console'; either way the console logger is built at most once. Config is the ONLY switch;
 * localStorage.debug is never read (old deployments wrote it whenever debugEnabled was on and relied on
 * Debug.disable() at boot to wipe it).
 */
export function createLogger(sos: LoggerHost, factories: Record<string, LoggerFactory> = loggerFactories): Logger {
	let current: { key: string; loggers: Logger[] } | undefined;
	return {
		write(entry: LogEntry): void {
			const names = selectedLoggerNames(sos.config.logger, factories);
			// loggerUrl is part of the key so a URL fix, or a URL that lands after `logger=remote`, takes effect
			// without a restart instead of leaving the console fallback cached under the name `remote`.
			const key = names.join(',') + '|' + String(sos.config.loggerUrl || '');
			if (!current || current.key !== key) {
				if (current) {
					current.loggers.forEach((l) => l.stop && l.stop());
				}
				const built = names.map((name) => factories[name](sos));
				const loggers = built.filter((l): l is Logger => !!l);
				if (loggers.length < built.length && names.indexOf(DEFAULT_LOGGER_NAME) === -1) {
					loggers.push(factories[DEFAULT_LOGGER_NAME](sos) as Logger);
				}
				current = { key, loggers };
			}
			for (const logger of current.loggers) {
				try {
					logger.write(entry);
				} catch (_e) {
					// one broken output must not starve the others; the player swallows logger errors anyway
				}
			}
		},
	};
}
