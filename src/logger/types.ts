export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
	level: LogLevel;
	/**
	 * '@signageos/smil-player:<module>', e.g. '@signageos/smil-player:filesManager'. Lines emitted by
	 * shared tool functions carry the module name of the class that called them.
	 */
	namespace: string;
	/** printf-style template (%s %d %O %X), e.g. '[files] sending report: endpoint=%s' */
	message: string;
	/**
	 * Template values, passed by reference, never pre-formatted. May contain Error objects, DOM nodes
	 * and large playlist structures. Use formatMessage(message, args) from './formatMessage' to render.
	 */
	args: unknown[];
	/** Date.now() at the call site */
	timestamp: number;
}

/**
 * The one thing a custom logger implements. See docs/reference/custom-logger.md for examples.
 * - write() must be synchronous and should not throw; the player swallows exceptions so a broken
 *   logger cannot stop playback, but nobody is told about them.
 * - The player emits every line at every level; filtering by level or namespace is the logger's job.
 * - A logger may use browser APIs, bundled packages and the sos object passed in from index.ts, but
 *   must not import from src/components or src/models.
 */
export interface Logger {
	write(entry: LogEntry): void;
}
