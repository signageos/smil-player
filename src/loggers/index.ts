import { ISos } from '../models/sosModels';
import { LogEntry, Logger } from '../logger';
import { ConsoleLogger } from './consoleLogger';

export { ConsoleLogger } from './consoleLogger';

export type LoggerFactory = (sos: ISos) => Logger;

/** Loggers selectable through the `logger` applet config key. Add new implementations here. */
export const loggerFactories: Record<string, LoggerFactory> = {
	console: (sos) => new ConsoleLogger(() => sos.config.debugEnabled === true || sos.config.debugEnabled === 'true'),
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
