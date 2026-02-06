export type ISyncStatus = {
	connectedPeers: string[];
};

export type SyncElementState = 'idle' | 'prepared' | 'playing' | 'finished';

export interface SyncStateEvent {
	regionName: string;
	syncIndex: number;
	state: SyncElementState;
	timestamp: number;
	elementId?: string;
}

/** Virtual element state used for processing sync coordination messages */
export interface VirtualElementState {
	state: SyncElementState;
	regionName: string;
	syncIndex: number;
	timestamp: number;
	priorityMinSyncIndex?: number;
	priorityMaxSyncIndex?: number;
}

export interface SyncNavigationEvent {
	regionName: string;
	syncIndex: number;
	action: 'navigate' | 'prepare' | 'play' | 'finish';
	timestamp: number;
}

// type MultiLevelSync = {
// 	before: number | undefined;
// 	after: number | undefined;
// };

// Acknowledgment Protocol Types
export type SyncMessageType =
	| 'cmd-prepare'           // Master commands slaves to prepare
	| 'cmd-play'              // Master commands slaves to play
	| 'cmd-finish'            // Master commands slaves to finish
	| 'cmd-playMode'          // Master commands slaves with playMode=one element index
	| 'signal-ready-prepared' // Master signals all devices ready after prepare phase
	| 'signal-ready-playing'  // Master signals all devices ready after play phase
	| 'signal-ready-finished' // Master signals all devices ready after finish phase
	| 'signal-ready-playMode' // Master signals all devices ready after playMode phase
	| 'ack-prepared'          // Slave acknowledges preparation complete
	| 'ack-playing'           // Slave acknowledges playing started
	| 'ack-finished'          // Slave acknowledges element finished
	| 'ack-playMode';         // Slave acknowledges playMode index received

export interface SyncMessage {
	type: SyncMessageType;
	regionName: string;
	syncIndex: number;
	timestamp: number;
	priorityLevel?: number;  // Priority level of current content (optional for playlists without priorityClass)
	priorityMinSyncIndex?: number;  // First syncIndex in current priority playlist (for wraparound)
	priorityMaxSyncIndex?: number;  // Last syncIndex in current priority playlist (for wraparound)
	previousIndex?: number;  // playMode=one: element index to synchronize across devices
}

export type Synchronization = {
	shouldSync: boolean;
	syncGroupIds: string[];
	syncGroupName: string;
	syncDeviceId: string;
	syncingInAction: boolean;
	movingForward: boolean;
	shouldCancelAll: boolean;
	resyncTargets?: {
		prepare?: number;  // Target syncIndex for preparation phase
		play?: number;     // Target syncIndex for playing phase
		finish?: number;   // Target syncIndex for finish phase
	};
	maxSyncIndexPerRegion?: { [regionName: string]: number };
	// Maps regionName -> priorityLevel -> {min, max} syncIndex bounds for that priority playlist
	syncIndexBoundsPerPriority?: {
		[regionName: string]: {
			[priorityLevel: number]: { min: number; max: number };
		};
	};
	/** Maps regionName → sorted array of playMode syncIndex ranges (for resync target computation) */
	playModeSyncRanges?: {
		[regionName: string]: Array<{ start: number; end: number }>;
	};
};

/** Synchronization phases */
export type SyncPhase = 'prepare' | 'play' | 'finish' | 'playMode';

/** Specific message type subsets for type safety */
export type SyncCommandType = 'cmd-prepare' | 'cmd-play' | 'cmd-finish' | 'cmd-playMode';
export type SyncAckType = 'ack-prepared' | 'ack-playing' | 'ack-finished' | 'ack-playMode';
export type SyncSignalReadyType = 'signal-ready-prepared' | 'signal-ready-playing' | 'signal-ready-finished' | 'signal-ready-playMode';

/** Configuration for each sync phase mapping to existing message types */
export interface SyncPhaseConfig {
	commandType: SyncCommandType;
	ackType: SyncAckType;
	signalType: SyncSignalReadyType;
	state: Exclude<SyncElementState, 'idle'>;  // prepared, playing, finished
	resyncField: keyof NonNullable<Synchronization['resyncTargets']>;  // prepare, play, finish
}

/** Phase configuration lookup table */
export const SYNC_PHASE_CONFIG: Record<SyncPhase, SyncPhaseConfig> = {
	prepare: {
		commandType: 'cmd-prepare',
		ackType: 'ack-prepared',
		signalType: 'signal-ready-prepared',
		state: 'prepared',
		resyncField: 'prepare',
	},
	play: {
		commandType: 'cmd-play',
		ackType: 'ack-playing',
		signalType: 'signal-ready-playing',
		state: 'playing',
		resyncField: 'play',
	},
	finish: {
		commandType: 'cmd-finish',
		ackType: 'ack-finished',
		signalType: 'signal-ready-finished',
		state: 'finished',
		resyncField: 'finish',
	},
	playMode: {
		commandType: 'cmd-playMode',
		ackType: 'ack-playMode',
		signalType: 'signal-ready-playMode',
		state: 'prepared',     // not used in playMode context (resync doesn't apply)
		resyncField: 'prepare', // not used in playMode context (resync doesn't apply)
	},
};

/**
 * Sync coordination timeout configuration (in milliseconds)
 */
export const SYNC_TIMEOUTS = {
	/** Master waits for slave ACKs before sending signal-ready */
	ackTimeout: 1000,
	/** Slave waits for signal-ready from master after sending ACK */
	signalReadyTimeout: 1000,
	/** Wait at resync target for master command (10 minutes) */
	resyncTargetTimeout: 600000,
	/** Network failure detection - triggers resync if no command received (60 seconds) */
	networkFailureTimeout: 60000,
	/** Cleanup pending ACK tracking state */
	ackCleanupDelay: 2000,
	/** Slave waits for cmd-playMode from master */
	playModeCmdTimeout: 10000,
} as const;
