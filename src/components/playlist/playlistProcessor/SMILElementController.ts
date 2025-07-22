import { debug } from '../tools/generalTools';
import { Synchronization, SyncElementState, SyncMessage, SyncMessageType } from '../../../models/syncModels';
import { getSyncGroup } from '../tools/syncTools';
import { TimedDebugger } from './playlistProcessor';

// Process actions for element state handling
const ProcessAction = {
	CONTINUE: 'CONTINUE', // Exact match - continue playing normally
	RESYNC: 'RESYNC', // Slave behind master - trigger resync to skip elements
	WAIT: 'WAIT', // Keep waiting for correct broadcast
} as const;

type ProcessActionType = typeof ProcessAction[keyof typeof ProcessAction];

/**
 * Tracks acknowledgments from slave devices for synchronized operations
 */
class AckTracker {
	private activeRounds: Map<string, AckRound> = new Map<string, AckRound>();

	/**
	 * Start tracking acknowledgments for a specific operation
	 * @param key Unique identifier for this ACK round (e.g., "region1-5-prepared")
	 * @param expectedCount Number of ACKs expected (excluding master)
	 * @param syncGroup The sync group to listen for ACK messages
	 * @param timeoutMs Timeout in milliseconds (default 500ms)
	 * @returns Promise that resolves to true if all ACKs received, false if timeout
	 */
	public async waitForAcks(
		key: string,
		expectedCount: number,
		syncGroup: any,
		timeoutMs: number = 500,
	): Promise<boolean> {
		debug('Starting ACK tracking for %s, expecting %d ACKs, timeout %dms', key, expectedCount, timeoutMs);

		// If no slaves to wait for, return immediately
		if (expectedCount === 0) {
			debug('No ACKs expected for %s, continuing', key);
			return true;
		}

		// Create new round
		const round = new AckRound(expectedCount);
		this.activeRounds.set(key, round);

		return new Promise<boolean>((resolve) => {
			let resolved = false;
			let unsubscribe: (() => void) | undefined;
			let timeoutId: NodeJS.Timeout | undefined;

			const cleanup = () => {
				resolved = true;
				if (unsubscribe) {
					unsubscribe();
				}
				if (timeoutId) {
					clearTimeout(timeoutId);
				}
				this.cleanupRound(key);
			};

			// Set up timeout
			timeoutId = setTimeout(() => {
				if (resolved) { return; }
				const timeoutMsg = 'ACK timeout for %s - received %d of %d ACKs. Continuing without slow devices.';
				debug(timeoutMsg, key, round.receivedCount, expectedCount);
				console.log(`[SYNC] ${timeoutMsg}`, key, round.receivedCount, expectedCount);
				cleanup();
				resolve(false);
			},                     timeoutMs);

			// Set up active listener for ACK messages
			unsubscribe = syncGroup.onValue(({ key: msgKey, value }: { key: string; value?: any }) => {
				if (resolved) { return; } // Prevent processing after resolution

				if (msgKey === 'sync-coordination' && value) {
					const message = value as SyncMessage;

					// Check if this is an ACK message
					if (message.type === 'ack-prepared' || message.type === 'ack-playing') {
						// Build the ACK key from the message
						const ackKey = `${message.regionName}-${message.syncIndex}-${message.type}`;

						// Check if this ACK is for our round
						if (ackKey === key) {
							debug('Received ACK for %s', key);
							this.recordAck(key);

							// Check if all ACKs received
							if (round.isComplete()) {
								debug('All ACKs received for %s', key);
								cleanup();
								resolve(true);
							}
						}
					}
				}
			});

			// Also listen to the round's promise in case recordAck is called from elsewhere
			round.promise.then((result) => {
				if (!resolved) {
					cleanup();
					resolve(result);
				}
			});
		});
	}

	/**
	 * Adjust expected ACK count for a round (e.g., when peer disconnects)
	 * @param key The round identifier
	 * @param newExpectedCount New expected count
	 */
	public adjustExpectedCount(key: string, newExpectedCount: number): void {
		const round = this.activeRounds.get(key);
		if (!round) {
			debug('Cannot adjust count for unknown round: %s', key);
			return;
		}

		const oldCount = round.expectedCount;
		round.expectedCount = newExpectedCount;
		debug('Adjusted expected ACKs for %s from %d to %d', key, oldCount, newExpectedCount);

		// Check if we've now received all ACKs
		if (round.isComplete()) {
			debug('All ACKs now received after adjustment for %s', key);
			round.resolve(true);
		}
	}

	/**
	 * Record an acknowledgment for a specific round
	 * @param key The round identifier
	 */
	public recordAck(key: string): void {
		const round = this.activeRounds.get(key);
		if (!round) {
			debug('Received ACK for unknown round: %s', key);
			return;
		}

		round.addAck();
		debug('Recorded ACK for %s - %d of %d received', key, round.receivedCount, round.expectedCount);

		if (round.isComplete()) {
			debug('All ACKs received for %s', key);
			round.resolve(true);
		}
	}

	/**
	 * Get the number of active ACK rounds (for debugging/testing)
	 */
	public getActiveRoundCount(): number {
		return this.activeRounds.size;
	}

	/**
	 * Clean up a completed or timed-out round
	 */
	private cleanupRound(key: string): void {
		this.activeRounds.delete(key);
	}
}

/**
 * Represents a single round of ACK collection
 */
class AckRound {
	public receivedCount: number = 0;
	public promise: Promise<boolean>;
	public resolve: (value: boolean) => void = () => { /* placeholder */ };

	constructor(public expectedCount: number) {
		this.promise = new Promise<boolean>((resolve) => {
			this.resolve = resolve;
		});
	}

	public addAck(): void {
		this.receivedCount++;
	}

	public isComplete(): boolean {
		return this.receivedCount >= this.expectedCount;
	}
}

export class SMILElementController {
	private ackTracker: AckTracker = new AckTracker();
	
	// State tracking for sync coordination
	private syncState = {
		slavePosition: {
			prepare: new Map<string, number>(),  // regionName -> syncIndex
			play: new Map<string, number>(),
		},
		masterPosition: {
			prepare: new Map<string, number>(),
			play: new Map<string, number>(),
		},
		pendingAcks: new Set<string>(), // "region-index-state" keys to avoid duplicates
	};

	constructor(private synchronization: Synchronization) {}

	/**
	 * Prepare element for playback - coordinates sync at element boundaries
	 */
	public async prepareElement(regionName: string, syncIndex: number, timedDebug?: TimedDebugger): Promise<boolean> {
		const msg = 'Preparing element for sync: region=%s, syncIndex=%d';
		if (timedDebug) {
			timedDebug.log(msg, regionName, syncIndex);
		} else {
			debug(msg, regionName, syncIndex);
		}

		const syncGroup = getSyncGroup(`${this.synchronization.syncGroupName}-${regionName}-before`);
		if (!syncGroup) {
			const noGroupMsg = 'No sync group found for region: %s';
			if (timedDebug) {
				timedDebug.log(noGroupMsg, regionName);
			} else {
				debug(noGroupMsg, regionName);
			}
			return true; // No sync, continue
		}

		// Coordinate element transition - late joiners will sync here
		return await this.coordinateElementTransition(syncGroup, 'prepared', regionName, syncIndex, timedDebug);
	}

	/**
	 * Check if element should be prepared - handles resync logic for preparation phase
	 */
	public async shouldPrepareElement(
		regionName: string,
		syncIndex: number,
		timedDebug?: TimedDebugger,
	): Promise<boolean> {
		if (!this.synchronization.shouldSync) {
			return true; // No sync, always prepare
		}

		// Check if we're in resync mode for preparation
		if (this.synchronization.syncingInAction && this.synchronization.resyncTargets?.prepare) {
			if (syncIndex < this.synchronization.resyncTargets.prepare) {
				const msg = 'Skipping element preparation during resync: syncIndex=%d, target=%d';
				if (timedDebug) {
					timedDebug.log(msg, syncIndex, this.synchronization.resyncTargets.prepare);
				} else {
					debug(msg, syncIndex, this.synchronization.resyncTargets.prepare);
				}
				return false; // Skip preparation
			} else if (syncIndex === this.synchronization.resyncTargets.prepare) {
				const msg = 'Reached resync target during preparation: region=%s, syncIndex=%d';
				if (timedDebug) {
					timedDebug.log(msg, regionName, syncIndex);
				} else {
					debug(msg, regionName, syncIndex);
				}
				console.log(`[SYNC] Reached prepare target at index ${syncIndex} - resuming normal sync`);
				// Clear prepare target
				delete this.synchronization.resyncTargets.prepare;
				// Clear syncingInAction only if no other targets remain
				if (!this.synchronization.resyncTargets?.play) {
					this.synchronization.syncingInAction = false;
					const clearMsg = 'All resync targets cleared - exiting resync mode';
					if (timedDebug) {
						timedDebug.log(clearMsg);
					} else {
						debug(clearMsg);
					}
				}
				// Continue with normal preparation
			}
		}

		// Coordinate preparation with other devices
		const shouldContinue = await this.prepareElement(regionName, syncIndex, timedDebug);
		// If preparation triggered resync, we should skip
		if (!shouldContinue) {
			const skipMsg = 'Preparation coordination triggered resync - skip element';
			if (timedDebug) {
				timedDebug.log(skipMsg);
			} else {
				debug(skipMsg);
			}
			return false;
		}
		return true;
	}

	/**
	 * Check if element should be played - handles resync logic for playback phase
	 */
	public async shouldPlayElement(
		regionName: string,
		syncIndex: number,
		timedDebug?: TimedDebugger,
	): Promise<boolean> {
		if (!this.synchronization.shouldSync) {
			return true; // No sync needed
		}

		// Check if we're in resync mode for playing
		if (this.synchronization.syncingInAction && this.synchronization.resyncTargets?.play) {
			if (syncIndex < this.synchronization.resyncTargets.play) {
				const msg = 'Skipping element playback during resync: syncIndex=%d, target=%d';
				if (timedDebug) {
					timedDebug.log(msg, syncIndex, this.synchronization.resyncTargets.play);
				} else {
					debug(msg, syncIndex, this.synchronization.resyncTargets.play);
				}
				return false; // Skip this element
			} else if (syncIndex === this.synchronization.resyncTargets.play) {
				const msg = 'Reached resync target during playback: region=%s, syncIndex=%d';
				if (timedDebug) {
					timedDebug.log(msg, regionName, syncIndex);
				} else {
					debug(msg, regionName, syncIndex);
				}
				console.log(`[SYNC] Reached play target at index ${syncIndex} - resuming normal sync`);
				// Clear play target
				delete this.synchronization.resyncTargets.play;
				// Clear syncingInAction only if no other targets remain
				if (!this.synchronization.resyncTargets?.prepare) {
					this.synchronization.syncingInAction = false;
					const clearMsg = 'All resync targets cleared - exiting resync mode';
					if (timedDebug) {
						timedDebug.log(clearMsg);
					} else {
						debug(clearMsg);
					}
				}
				// Continue with normal sync
			}
		}

		// Normal sync flow
		return await this.shouldStartPlayback(regionName, syncIndex, timedDebug);
	}

	/**
	 * Check if element should start playback - replaces handleElementSynchronization
	 */
	public async shouldStartPlayback(
		regionName: string,
		syncIndex: number,
		timedDebug?: TimedDebugger,
	): Promise<boolean> {
		const msg = 'Checking if should start playback: region=%s, syncIndex=%d';
		if (timedDebug) {
			timedDebug.log(msg, regionName, syncIndex);
		} else {
			debug(msg, regionName, syncIndex);
		}

		const syncGroup = getSyncGroup(`${this.synchronization.syncGroupName}-${regionName}-before`);
		if (!syncGroup) {
			const noGroupMsg = 'No sync group found for region: %s';
			if (timedDebug) {
				timedDebug.log(noGroupMsg, regionName);
			} else {
				debug(noGroupMsg, regionName);
			}
			return true;
		}

		// Coordinate playback start
		return await this.coordinateElementTransition(syncGroup, 'playing', regionName, syncIndex, timedDebug);
	}

	/**
	 * Mark element as finished - clean up sync state
	 */
	public async markElementFinished(regionName: string, syncIndex: number, timedDebug?: TimedDebugger): Promise<void> {
		if (!this.synchronization.shouldSync) {
			return; // No-op for non-sync playlists
		}

		const msg = 'Marking element as finished: region=%s, syncIndex=%d';
		if (timedDebug) {
			timedDebug.log(msg, regionName, syncIndex);
		} else {
			debug(msg, regionName, syncIndex);
		}

		// Broadcast finished state if master
		const isMaster = await this.isMaster(regionName);
		if (isMaster) {
			await this.broadcastState('finished', regionName, syncIndex, timedDebug);
		}
	}

	/**
	 * Coordinate the start of element preparation
	 * Master broadcasts cmd-prepare, slaves wait for it
	 */
	public async coordinatePrepareStart(
		regionName: string,
		syncIndex: number,
		timedDebug?: TimedDebugger,
	): Promise<void> {
		if (!this.synchronization.shouldSync) {
			return; // No sync needed
		}

		const syncGroup = getSyncGroup(`${this.synchronization.syncGroupName}-${regionName}-before`);
		if (!syncGroup) {
			debug('No sync group for prepare start: region=%s', regionName);
			return;
		}

		const isMaster = await syncGroup.isMaster();
		if (isMaster) {
			// Master broadcasts prepare command
			await this.broadcastSyncMessage('cmd-prepare', regionName, syncIndex, syncGroup);
			const msg = 'Master sent cmd-prepare for region=%s, syncIndex=%d';
			if (timedDebug) {
				timedDebug.log(msg, regionName, syncIndex);
			} else {
				debug(msg, regionName, syncIndex);
			}
		} else {
			// Slave waits for cmd-prepare from master
			const waitMsg = 'Slave waiting for cmd-prepare from master for region=%s, syncIndex=%d';
			if (timedDebug) {
				timedDebug.log(waitMsg, regionName, syncIndex);
			} else {
				debug(waitMsg, regionName, syncIndex);
			}

			await this.waitForPrepareCommand(regionName, syncIndex, syncGroup, timedDebug);

			const readyMsg = 'Slave received cmd-prepare, starting preparation for region=%s, syncIndex=%d';
			if (timedDebug) {
				timedDebug.log(readyMsg, regionName, syncIndex);
			} else {
				debug(readyMsg, regionName, syncIndex);
			}
		}
	}

	/**
	 * Coordinate the completion of element preparation
	 * Slaves send ack-prepared, master waits for all ACKs
	 */
	public async coordinatePrepareComplete(
		regionName: string,
		syncIndex: number,
		timedDebug?: TimedDebugger,
	): Promise<void> {
		if (!this.synchronization.shouldSync) {
			return; // No sync needed
		}

		const syncGroup = getSyncGroup(`${this.synchronization.syncGroupName}-${regionName}-before`);
		if (!syncGroup) {
			debug('No sync group for prepare complete: region=%s', regionName);
			return;
		}

		const isMaster = await syncGroup.isMaster();
		if (isMaster) {
			// Master waits for ACKs
			const expectedAcks = syncGroup.getConnectedPeersCount() - 1; // Exclude master itself
			if (expectedAcks > 0) {
				const ackKey = `${regionName}-${syncIndex}-ack-prepared`;
				const msg = 'Master waiting for %d prepared ACKs for %s';
				if (timedDebug) {
					timedDebug.log(msg, expectedAcks, ackKey);
				} else {
					debug(msg, expectedAcks, ackKey);
				}

				const acksReceived = await this.ackTracker.waitForAcks(ackKey, expectedAcks, syncGroup, 500);
				const resultMsg = acksReceived
					? 'Master received all prepared ACKs for %s'
					: 'Master timeout waiting for prepared ACKs for %s';
				if (timedDebug) {
					timedDebug.log(resultMsg, ackKey);
				} else {
					debug(resultMsg, ackKey);
				}
			}

			// Master sends ready signal
			await this.broadcastSyncMessage('signal-ready', regionName, syncIndex, syncGroup);
		} else {
			// Slave sends ACK
			await this.broadcastSyncMessage('ack-prepared', regionName, syncIndex, syncGroup);
			const msg = 'Slave sent ack-prepared for region=%s, syncIndex=%d';
			if (timedDebug) {
				timedDebug.log(msg, regionName, syncIndex);
			} else {
				debug(msg, regionName, syncIndex);
			}

			// Wait for signal-ready from master
			const waitMsg = 'Slave waiting for signal-ready from master for region=%s, syncIndex=%d';
			if (timedDebug) {
				timedDebug.log(waitMsg, regionName, syncIndex);
			} else {
				debug(waitMsg, regionName, syncIndex);
			}

			await this.waitForSignalReady(regionName, syncIndex, syncGroup, timedDebug);
			const readyMsg = 'Slave received signal-ready, continuing for region=%s, syncIndex=%d';
			if (timedDebug) {
				timedDebug.log(readyMsg, regionName, syncIndex);
			} else {
				debug(readyMsg, regionName, syncIndex);
			}
		}
	}

	/**
	 * Coordinate the start of element playing
	 * Master broadcasts cmd-play, slaves wait for it
	 */
	public async coordinatePlayStart(regionName: string, syncIndex: number, timedDebug?: TimedDebugger): Promise<void> {
		if (!this.synchronization.shouldSync) {
			return; // No sync needed
		}

		const syncGroup = getSyncGroup(`${this.synchronization.syncGroupName}-${regionName}-before`);
		if (!syncGroup) {
			debug('No sync group for play start: region=%s', regionName);
			return;
		}

		const isMaster = await syncGroup.isMaster();
		if (isMaster) {
			// Master broadcasts play command
			await this.broadcastSyncMessage('cmd-play', regionName, syncIndex, syncGroup);
			const msg = 'Master sent cmd-play for region=%s, syncIndex=%d';
			if (timedDebug) {
				timedDebug.log(msg, regionName, syncIndex);
			} else {
				debug(msg, regionName, syncIndex);
			}
		} else {
			// Slaves will receive cmd-play through message routing
			const msg = 'Slave ready to receive cmd-play for region=%s, syncIndex=%d';
			if (timedDebug) {
				timedDebug.log(msg, regionName, syncIndex);
			} else {
				debug(msg, regionName, syncIndex);
			}
		}
	}

	/**
	 * Coordinate the completion of element play start
	 * Slaves send ack-playing, master waits for all ACKs
	 */
	public async coordinatePlayComplete(
		regionName: string,
		syncIndex: number,
		timedDebug?: TimedDebugger,
	): Promise<void> {
		if (!this.synchronization.shouldSync) {
			return; // No sync needed
		}

		const syncGroup = getSyncGroup(`${this.synchronization.syncGroupName}-${regionName}-before`);
		if (!syncGroup) {
			debug('No sync group for play complete: region=%s', regionName);
			return;
		}

		const isMaster = await syncGroup.isMaster();
		if (isMaster) {
			// Master waits for ACKs
			const expectedAcks = syncGroup.getConnectedPeersCount() - 1; // Exclude master itself
			if (expectedAcks > 0) {
				const ackKey = `${regionName}-${syncIndex}-ack-playing`;
				const msg = 'Master waiting for %d playing ACKs for %s';
				if (timedDebug) {
					timedDebug.log(msg, expectedAcks, ackKey);
				} else {
					debug(msg, expectedAcks, ackKey);
				}

				const acksReceived = await this.ackTracker.waitForAcks(ackKey, expectedAcks, syncGroup, 500);
				const resultMsg = acksReceived
					? 'Master received all playing ACKs for %s'
					: 'Master timeout waiting for playing ACKs for %s';
				if (timedDebug) {
					timedDebug.log(resultMsg, ackKey);
				} else {
					debug(resultMsg, ackKey);
				}
			}
		} else {
			// Slave sends ACK
			await this.broadcastSyncMessage('ack-playing', regionName, syncIndex, syncGroup);
			const msg = 'Slave sent ack-playing for region=%s, syncIndex=%d';
			if (timedDebug) {
				timedDebug.log(msg, regionName, syncIndex);
			} else {
				debug(msg, regionName, syncIndex);
			}
		}
	}

	/**
	 * Coordinate element state transition across devices
	 */
	private async coordinateElementTransition(
		syncGroup: any,
		state: SyncElementState,
		regionName: string,
		syncIndex: number,
		timedDebug?: TimedDebugger,
	): Promise<boolean> {
		const isMaster = await syncGroup.isMaster();

		if (isMaster) {
			const masterMsg = 'Master coordinating %s state for region=%s, syncIndex=%d';
			if (timedDebug) {
				timedDebug.log(masterMsg, state, regionName, syncIndex);
			} else {
				debug(masterMsg, state, regionName, syncIndex);
			}

			// Broadcast state first
			await this.broadcastState(state, regionName, syncIndex, timedDebug);

			// Wait for ACKs from slaves
			let expectedAcks = syncGroup.getConnectedPeersCount() - 1; // Exclude master itself
			if (expectedAcks > 0 && (state === 'prepared' || state === 'playing')) {
				const ackType = state === 'prepared' ? 'ack-prepared' : 'ack-playing';
				const ackKey = `${regionName}-${syncIndex}-${ackType}`;

				const ackMsg = 'Master waiting for %d ACKs for %s';
				if (timedDebug) {
					timedDebug.log(ackMsg, expectedAcks, ackKey);
				} else {
					debug(ackMsg, expectedAcks, ackKey);
				}

				// Monitor peer changes during ACK wait
				let currentPeerCount = expectedAcks;
				const unsubscribe = syncGroup.onStatus((peers: string[]) => {
					const newCount = peers.length;
					if (newCount < currentPeerCount) {
						debug(
							'Peer disconnected during ACK wait. Adjusting expected count from %d to %d',
							currentPeerCount,
							newCount,
						);
						this.ackTracker.adjustExpectedCount(ackKey, newCount);
						currentPeerCount = newCount;
					}
				});

				try {
					const acksReceived = await this.ackTracker.waitForAcks(ackKey, expectedAcks, syncGroup, 500);

					const ackResultMsg = acksReceived
						? 'Master received all ACKs for %s'
						: 'Master timeout waiting for ACKs for %s';
					if (timedDebug) {
						timedDebug.log(ackResultMsg, ackKey);
					} else {
						debug(ackResultMsg, ackKey);
					}
				} finally {
					// Always unsubscribe from peer monitoring
					unsubscribe();
				}
			}

			return true; // Master always continues
		} else {
			const slaveMsg = 'Slave waiting for %s state for region=%s, syncIndex=%d';
			if (timedDebug) {
				timedDebug.log(slaveMsg, state, regionName, syncIndex);
			} else {
				debug(slaveMsg, state, regionName, syncIndex);
			}
			console.log('master state resolve', Date.now());
			const shouldContinue = await this.waitForMasterState(syncGroup, state, regionName, syncIndex, timedDebug);
			console.log('master state resolved', Date.now());

			// Send ACK after receiving state broadcast (hybrid mode for Step 4)
			if (shouldContinue && state === 'prepared') {
				await this.broadcastSyncMessage('ack-prepared', regionName, syncIndex, syncGroup);
				debug('Slave sent ACK after prepared state broadcast: region=%s, syncIndex=%d', regionName, syncIndex);
			} else if (shouldContinue && state === 'playing') {
				await this.broadcastSyncMessage('ack-playing', regionName, syncIndex, syncGroup);
				debug('Slave sent ACK after playing state broadcast: region=%s, syncIndex=%d', regionName, syncIndex);
			}

			// Note: Late-joining devices will use the existing resync mechanism
			// They will receive state broadcasts and detect they are behind

			return shouldContinue;
		}
	}

	/**
	 * Broadcast state to sync group (master only)
	 */
	private async broadcastState(
		state: SyncElementState,
		regionName: string,
		syncIndex: number,
		timedDebug?: TimedDebugger,
	): Promise<void> {
		const syncGroup = getSyncGroup(`${this.synchronization.syncGroupName}-${regionName}-before`);
		if (!syncGroup) { return; }

		await syncGroup.broadcastValue('elementState', {
			state,
			regionName,
			syncIndex,
			timestamp: Date.now(),
		});

		const msg = 'Broadcasted state: %s for region=%s, syncIndex=%d';
		if (timedDebug) {
			timedDebug.log(msg, state, regionName, syncIndex);
		} else {
			debug(msg, state, regionName, syncIndex);
		}
	}

	/**
	 * Process element state value and determine action
	 * Returns action to take based on the broadcast:
	 * - CONTINUE: Exact match found, continue playing normally
	 * - RESYNC: Slave is behind master, trigger resync to skip elements
	 * - WAIT: Keep waiting for the correct broadcast
	 */
	private processElementState(
		value: any,
		expectedState: SyncElementState,
		syncIndex: number,
		regionName: string,
	): ProcessActionType {
		// Log broadcast being processed
		debug(
			'Processing broadcast: state=%s, syncIndex=%d, timestamp=%d for region=%s (waiting for state=%s, syncIndex=%d)',
			value.state,
			value.syncIndex,
			value.timestamp,
			regionName,
			expectedState,
			syncIndex,
		);

		if (value.state === expectedState && value.syncIndex === syncIndex) {
			// Normal case: exact match
			debug('Received expected state: %s for region=%s, syncIndex=%d', expectedState, regionName, syncIndex);
			return ProcessAction.CONTINUE; // In sync, continue normally
		} else if (expectedState === 'prepared' && value.state === 'playing' && value.syncIndex > syncIndex) {
			// Special case: We're waiting for 'prepared' but master is already playing a future element
			// This means we missed our chance to prepare and need to catch up
			debug(
				'Waiting for prepared but master playing future element - need resync. Master playing %d, we waiting at %d',
				value.syncIndex,
				syncIndex,
			);

			// Set target to prepare for the NEXT element after what master is playing
			const maxIndex = this.synchronization.maxSyncIndexPerRegion?.[regionName];
			let nextIndex: number;

			if (maxIndex !== undefined && value.syncIndex >= maxIndex) {
				console.log('reseting index');
				// Master playing last element, we'll prepare first element
				nextIndex = 1;
			} else {
				console.log('increasing index');
				// Prepare next element after what master is playing
				nextIndex = value.syncIndex + 1;
			}

			// Set state-specific resync target for preparation
			if (!this.synchronization.resyncTargets) {
				this.synchronization.resyncTargets = {};
			}
			this.synchronization.resyncTargets.prepare = nextIndex;
			this.synchronization.syncingInAction = true;
			debug(
				'Setting resync target for preparation: region=%s, targetIndex=%d (master playing %d)',
				regionName,
				nextIndex,
				value.syncIndex,
			);
			console.log(`[SYNC] Slave needs to resync - waiting for prepared at index ${nextIndex}`);
			debug('Returning false from waitForMasterState to trigger element skip');
			return ProcessAction.RESYNC; // Trigger resync - skip current element
		} else if (value.state === expectedState && value.syncIndex > syncIndex) {
			// Master ahead with same state
			debug('Master ahead - need resync. Master at %d, we are at %d', value.syncIndex, syncIndex);

			// Handle wraparound for playlist looping
			const maxIndex = this.synchronization.maxSyncIndexPerRegion?.[regionName];
			let nextIndex: number;

			if (maxIndex !== undefined && value.syncIndex >= maxIndex) {
				console.log('reseting index');
				// Master is at last element, wrap to beginning (1)
				nextIndex = 1;
			} else {
				// Normal case: increment
				console.log('increasing index');
				nextIndex = value.syncIndex + 1;
			}

			// Set state-specific resync target based on expected state
			if (!this.synchronization.resyncTargets) {
				this.synchronization.resyncTargets = {};
			}

			// Determine which target to set based on what state we're waiting for
			if (expectedState === 'prepared') {
				this.synchronization.resyncTargets.prepare = nextIndex;
				debug(
					'Setting resync target for PREPARE: region=%s, targetIndex=%d (master at %d)',
					regionName,
					nextIndex,
					value.syncIndex,
				);
			} else if (expectedState === 'playing') {
				this.synchronization.resyncTargets.play = nextIndex;
				debug(
					'Setting resync target for PLAY: region=%s, targetIndex=%d (master at %d)',
					regionName,
					nextIndex,
					value.syncIndex,
				);
			}

			this.synchronization.syncingInAction = true;
			console.log(`[SYNC] Master ahead - resync to ${expectedState} at index ${nextIndex}`);
			return ProcessAction.RESYNC; // Trigger resync - skip current element
		} else if (value.syncIndex < syncIndex) {
			// Slave is ahead of master - wait for master to catch up
			debug(
				'Slave ahead of master - slave waiting for syncIndex=%d, master at syncIndex=%d for region=%s',
				syncIndex,
				value.syncIndex,
				regionName,
			);
			return ProcessAction.WAIT; // Keep waiting for correct broadcast
		} else if (value.syncIndex === syncIndex && value.state !== expectedState) {
			// Same element but different state
			// Determine if we're ahead or behind based on state progression
			const stateOrder: SyncElementState[] = ['prepared', 'playing', 'finished'];
			const expectedIndex = stateOrder.indexOf(expectedState);
			const receivedIndex = stateOrder.indexOf(value.state);

			if (receivedIndex > expectedIndex) {
				// We're behind (e.g., we expect 'prepared' but master is at 'playing')
				debug(
					'Behind in state progression - expected %s but master at %s for syncIndex=%d',
					expectedState,
					value.state,
					syncIndex,
				);

				// Handle wraparound for playlist looping
				const maxIndex = this.synchronization.maxSyncIndexPerRegion?.[regionName];
				let nextIndex: number;

				if (maxIndex !== undefined && syncIndex >= maxIndex) {
					console.log('reseting index');
					// At last element, wrap to beginning (1)
					nextIndex = 1;
				} else {
					console.log('increasing index');
					// Normal case: increment
					nextIndex = syncIndex + 1;
				}

				// Set state-specific resync target for preparation
				if (!this.synchronization.resyncTargets) {
					this.synchronization.resyncTargets = {};
				}
				// When behind in state progression, we need to prepare the next element
				this.synchronization.resyncTargets.prepare = nextIndex;
				this.synchronization.syncingInAction = true;
				debug(
					'Setting resync target due to state mismatch: region=%s, targetIndex=%d (behind in state progression)',
					regionName,
					nextIndex,
				);
				console.log(`[SYNC] Behind in state - resync to prepare at index ${nextIndex}`);
			} else {
				// We're ahead (e.g., we expect 'playing' but master is at 'prepared')
				debug(
					'Ahead in state progression - expected %s but master at %s for syncIndex=%d',
					expectedState,
					value.state,
					syncIndex,
				);
				// Wait for master to catch up - don't set resync flags
			}
			return receivedIndex <= expectedIndex ? ProcessAction.WAIT : ProcessAction.RESYNC;
		}

		// State doesn't match any condition - keep waiting
		return ProcessAction.WAIT;
	}

	/**
	 * Wait for master state broadcast (slave only)
	 */
	private async waitForMasterState(
		syncGroup: any,
		expectedState: SyncElementState,
		regionName: string,
		syncIndex: number,
		timedDebug?: TimedDebugger,
	): Promise<boolean> {
		console.log('waiting for master state with syncIndex', syncIndex, expectedState);

		// Check for stored state first - look for exact match
		const exactMatch = syncGroup.getElementState(regionName, syncIndex, expectedState);
		if (exactMatch) {
			const age = Date.now() - exactMatch.timestamp;

			// Check freshness (2 seconds)
			if (age < 2000) {
				debug(
					'Found exact match in stored state for region=%s, syncIndex=%d, state=%s, age=%dms',
					regionName,
					syncIndex,
					expectedState,
					age,
				);

				// Process the exact match to determine action (should always be CONTINUE)
				const action = this.processElementState(exactMatch, expectedState, syncIndex, regionName);

				// Handle action (for exact match, we expect CONTINUE)
				if (action === ProcessAction.CONTINUE) {
					// Clear this specific state and continue
					syncGroup.clearElementState(regionName, syncIndex, expectedState);
					debug('Cleared consumed elementState - continuing normally');
					return true;
				} else {
					// Unexpected action for exact match
					debug('Unexpected action %s for exact match - treating as WAIT', action);
					// Fall through to check other states or set up listener
				}
			} else {
				debug('Stored state too old (age=%dms > 2000ms), ignoring', age);
			}
		}

		// No exact match - check if there's another state for this syncIndex
		const anyStateForIndex = syncGroup.findElementStateByIndex(regionName, syncIndex);
		if (anyStateForIndex) {
			const age = Date.now() - anyStateForIndex.timestamp;

			// Check freshness (2 seconds)
			if (age < 2000) {
				debug(
					'Found different state for same syncIndex: expected=%s, found=%s for region=%s, syncIndex=%d',
					expectedState,
					anyStateForIndex.state,
					regionName,
					syncIndex,
				);

				// Process with the found state to determine resync
				const action = this.processElementState(anyStateForIndex, expectedState, syncIndex, regionName);

				// For non-exact matches, we expect RESYNC action
				if (action === ProcessAction.RESYNC) {
					// Don't clear the found state - it might be needed later
					debug('Triggering resync - not clearing found state');
					return false;
				}
			}
		}

		// No valid stored state, set up listener
		return new Promise((resolve) => {
			let resolved = false;
			let unsubscribe: (() => void) | null = null;
			let unsubscribeMasterChange: (() => void) | null = null;

			const cleanup = () => {
				if (resolved) { return; }
				resolved = true;
				clearTimeout(timeout);
				if (unsubscribe) {
					debug('Cleaning up event listener for region=%s', regionName);
					unsubscribe();
					unsubscribe = null;
				}
				if (unsubscribeMasterChange) {
					debug('Cleaning up master change listener for region=%s', regionName);
					unsubscribeMasterChange();
					unsubscribeMasterChange = null;
				}
			};

			const timeout = setTimeout(() => {
				const timeoutMsg = 'Timeout waiting for state: %s, syncIndex=%d, region=%s';
				if (timedDebug) {
					timedDebug.log(timeoutMsg, expectedState, syncIndex, regionName);
				} else {
					debug(timeoutMsg, expectedState, syncIndex, regionName);
				}
				console.log(
					`[SYNC] Timeout waiting for ${expectedState} state at syncIndex ${syncIndex} for region ${regionName} - continuing independently`,
				);
				cleanup();
				resolve(true); // Continue on timeout to avoid blocking
			},                         90000); // 90 second timeout

			// Monitor master changes
			unsubscribeMasterChange = syncGroup.onMasterChange((isMaster: boolean) => {
				if (resolved) { return; } // Prevent processing after resolution

				if (isMaster) {
					// This device became master while waiting
					debug(
						'Slave became master while waiting for state=%s, syncIndex=%d, region=%s',
						expectedState,
						syncIndex,
						regionName,
					);
					console.log(`[SYNC] Device became master while waiting - continuing playback`);
					cleanup();
					resolve(true); // Continue playback as new master
				} else {
					// Another device became master
					debug(
						'Master changed to another device while waiting for state=%s, syncIndex=%d, region=%s',
						expectedState,
						syncIndex,
						regionName,
					);
					// Continue waiting for new master's broadcast
				}
			});

			unsubscribe = syncGroup.onValue(({ key, value }: { key: string; value?: any }) => {
				if (resolved) { return; } // Prevent processing after resolution
				console.log('Received value in syncGroup', value);
				console.log('---------------------------------------------------');
				if (key === 'elementState' && value?.regionName === regionName) {
					const action = this.processElementState(value, expectedState, syncIndex, regionName);

					// Handle action based on type
					switch (action) {
						case ProcessAction.CONTINUE:
							// Clear this specific consumed state and resolve
							syncGroup.clearElementState(regionName, syncIndex, expectedState);
							debug(`Cleared consumed elementState - continuing normally`);
							cleanup();
							resolve(true);
							break;
						case ProcessAction.RESYNC:
							// Don't clear on resync - the state might be needed
							debug(`Triggering resync - not clearing state`);
							cleanup();
							resolve(false);
							break;
						case ProcessAction.WAIT:
							// Don't resolve, keep waiting
							debug('Ignoring broadcast - waiting for correct state/syncIndex');
							break;
						default:
							// Should never happen as ProcessAction is exhaustive
							debug('Unknown process action: %s', action);
							break;
					}
				}
			});
		});
	}

	/**
	 * Check if this device is master for given region
	 */
	private async isMaster(regionName: string): Promise<boolean> {
		const syncGroup = getSyncGroup(`${this.synchronization.syncGroupName}-${regionName}-before`);
		if (!syncGroup) { return false; }

		return await syncGroup.isMaster();
	}

	/**
	 * Broadcast a sync coordination message (commands or ACKs)
	 */
	private async broadcastSyncMessage(
		type: SyncMessageType,
		regionName: string,
		syncIndex: number,
		syncGroup?: any,
	): Promise<void> {
		const message: SyncMessage = {
			type,
			regionName,
			syncIndex,
			timestamp: Date.now(),
		};

		// Use provided sync group or get it
		const group = syncGroup || getSyncGroup(`${this.synchronization.syncGroupName}-${regionName}-before`);
		if (!group) {
			debug('No sync group to broadcast to for region: %s', regionName);
			return;
		}

		await group.broadcastValue('sync-coordination', message);
		debug('Broadcasted sync message: type=%s, region=%s, syncIndex=%d', type, regionName, syncIndex);
	}

	/**
	 * Unified method to wait for commands and check sync status
	 * Handles both cmd-prepare/cmd-play and elementState broadcasts
	 * Returns action to take: CONTINUE, RESYNC, or keeps waiting if WAIT
	 */
	private async waitForCommandAndCheckSync(
		commandType: 'cmd-prepare' | 'cmd-play',
		expectedState: 'prepared' | 'playing',
		regionName: string,
		syncIndex: number,
		syncGroup: any,
		timedDebug?: TimedDebugger,
	): Promise<ProcessActionType> {
		// Update slave position tracking
		this.updateSlavePosition(regionName, syncIndex, expectedState);
		
		// Log current positions for debugging
		const positions = this.getPositions(regionName, expectedState);
		debug('Current sync positions for %s %s: slave=%d, master=%d', 
			regionName, expectedState, positions.slave, positions.master);
		
		// Check for stored command message first
		const storedMsg = syncGroup.getSyncCoordinationMessage(commandType, regionName, syncIndex);
		if (storedMsg) {
			const age = Date.now() - storedMsg.timestamp;
			if (age < 2000) {
				// Create virtual elementState from stored command
				const virtualElementState = {
					state: expectedState,
					regionName: storedMsg.regionName,
					syncIndex: storedMsg.syncIndex,
					timestamp: storedMsg.timestamp,
				};
				
				// Use processElementState to determine action
				const action = this.processElementState(virtualElementState, expectedState, syncIndex, regionName);
				
				if (action !== ProcessAction.WAIT) {
					// Clear consumed message
					syncGroup.clearSyncCoordinationMessage(commandType, regionName, syncIndex);
					return action;
				}
			}
		}

		// Check for stored elementState
		const storedState = syncGroup.findElementStateByIndex(regionName, syncIndex);
		if (storedState) {
			const age = Date.now() - storedState.timestamp;
			if (age < 2000) {
				const action = this.processElementState(storedState, expectedState, syncIndex, regionName);
				if (action === ProcessAction.RESYNC) {
					return action;
				}
			}
		}

		// Create promise with active listener
		return new Promise<ProcessActionType>((resolve) => {
			let resolved = false;
			let unsubscribe: (() => void) | undefined;
			let timeoutId: NodeJS.Timeout | undefined;

			const cleanup = () => {
				resolved = true;
				if (unsubscribe) {
					unsubscribe();
				}
				if (timeoutId) {
					clearTimeout(timeoutId);
				}
			};

			// Set up timeout
			timeoutId = setTimeout(() => {
				if (resolved) { return; }
				const timeoutMsg = `Timeout waiting for ${commandType} from master for region=${regionName}, syncIndex=${syncIndex}`;
				if (timedDebug) {
					timedDebug.log(timeoutMsg);
				} else {
					debug(timeoutMsg);
				}
				cleanup();
				resolve(ProcessAction.CONTINUE);
			}, 500);

			// Set up active listener for both message types
			unsubscribe = syncGroup.onValue(({ key, value }: { key: string; value?: any }) => {
				if (resolved) { return; }

				// Handle sync-coordination messages (commands and ACKs)
				if (key === 'sync-coordination' && value) {
					const message = value as SyncMessage;
					
					// Check if this is a command message for our region
					if (message.type === commandType && message.regionName === regionName) {
						// Update master position tracking
						this.updateMasterPosition(regionName, message.syncIndex, expectedState);
						
						// Create virtual elementState from command
						const virtualElementState = {
							state: expectedState,
							regionName: message.regionName,
							syncIndex: message.syncIndex,
							timestamp: message.timestamp,
						};
						
						// Use processElementState to determine action
						const action = this.processElementState(virtualElementState, expectedState, syncIndex, regionName);
						
						switch (action) {
							case ProcessAction.CONTINUE:
								// Exact match - we got our command
								const msg = `Received ${commandType} for region=${regionName}, syncIndex=${syncIndex}`;
								if (timedDebug) {
									timedDebug.log(msg);
								} else {
									debug(msg);
								}
								// Clear consumed message
								syncGroup.clearSyncCoordinationMessage(commandType, regionName, syncIndex);
								cleanup();
								resolve(ProcessAction.CONTINUE);
								break;
								
							case ProcessAction.RESYNC:
								// We're behind - resync flags already set by processElementState
								debug(`Detected resync needed while waiting for ${commandType}`);
								cleanup();
								resolve(ProcessAction.RESYNC);
								break;
								
							case ProcessAction.WAIT:
								// We're ahead - send ACK for master's position but keep waiting
								debug(`Slave ahead at ${syncIndex}, master at ${message.syncIndex} - sending ACK and waiting`);
								this.sendAckForPosition(regionName, message.syncIndex, expectedState, syncGroup);
								// Don't resolve - keep listening
								break;
						}
					}
				}
				
				// Handle elementState broadcasts
				else if (key === 'elementState' && value?.regionName === regionName) {
					// Update master position from elementState
					this.updateMasterPosition(regionName, value.syncIndex, value.state);
					
					// Direct use of processElementState
					const action = this.processElementState(value, expectedState, syncIndex, regionName);
					
					switch (action) {
						case ProcessAction.CONTINUE:
							// This would be unusual - we're waiting for command not state
							debug('Received matching elementState while waiting for command');
							break;
							
						case ProcessAction.RESYNC:
							// Behind - resync flags set by processElementState
							debug('Detected resync needed from elementState broadcast');
							cleanup();
							resolve(ProcessAction.RESYNC);
							break;
							
						case ProcessAction.WAIT:
							// Ahead - keep waiting
							debug('Slave ahead based on elementState - continuing to wait');
							break;
					}
				}
			});
		});
	}

	/**
	 * Send ACK for a specific position (used when slave is ahead)
	 */
	private async sendAckForPosition(
		regionName: string,
		syncIndex: number,
		state: 'prepared' | 'playing',
		syncGroup: any,
	): Promise<void> {
		const ackType = state === 'prepared' ? 'ack-prepared' : 'ack-playing';
		const ackKey = `${regionName}-${syncIndex}-${ackType}`;
		
		// Avoid duplicate ACKs
		if (!this.syncState.pendingAcks.has(ackKey)) {
			this.syncState.pendingAcks.add(ackKey);
			
			await this.broadcastSyncMessage(ackType, regionName, syncIndex, syncGroup);
			debug('Sent ACK for master position %d while slave at different position', syncIndex);
			
			// Clean up after a delay
			setTimeout(() => {
				this.syncState.pendingAcks.delete(ackKey);
			}, 2000);
		}
	}

	/**
	 * Update slave position tracking
	 */
	private updateSlavePosition(regionName: string, syncIndex: number, state: 'prepared' | 'playing'): void {
		if (state === 'prepared') {
			this.syncState.slavePosition.prepare.set(regionName, syncIndex);
			debug('Updated slave prepare position: region=%s, syncIndex=%d', regionName, syncIndex);
		} else if (state === 'playing') {
			this.syncState.slavePosition.play.set(regionName, syncIndex);
			debug('Updated slave play position: region=%s, syncIndex=%d', regionName, syncIndex);
		}
	}

	/**
	 * Update master position tracking
	 */
	private updateMasterPosition(regionName: string, syncIndex: number, state: 'prepared' | 'playing'): void {
		const currentPos = state === 'prepared' 
			? this.syncState.masterPosition.prepare.get(regionName) || 0
			: this.syncState.masterPosition.play.get(regionName) || 0;
		
		// Only update if the new position is higher (master moving forward)
		if (syncIndex > currentPos) {
			if (state === 'prepared') {
				this.syncState.masterPosition.prepare.set(regionName, syncIndex);
				debug('Updated master prepare position: region=%s, syncIndex=%d', regionName, syncIndex);
			} else {
				this.syncState.masterPosition.play.set(regionName, syncIndex);
				debug('Updated master play position: region=%s, syncIndex=%d', regionName, syncIndex);
			}
		}
	}

	/**
	 * Get current positions for debugging
	 */
	private getPositions(regionName: string, state: 'prepared' | 'playing'): { slave: number; master: number } {
		const slavePos = state === 'prepared'
			? this.syncState.slavePosition.prepare.get(regionName) || 0
			: this.syncState.slavePosition.play.get(regionName) || 0;
		
		const masterPos = state === 'prepared'
			? this.syncState.masterPosition.prepare.get(regionName) || 0
			: this.syncState.masterPosition.play.get(regionName) || 0;
			
		return { slave: slavePos, master: masterPos };
	}

	/**
	 * Wait for cmd-prepare message from master (slaves only)
	 */
	private async waitForPrepareCommand(
		regionName: string,
		syncIndex: number,
		syncGroup: any,
		timedDebug?: TimedDebugger,
	): Promise<void> {
		// Check for stored message first
		const storedMsg = syncGroup.getSyncCoordinationMessage('cmd-prepare', regionName, syncIndex);
		if (storedMsg) {
			const age = Date.now() - storedMsg.timestamp;
			if (age < 2000) {
				// 2 seconds freshness
				const msg = 'Found stored cmd-prepare for region=%s, syncIndex=%d, age=%dms';
				if (timedDebug) {
					timedDebug.log(msg, regionName, syncIndex, age);
				} else {
					debug(msg, regionName, syncIndex, age);
				}
				// Clear consumed message
				syncGroup.clearSyncCoordinationMessage('cmd-prepare', regionName, syncIndex);
				return; // Continue immediately
			} else {
				debug('Stored cmd-prepare too old (age=%dms > 2000ms), ignoring', age);
			}
		}

		// Create promise with active listener
		return new Promise<void>((resolve) => {
			let resolved = false;
			let unsubscribe: (() => void) | undefined;
			let timeoutId: NodeJS.Timeout | undefined;

			const cleanup = () => {
				resolved = true;
				if (unsubscribe) {
					unsubscribe();
				}
				if (timeoutId) {
					clearTimeout(timeoutId);
				}
			};

			// Set up timeout
			timeoutId = setTimeout(() => {
				if (resolved) { return; }
				const timeoutMsg = `Timeout waiting for cmd-prepare from master for region=${regionName}, syncIndex=${syncIndex}`;
				if (timedDebug) {
					timedDebug.log(timeoutMsg);
				} else {
					debug(timeoutMsg);
				}
				cleanup();
				resolve();
			},                     500);

			// Set up active listener
			unsubscribe = syncGroup.onValue(({ key, value }: { key: string; value?: any }) => {
				if (resolved) { return; } // Prevent processing after resolution

				if (key === 'sync-coordination' && value) {
					const message = value as SyncMessage;
					// Check if this is the cmd-prepare we're waiting for
					if (message.type === 'cmd-prepare' &&
						message.regionName === regionName &&
						message.syncIndex === syncIndex) {
						const msg = `Received cmd-prepare for region=${regionName}, syncIndex=${syncIndex}`;
						if (timedDebug) {
							timedDebug.log(msg);
						} else {
							debug(msg);
						}
						// Clear consumed message
						syncGroup.clearSyncCoordinationMessage('cmd-prepare', regionName, syncIndex);
						cleanup();
						resolve();
					}
				}
			});
		});
	}

	/**
	 * Wait for signal-ready message from master (slaves only)
	 */
	private async waitForSignalReady(
		regionName: string,
		syncIndex: number,
		syncGroup: any,
		timedDebug?: TimedDebugger,
	): Promise<void> {
		// Check for stored message first
		const storedMsg = syncGroup.getSyncCoordinationMessage('signal-ready', regionName, syncIndex);
		if (storedMsg) {
			const age = Date.now() - storedMsg.timestamp;
			if (age < 2000) {
				// 2 seconds freshness
				const msg = 'Found stored signal-ready for region=%s, syncIndex=%d, age=%dms';
				if (timedDebug) {
					timedDebug.log(msg, regionName, syncIndex, age);
				} else {
					debug(msg, regionName, syncIndex, age);
				}
				// Clear consumed message
				syncGroup.clearSyncCoordinationMessage('signal-ready', regionName, syncIndex);
				return; // Continue immediately
			} else {
				debug('Stored signal-ready too old (age=%dms > 2000ms), ignoring', age);
			}
		}

		// Create promise with active listener
		return new Promise<void>((resolve) => {
			let resolved = false;
			let unsubscribe: (() => void) | undefined;
			let timeoutId: NodeJS.Timeout | undefined;

			const cleanup = () => {
				resolved = true;
				if (unsubscribe) {
					unsubscribe();
				}
				if (timeoutId) {
					clearTimeout(timeoutId);
				}
			};

			// Set up timeout
			timeoutId = setTimeout(() => {
				if (resolved) { return; }
				const timeoutMsg = `Timeout waiting for signal-ready from master for region=${regionName}, syncIndex=${syncIndex}`;
				if (timedDebug) {
					timedDebug.log(timeoutMsg);
				} else {
					debug(timeoutMsg);
				}
				cleanup();
				resolve();
			},                     500);

			// Set up active listener
			unsubscribe = syncGroup.onValue(({ key, value }: { key: string; value?: any }) => {
				if (resolved) { return; } // Prevent processing after resolution

				if (key === 'sync-coordination' && value) {
					const message = value as SyncMessage;
					// Check if this is the signal-ready we're waiting for
					if (message.type === 'signal-ready' &&
						message.regionName === regionName &&
						message.syncIndex === syncIndex) {
						const msg = `Received signal-ready for region=${regionName}, syncIndex=${syncIndex}`;
						if (timedDebug) {
							timedDebug.log(msg);
						} else {
							debug(msg);
						}
						// Clear consumed message
						syncGroup.clearSyncCoordinationMessage('signal-ready', regionName, syncIndex);
						cleanup();
						resolve();
					}
				}
			});
		});
	}
}
