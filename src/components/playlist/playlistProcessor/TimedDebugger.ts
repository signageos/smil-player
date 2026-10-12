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
		const now = Date.now();
		this.log.debug(`[${this.debugId}_${now} +${now - this.lastLogTime}ms total:${now - this.startTime}ms] ${message}`, ...args);
		this.lastLogTime = now;
	}
}
