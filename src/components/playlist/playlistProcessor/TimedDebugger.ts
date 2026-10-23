import { Log } from '../../../logger';

/**
 * Per-element step timer. Wraps the owner's Log and prefixes each line with the delta since the
 * previous line and the total since construction. Only used along the playElement call chain.
 */
export class TimedDebugger {
	private readonly startTime: number;
	private lastLogTime: number;

	constructor(private readonly debugId: string, private readonly log: Log) {
		this.startTime = Date.now();
		this.lastLogTime = this.startTime;
	}

	public debug(message: string, ...args: unknown[]): void {
		this.log.debug(this.stamp(message), ...args);
	}

	public warn(message: string, ...args: unknown[]): void {
		this.log.warn(this.stamp(message), ...args);
	}

	public error(message: string, ...args: unknown[]): void {
		this.log.error(this.stamp(message), ...args);
	}

	private stamp(message: string): string {
		const now = Date.now();
		const prefix = `[${this.debugId}_${now} +${now - this.lastLogTime}ms total:${now - this.startTime}ms] ${message}`;
		this.lastLogTime = now;
		return prefix;
	}
}
