export enum PriorityDefault {
	lower = 'defer',
	peer = 'never',
	higher = 'stop',
	pauseDisplay = 'show',
}

export enum PriorityRule {
	defer = 'defer',
	never = 'never',
	stop = 'stop',
	pause = 'pause',
}

export enum PriorityBehaviour {
	none = '',
	stop = 'stop',
	pause = 'pause',
	defer = 'defer',
}

export enum WaitStatus {
	CONTINUE = 'continue',         // Process element normally
	RETRY = 'retry',               // Retry later (waiting for higher priority)
	SKIP = 'skip',                 // Skip permanently (cancelled/expired)
}

/** Sentinel value for contentPause when a playlist is paused indefinitely by higher priority */
export const PAUSE_CONTENT_VALUE = 9999999;

/** endTime values above this threshold are millisecond timestamps; at or below are repeat counts */
export const ENDTIME_REPEAT_THRESHOLD = 1000;
