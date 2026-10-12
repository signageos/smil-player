import Debug, { Debugger } from 'debug';
import { formatMessage, LogEntry, Logger } from '../logger';

/**
 * Default logger: reproduces the player's historical console output through the `debug` package
 * (namespace colouring, +Nms suffix) and adds an absolute ISO timestamp to every line.
 * Prints nothing at any level while isEnabled() is false. The predicate is evaluated on every write
 * because sos.config.debugEnabled can change after construction (e2e injects it after onReady).
 * Never calls Debug.enable()/disable(), so localStorage.debug is never written.
 */
export class ConsoleLogger implements Logger {
	private readonly instances: Record<string, Debugger> = {};

	constructor(private readonly isEnabled: () => boolean) {}

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
		const iso = new Date(entry.timestamp).toISOString();
		if (entry.level === 'debug') {
			// Timestamp goes INTO the template, not as an argument: Playwright's msg.text() keeps the raw
			// template plus the trailing argument values, and test-runner/sync regexes mine that argument tail.
			this.instance(entry.namespace)('[' + iso + '] ' + entry.message, ...entry.args);
			return;
		}
		const line = `${entry.namespace} [${iso}] ${formatMessage(entry.message, entry.args)}`;
		if (entry.level === 'error') {
			console.error(line);
		} else if (entry.level === 'warn') {
			console.warn(line);
		} else {
			console.info(line);
		}
	}

	private instance(namespace: string): Debugger {
		let instance = this.instances[namespace];
		if (!instance) {
			instance = Debug(namespace);
			instance.enabled = true;
			this.instances[namespace] = instance;
		}
		return instance;
	}
}
