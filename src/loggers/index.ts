import { ISos } from '../models/sosModels';
import { LogEntry, Logger } from '../logger';
import { ConsoleLogger } from './consoleLogger';
import { RemoteLogger } from './remoteLogger';

export { ConsoleLogger } from './consoleLogger';
export { RemoteLogger } from './remoteLogger';

export type LoggerFactory = (sos: ISos) => Logger;

const isDebugEnabled = (sos: ISos) => () => sos.config.debugEnabled === true || sos.config.debugEnabled === 'true';

const consoleFactory: LoggerFactory = (sos) => new ConsoleLogger(isDebugEnabled(sos));

/** Loggers selectable through the `logger` applet config key. Add new implementations here. */
export const loggerFactories: Record<string, LoggerFactory> = {
	console: consoleFactory,
	// `remote` needs `loggerUrl`; without it there is nowhere to send, so behave like console instead of buffering into nothing.
	remote: (sos) =>
		sos.config.loggerUrl
			? new RemoteLogger(String(sos.config.loggerUrl), isDebugEnabled(sos), () => sos.management.getSerialNumber())
			: consoleFactory(sos),
};

export const DEFAULT_LOGGER_NAME = 'console';

/**
 * Returns a Logger that delegates to the implementation named by `sos.config.logger`.
 * The name is re-read on every write, so the selection follows config changes applied after
 * construction (e2e overrides land in SmilPlayer.start(), and sos.config may be incomplete before onReady).
 * Unknown or missing names fall back to 'console'. Config is the ONLY switch; localStorage.debug is never read
 * (old deployments wrote it whenever debugEnabled was on and relied on Debug.disable() at boot to wipe it).
 */
export function createLogger(sos: ISos, factories: Record<string, LoggerFactory> = loggerFactories): Logger {
	let current: { name: string; logger: Logger } | undefined;
	return {
		write(entry: LogEntry): void {
			const requested = String(sos.config.logger || DEFAULT_LOGGER_NAME);
			const name = factories[requested] ? requested : DEFAULT_LOGGER_NAME;
			if (!current || current.name !== name) {
				current = { name, logger: factories[name](sos) };
			}
			current.logger.write(entry);
		},
	};
}
