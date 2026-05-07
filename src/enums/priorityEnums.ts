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

export enum WaitStatus {
	CONTINUE = 'continue',         // Process element normally
	RETRY = 'retry',               // Retry later (waiting for higher priority)
	SKIP = 'skip',                 // Skip permanently (cancelled/expired)
}
