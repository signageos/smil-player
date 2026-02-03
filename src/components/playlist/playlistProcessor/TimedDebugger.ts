/**
 * TimedDebugger - A debug logger that tracks timing information
 * Used to identify where time is spent during element playback
 * This is for debugging purposes only and has no functional impact
 */
export class TimedDebugger {
	private startTime: number;
	private lastLogTime: number;
	private debugId: string;
	private debugFn: any;

	constructor(debugId: string, debugFn: any) {
		this.debugId = debugId;
		this.debugFn = debugFn;
		this.startTime = Date.now();
		this.lastLogTime = this.startTime;
	}

	/**
	 * Log a message with timing information
	 * Shows time elapsed since last log and total time since start
	 */
	public log(message: string, ...args: any[]) {
		const now = Date.now();
		const totalElapsed = now - this.startTime;
		const deltaFromLast = now - this.lastLogTime;

		this.debugFn(`[${this.debugId}_${now} +${deltaFromLast}ms total:${totalElapsed}ms] ${message}`, ...args);
		this.lastLogTime = now;
	}
}
