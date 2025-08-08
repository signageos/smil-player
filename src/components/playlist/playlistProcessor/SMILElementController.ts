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

		// Parse the key to extract ACK type, region, and syncIndex
		// Key format: "regionName-syncIndex-ackType"
		const keyParts = key.split('-');
		const ackType = keyParts[keyParts.length - 2] + '-' + keyParts[keyParts.length - 1]; // e.g., "ack-prepared"
		const syncIndex = parseInt(keyParts[keyParts.length - 3], 10);
		const regionName = keyParts.slice(0, -3).join('-'); // Handle region names with dashes

		// Create new round
		const round = new AckRound(expectedCount);
		this.activeRounds.set(key, round);

		// Check for already stored ACKs before setting up listener
		// Note: Currently we only store one ACK per key due to composite key design
		// This works because slaves send ACKs for the same position at roughly the same time
		// Future enhancement: store multiple ACKs with device IDs if needed
		debug('Checking for stored ACKs for %s', key);
		const storedAck = syncGroup.getSyncCoordinationMessage(ackType, regionName, syncIndex);
		if (storedAck) {
			const age = Date.now() - storedAck.timestamp;
			debug('Found stored ACK for %s, age=%dms', key, age);
			this.recordAck(key);
			
			// Clear consumed message immediately
			syncGroup.clearSyncCoordinationMessage(ackType, regionName, syncIndex);
			
			// Check if this completes all ACKs
			if (round.isComplete()) {
				debug('All ACKs already received from storage for %s', key);
				this.cleanupRound(key);
				return true;
			}
		}

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
							
							// Clear consumed message
							syncGroup.clearSyncCoordinationMessage(message.type, message.regionName, message.syncIndex);

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
			// play: new Map<string, number>(),  // COMMENTED OUT: Focusing on prepare sync only
		},
		masterPosition: {
			prepare: new Map<string, number>(),
			// play: new Map<string, number>(),  // COMMENTED OUT: Focusing on prepare sync only
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
				// COMMENTED OUT: Focusing on prepare sync only
				// Clear syncingInAction immediately since we only track prepare targets
				this.synchronization.syncingInAction = false;
				const clearMsg = 'All resync targets cleared - exiting resync mode';
				if (timedDebug) {
					timedDebug.log(clearMsg);
				} else {
					debug(clearMsg);
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

	// COMMENTED OUT: Focusing on prepare sync only
	// /**
	//  * Check if element should be played - handles resync logic for playback phase
	//  */
	// public async shouldPlayElement(
	// 	regionName: string,
	// 	syncIndex: number,
	// 	timedDebug?: TimedDebugger,
	// ): Promise<boolean> {
	// 	if (!this.synchronization.shouldSync) {
	// 		return true; // No sync needed
	// 	}

	// 	// Check if we're in resync mode for playing
	// 	if (this.synchronization.syncingInAction && this.synchronization.resyncTargets?.play) {
	// 		if (syncIndex < this.synchronization.resyncTargets.play) {
	// 			const msg = 'Skipping element playback during resync: syncIndex=%d, target=%d';
	// 			if (timedDebug) {
	// 				timedDebug.log(msg, syncIndex, this.synchronization.resyncTargets.play);
	// 			} else {
	// 				debug(msg, syncIndex, this.synchronization.resyncTargets.play);
	// 			}
	// 			return false; // Skip this element
	// 		} else if (syncIndex === this.synchronization.resyncTargets.play) {
	// 			const msg = 'Reached resync target during playback: region=%s, syncIndex=%d';
	// 			if (timedDebug) {
	// 				timedDebug.log(msg, regionName, syncIndex);
	// 			} else {
	// 				debug(msg, regionName, syncIndex);
	// 			}
	// 			console.log(`[SYNC] Reached play target at index ${syncIndex} - resuming normal sync`);
	// 			// Clear play target
	// 			delete this.synchronization.resyncTargets.play;
	// 			// Clear syncingInAction only if no other targets remain
	// 			if (!this.synchronization.resyncTargets?.prepare) {
	// 				this.synchronization.syncingInAction = false;
	// 				const clearMsg = 'All resync targets cleared - exiting resync mode';
	// 				if (timedDebug) {
	// 					timedDebug.log(clearMsg);
	// 				} else {
	// 					debug(clearMsg);
	// 				}
	// 			}
	// 			// Continue with normal sync
	// 		}
	// 	}

	// 	// Normal sync flow
	// 	return await this.shouldStartPlayback(regionName, syncIndex, timedDebug);
	// }

	// COMMENTED OUT: Focusing on prepare sync only
	// /**
	//  * Check if element should start playback - replaces handleElementSynchronization
	//  */
	// public async shouldStartPlayback(
	// 	regionName: string,
	// 	syncIndex: number,
	// 	timedDebug?: TimedDebugger,
	// ): Promise<boolean> {
	// 	const msg = 'Checking if should start playback: region=%s, syncIndex=%d';
	// 	if (timedDebug) {
	// 		timedDebug.log(msg, regionName, syncIndex);
	// 	} else {
	// 		debug(msg, regionName, syncIndex);
	// 	}

	// 	const syncGroup = getSyncGroup(`${this.synchronization.syncGroupName}-${regionName}-before`);
	// 	if (!syncGroup) {
	// 		const noGroupMsg = 'No sync group found for region: %s';
	// 		if (timedDebug) {
	// 			timedDebug.log(noGroupMsg, regionName);
	// 		} else {
	// 			debug(noGroupMsg, regionName);
	// 		}
	// 		return true;
	// 	}

	// 	// Coordinate playback start
	// 	return await this.coordinateElementTransition(syncGroup, 'playing', regionName, syncIndex, timedDebug);
	// }

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

		// Finished state is not needed in ACK protocol
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

			const action = await this.waitForPrepareCommand(regionName, syncIndex, syncGroup, timedDebug);

			if (action === ProcessAction.CONTINUE) {
				const readyMsg = 'Slave received cmd-prepare, starting preparation for region=%s, syncIndex=%d';
				if (timedDebug) {
					timedDebug.log(readyMsg, regionName, syncIndex);
				} else {
					debug(readyMsg, regionName, syncIndex);
				}
			} else if (action === ProcessAction.RESYNC) {
				// Resync needed - set flags but don't throw error
				// The resync will be handled by shouldPrepareElement
				const resyncMsg = 'Slave detected resync needed during prepare start for region=%s, syncIndex=%d';
				if (timedDebug) {
					timedDebug.log(resyncMsg, regionName, syncIndex);
				} else {
					debug(resyncMsg, regionName, syncIndex);
				}
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
			// Slave always sends ACK to not block master
			// If in resync mode, send ACK for master's position instead
			if (this.synchronization.syncingInAction && this.synchronization.resyncTargets?.prepare) {
				// Get master's current position and send ACK for that
				const masterPos = this.getPositions(regionName, 'prepared').master;
				if (masterPos > 0) {
					await this.sendAckForPosition(regionName, masterPos, 'prepared', syncGroup);
					const msg = 'Slave in resync mode - sent ack-prepared for master position=%d instead of %d';
					if (timedDebug) {
						timedDebug.log(msg, masterPos, syncIndex);
					} else {
						debug(msg, masterPos, syncIndex);
					}
				} else {
					// No master position known yet, send normal ACK
					await this.broadcastSyncMessage('ack-prepared', regionName, syncIndex, syncGroup);
					debug('Slave in resync but no master position known - sent normal ack-prepared');
				}
				// Don't wait for signal-ready during resync - continue skipping elements
				return;
			} else {
				// Normal case - send ACK for current position
				await this.broadcastSyncMessage('ack-prepared', regionName, syncIndex, syncGroup);
				const msg = 'Slave sent ack-prepared for region=%s, syncIndex=%d';
				if (timedDebug) {
					timedDebug.log(msg, regionName, syncIndex);
				} else {
					debug(msg, regionName, syncIndex);
				}
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

	// COMMENTED OUT: Focusing on prepare sync only
	// /**
	//  * Coordinate the start of element playing
	//  * Master broadcasts cmd-play, slaves wait for it
	//  */
	// public async coordinatePlayStart(regionName: string, syncIndex: number, timedDebug?: TimedDebugger): Promise<void> {
	// 	if (!this.synchronization.shouldSync) {
	// 		return; // No sync needed
	// 	}

	// 	const syncGroup = getSyncGroup(`${this.synchronization.syncGroupName}-${regionName}-before`);
	// 	if (!syncGroup) {
	// 		debug('No sync group for play start: region=%s', regionName);
	// 		return;
	// 	}

	// 	const isMaster = await syncGroup.isMaster();
	// 	if (isMaster) {
	// 		// Master broadcasts play command
	// 		await this.broadcastSyncMessage('cmd-play', regionName, syncIndex, syncGroup);
	// 		const msg = 'Master sent cmd-play for region=%s, syncIndex=%d';
	// 		if (timedDebug) {
	// 			timedDebug.log(msg, regionName, syncIndex);
	// 		} else {
	// 			debug(msg, regionName, syncIndex);
	// 		}
	// 	} else {
	// 		// Slaves will receive cmd-play through message routing
	// 		const msg = 'Slave ready to receive cmd-play for region=%s, syncIndex=%d';
	// 		if (timedDebug) {
	// 			timedDebug.log(msg, regionName, syncIndex);
	// 		} else {
	// 			debug(msg, regionName, syncIndex);
	// 		}
	// 	}
	// }

	// COMMENTED OUT: Focusing on prepare sync only
	// /**
	//  * Coordinate the completion of element play start
	//  * Slaves send ack-playing, master waits for all ACKs
	//  */
	// public async coordinatePlayComplete(
	// 	regionName: string,
	// 	syncIndex: number,
	// 	timedDebug?: TimedDebugger,
	// ): Promise<void> {
	// 	if (!this.synchronization.shouldSync) {
	// 		return; // No sync needed
	// 	}

	// 	const syncGroup = getSyncGroup(`${this.synchronization.syncGroupName}-${regionName}-before`);
	// 	if (!syncGroup) {
	// 		debug('No sync group for play complete: region=%s', regionName);
	// 		return;
	// 	}

	// 	const isMaster = await syncGroup.isMaster();
	// 	if (isMaster) {
	// 		// Master waits for ACKs
	// 		const expectedAcks = syncGroup.getConnectedPeersCount() - 1; // Exclude master itself
	// 		if (expectedAcks > 0) {
	// 			const ackKey = `${regionName}-${syncIndex}-ack-playing`;
	// 			const msg = 'Master waiting for %d playing ACKs for %s';
	// 			if (timedDebug) {
	// 				timedDebug.log(msg, expectedAcks, ackKey);
	// 			} else {
	// 				debug(msg, expectedAcks, ackKey);
	// 			}

	// 			const acksReceived = await this.ackTracker.waitForAcks(ackKey, expectedAcks, syncGroup, 500);
	// 			const resultMsg = acksReceived
	// 				? 'Master received all playing ACKs for %s'
	// 				: 'Master timeout waiting for playing ACKs for %s';
	// 			if (timedDebug) {
	// 				timedDebug.log(resultMsg, ackKey);
	// 			} else {
	// 				debug(resultMsg, ackKey);
	// 			}
	// 		}
	// 	} else {
	// 		// Slave sends ACK
	// 		await this.broadcastSyncMessage('ack-playing', regionName, syncIndex, syncGroup);
	// 		const msg = 'Slave sent ack-playing for region=%s, syncIndex=%d';
	// 		if (timedDebug) {
	// 			timedDebug.log(msg, regionName, syncIndex);
	// 		} else {
	// 			debug(msg, regionName, syncIndex);
	// 		}
	// 	}
	// }

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

			// In ACK protocol, state broadcasts are replaced by commands

			// Wait for ACKs from slaves
			let expectedAcks = syncGroup.getConnectedPeersCount() - 1; // Exclude master itself
			if (expectedAcks > 0 && state === 'prepared') {  // CHANGED: Only handle prepared state
				const ackType = 'ack-prepared';
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
			// CHANGED: Only handle prepared state
			if (state !== 'prepared') {
				debug('Skipping play state coordination - focusing on prepare only');
				return true;
			}
			
			// Slave waits for command and sends ACK
			const commandType = 'cmd-prepare';
			const slaveMsg = 'Slave waiting for %s from master for region=%s, syncIndex=%d';
			if (timedDebug) {
				timedDebug.log(slaveMsg, commandType, regionName, syncIndex);
			} else {
				debug(slaveMsg, commandType, regionName, syncIndex);
			}
			
			// Use unified method to wait for command and check sync
			const action = await this.waitForCommandAndCheckSync(
				commandType,
				'prepared',
				regionName,
				syncIndex,
				syncGroup,
				timedDebug,
			);
			
			// Handle the action returned
			if (action === ProcessAction.CONTINUE) {
				// Send ACK after receiving command
				const ackType = 'ack-prepared';
				await this.broadcastSyncMessage(ackType, regionName, syncIndex, syncGroup);
				debug('Slave sent %s for region=%s, syncIndex=%d', ackType, regionName, syncIndex);
				return true;
			} else if (action === ProcessAction.RESYNC) {
				// Resync needed - still send ACK to not block master
				const masterPos = this.getPositions(regionName, 'prepared').master;
				await this.sendAckForPosition(regionName, masterPos, 'prepared', syncGroup);
				debug('Slave in resync mode - sent ACK for master position %d', masterPos);
				return false; // Trigger resync
			} else {
				// WAIT should not be returned from waitForCommandAndCheckSync
				debug('Unexpected WAIT action returned - treating as timeout');
				return true;
			}
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
			
			// Clear sync state when we achieve exact match
			if (this.synchronization.syncingInAction) {
				debug('Exact match found - clearing resync state');
				if (this.synchronization.resyncTargets) {
					delete this.synchronization.resyncTargets.prepare;
					// delete this.synchronization.resyncTargets.play;  // COMMENTED OUT: Focusing on prepare sync only
				}
				this.synchronization.syncingInAction = false;
			}
			
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
			let nextIndex = value.syncIndex + 1;

			// Check if we need to wrap around
			if (maxIndex !== undefined && nextIndex > maxIndex) {
				console.log('reseting index');
				// Wrap to first element
				nextIndex = 1;
			} else {
				console.log('increasing index');
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
			let nextIndex = value.syncIndex + 1;

			// Check if we need to wrap around
			if (maxIndex !== undefined && nextIndex > maxIndex) {
				console.log('reseting index');
				// Wrap to first element
				nextIndex = 1;
			} else {
				console.log('increasing index');
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
			} 
			// COMMENTED OUT: Focusing on prepare sync only
			// else if (expectedState === 'playing') {
			// 	this.synchronization.resyncTargets.play = nextIndex;
			// 	debug(
			// 		'Setting resync target for PLAY: region=%s, targetIndex=%d (master at %d)',
			// 		regionName,
			// 		nextIndex,
			// 		value.syncIndex,
			// 	);
			// }

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
				let nextIndex = syncIndex + 1;

				// Check if we need to wrap around
				if (maxIndex !== undefined && nextIndex > maxIndex) {
					console.log('reseting index');
					// Wrap to first element
					nextIndex = 1;
				} else {
					console.log('increasing index');
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
	 * Handles cmd-prepare/cmd-play messages only (ACK protocol)
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
		
		// Check if actively resyncing and not at target yet - skip immediately
		// COMMENTED OUT: Focusing on prepare sync only
		// Always use prepare resync target regardless of command type
		const resyncTarget = this.synchronization.resyncTargets?.prepare;
		
		if (this.synchronization.syncingInAction && resyncTarget !== undefined && syncIndex < resyncTarget) {
			debug('Skipping wait during resync: at syncIndex=%d, target=%d for %s', 
				syncIndex, resyncTarget, expectedState);
			// Return RESYNC immediately - no timeout, no waiting
			return ProcessAction.RESYNC;
		}
		
		// Log current positions for debugging
		const positions = this.getPositions(regionName, expectedState);
		debug('Current sync positions for %s %s: slave=%d, master=%d', 
			regionName, expectedState, positions.slave, positions.master);
		
		// Check for stored command message first
		const storedMsg = syncGroup.getSyncCoordinationMessage(commandType, regionName, syncIndex);
		if (storedMsg) {
			const age = Date.now() - storedMsg.timestamp;
			debug('Found stored %s for region=%s, syncIndex=%d, age=%dms', commandType, regionName, syncIndex, age);
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

		// Create promise with active listener
		return new Promise<ProcessActionType>((resolve) => {
			let resolved = false;
			let unsubscribe: (() => void) | undefined;
			let unsubscribeMasterChange: (() => void) | undefined;
			let timeoutId: NodeJS.Timeout | undefined;

			const cleanup = () => {
				resolved = true;
				if (unsubscribe) {
					unsubscribe();
				}
				if (unsubscribeMasterChange) {
					unsubscribeMasterChange();
				}
				if (timeoutId) {
					clearTimeout(timeoutId);
				}
			};

			// Check if we're at resync target - use longer timeout
			// COMMENTED OUT: Focusing on prepare sync only
			// Always use prepare resync target regardless of command type
			const resyncTarget = this.synchronization.resyncTargets?.prepare;
			const isAtResyncTarget = this.synchronization.syncingInAction && 
				resyncTarget !== undefined && syncIndex === resyncTarget;
			
			// Use 1 hour timeout if at resync target, otherwise no timeout for fast resync
			const timeoutMs = isAtResyncTarget ? 3600000 : 0;
			
			if (isAtResyncTarget) {
				debug('At resync target %d for %s - waiting indefinitely for master', syncIndex, expectedState);
				console.log(`[SYNC] Slave at resync target ${syncIndex} - waiting for master command`);
			}
			
			// Set up timeout only if we have a non-zero timeout
			if (timeoutMs > 0) {
				timeoutId = setTimeout(() => {
					if (resolved) { return; }
					const timeoutMsg = isAtResyncTarget 
						? `Long timeout waiting for ${commandType} at resync target=${syncIndex}, region=${regionName}`
						: `Timeout waiting for ${commandType} from master for region=${regionName}, syncIndex=${syncIndex}`;
					if (timedDebug) {
						timedDebug.log(timeoutMsg);
					} else {
						debug(timeoutMsg);
					}
					cleanup();
					resolve(ProcessAction.CONTINUE);
				}, timeoutMs);
			} else {
				// No timeout - continue immediately to allow fast resync
				debug('No timeout - continuing immediately for fast resync');
				// Delay resolution slightly to allow message reception first
				Promise.resolve().then(() => {
					if (!resolved) {
						cleanup();
						resolve(ProcessAction.CONTINUE);
					}
				});
			}

			// Monitor master changes - if slave becomes master, continue immediately
			unsubscribeMasterChange = syncGroup.onMasterChange((isMaster: boolean) => {
				if (resolved) { return; } // Prevent processing after resolution

				if (isMaster) {
					// This device became master while waiting
					debug(
						'Slave became master while waiting for %s at syncIndex=%d, region=%s',
						commandType,
						syncIndex,
						regionName,
					);
					console.log(`[SYNC] Device became master while waiting - continuing immediately`);
					cleanup();
					resolve(ProcessAction.CONTINUE); // Continue as new master
				}
			});

			// Set up active listener for sync-coordination messages only
			unsubscribe = syncGroup.onValue(async ({ key, value }: { key: string; value?: any }) => {
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
						
						// Special handling if we're at resync target and master has passed us
						if (isAtResyncTarget && message.syncIndex > syncIndex) {
							// Master has moved past our resync target
							const maxIndex = this.synchronization.maxSyncIndexPerRegion?.[regionName];
							let newTarget = message.syncIndex + 1;
							
							// Check if we need to wrap around
							if (maxIndex !== undefined && newTarget > maxIndex) {
								debug('Wrapping resync target from %d to 1 (max=%d)', newTarget, maxIndex);
								newTarget = 1; // Wrap to first element
							}
							
							// COMMENTED OUT: Focusing on prepare sync only
							// Always set prepare target regardless of command type
							this.synchronization.resyncTargets!.prepare = newTarget;
							// Original play logic:
							// if (commandType === 'cmd-prepare') {
							// 	this.synchronization.resyncTargets!.prepare = newTarget;
							// } else {
							// 	this.synchronization.resyncTargets!.play = newTarget;
							// }
							
							debug('Master passed resync target - updating target from %d to %d', syncIndex, newTarget);
							console.log(`[SYNC] Master at ${message.syncIndex}, updating resync target to ${newTarget}`);
							
							// Send ACK for master's position to not block it
							await this.sendAckForPosition(regionName, message.syncIndex, expectedState, syncGroup);
							
							cleanup();
							resolve(ProcessAction.RESYNC);
							return;
						}
						
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
		} 
		// COMMENTED OUT: Focusing on prepare sync only
		// else if (state === 'playing') {
		// 	this.syncState.slavePosition.play.set(regionName, syncIndex);
		// 	debug('Updated slave play position: region=%s, syncIndex=%d', regionName, syncIndex);
		// }
	}

	/**
	 * Update master position tracking
	 */
	private updateMasterPosition(regionName: string, syncIndex: number, state: 'prepared' | 'playing'): void {
		// CHANGED: Only track prepared state
		if (state !== 'prepared') {
			return;
		}
		
		const currentPos = this.syncState.masterPosition.prepare.get(regionName) || 0;
		
		// Only update if the new position is higher (master moving forward)
		if (syncIndex > currentPos) {
			this.syncState.masterPosition.prepare.set(regionName, syncIndex);
			debug('Updated master prepare position: region=%s, syncIndex=%d', regionName, syncIndex);
		}
	}

	/**
	 * Get current positions for debugging
	 */
	private getPositions(regionName: string, _state: 'prepared' | 'playing'): { slave: number; master: number } {
		// COMMENTED OUT: Focusing on prepare sync only
		// For now, only return prepare positions regardless of state parameter
		const slavePos = this.syncState.slavePosition.prepare.get(regionName) || 0;
		const masterPos = this.syncState.masterPosition.prepare.get(regionName) || 0;
		
		// Original play logic commented out:
		// const slavePos = state === 'prepared'
		// 	? this.syncState.slavePosition.prepare.get(regionName) || 0
		// 	: this.syncState.slavePosition.play.get(regionName) || 0;
		// 
		// const masterPos = state === 'prepared'
		// 	? this.syncState.masterPosition.prepare.get(regionName) || 0
		// 	: this.syncState.masterPosition.play.get(regionName) || 0;
			
		return { slave: slavePos, master: masterPos };
	}

	/**
	 * Wait for cmd-prepare message from master (slaves only)
	 * Returns the action to take based on sync state
	 */
	private async waitForPrepareCommand(
		regionName: string,
		syncIndex: number,
		syncGroup: any,
		timedDebug?: TimedDebugger,
	): Promise<ProcessActionType> {
		// Use unified method to wait for command and check sync
		return await this.waitForCommandAndCheckSync(
			'cmd-prepare',
			'prepared',
			regionName,
			syncIndex,
			syncGroup,
			timedDebug,
		);
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
			const msg = 'Found stored signal-ready for region=%s, syncIndex=%d, age=%dms';
			if (timedDebug) {
				timedDebug.log(msg, regionName, syncIndex, age);
			} else {
				debug(msg, regionName, syncIndex, age);
			}
			// Clear consumed message
			syncGroup.clearSyncCoordinationMessage('signal-ready', regionName, syncIndex);
			return; // Continue immediately
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
