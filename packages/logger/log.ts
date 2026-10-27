import { Logger, LogLevel } from './types';

/**
 * Player-internal logging façade. Holds a namespace and a pointer to the single injected Logger.
 * child() returns a new Log with a longer namespace and the SAME Logger.
 */
export class Log {
	constructor(private readonly logger: Logger, public readonly namespace: string) {}

	public debug(message: string, ...args: unknown[]): void {
		this.emit('debug', message, args);
	}

	public info(message: string, ...args: unknown[]): void {
		this.emit('info', message, args);
	}

	public warn(message: string, ...args: unknown[]): void {
		this.emit('warn', message, args);
	}

	public error(message: string, ...args: unknown[]): void {
		this.emit('error', message, args);
	}

	public child(suffix: string): Log {
		return new Log(this.logger, `${this.namespace}:${suffix}`);
	}

	private emit(level: LogLevel, message: string, args: unknown[]): void {
		try {
			this.logger.write({ level, namespace: this.namespace, message, args, timestamp: Date.now() });
		} catch (_e) {
			// A broken custom logger must never stop playback. There is nowhere to report this.
		}
	}
}

export const noopLogger: Logger = { write: () => undefined };

/** For unit tests and any caller that needs a Log but no output. */
export const noopLog: Log = new Log(noopLogger, 'noop');
