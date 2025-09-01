import { debug } from '../tools/generalTools';
import { Synchronization, SyncElementState, SyncMessage, SyncMessageType } from '../../../models/syncModels';
import { getSyncGroup } from '../tools/syncTools';
import { TimedDebugger } from './playlistProcessor';

// Process actions for element state handling
export const ProcessAction = {
	CONTINUE: 'CONTINUE', // Exact match - continue playing normally
	RESYNC: 'RESYNC', // Slave behind master - trigger resync to skip elements
	WAIT: 'WAIT', // Keep waiting for correct broadcast
} as const;

export type ProcessActionType = typeof ProcessAction[keyof typeof ProcessAction];

/**
 * Get ISO timestamp for debug logs
 */
function getTimestamp(): string {
	return new Date().toISOString();
}

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
		debug('[%s] Starting ACK tracking for %s, expecting %d ACKs, timeout %dms', getTimestamp(), key, expectedCount, timeoutMs);

		// If no slaves to wait for, return immediately
		if (expectedCount === 0) {
			debug('[%s] No ACKs expected for %s, continuing', getTimestamp(), key);
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
		// We now store only the latest ACK per type/region
		debug('[%s] Checking for stored ACKs for %s', getTimestamp(), key);
		const storedAck = syncGroup.getSyncCoordinationMessage(ackType, regionName);
		if (storedAck && storedAck.syncIndex === syncIndex) {
			const age = Date.now() - storedAck.timestamp;
			debug('[%s] Found stored ACK for %s, age=%dms', getTimestamp(), key, age);
			this.recordAck(key);

			// Clear consumed message immediately
			syncGroup.clearSyncCoordinationMessage(ackType, regionName);

			// Check if this completes all ACKs
			if (round.isComplete()) {
				debug('[%s] All ACKs already received from storage for %s', getTimestamp(), key);
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
				if (resolved) {
					return;
				}
				const timeoutMsg = 'ACK timeout for %s - received %d of %d ACKs. Continuing without slow devices.';
				debug('[%s] ' + timeoutMsg, getTimestamp(), key, round.receivedCount, expectedCount);
				console.log(`[SYNC] ${timeoutMsg}`, key, round.receivedCount, expectedCount);
				cleanup();
				resolve(false);
			},
			timeoutMs);

			// Set up active listener for ACK messages
			unsubscribe = syncGroup.onValue(({ key: msgKey, value }: { key: string; value?: any }) => {
				if (resolved) {
					return;
				} // Prevent processing after resolution

				if (msgKey === 'sync-coordination' && value) {
					const message = value as SyncMessage;

					// Check if this is an ACK message
					if (message.type === 'ack-prepared' || message.type === 'ack-playing') {
						// Build the ACK key from the message
						const ackKey = `${message.regionName}-${message.syncIndex}-${message.type}`;

						// Check if this ACK is for our round
						if (ackKey === key) {
							debug('[%s] Received ACK for %s', getTimestamp(), key);
							this.recordAck(key);

							// Clear consumed message
							syncGroup.clearSyncCoordinationMessage(message.type, message.regionName);

							// Check if all ACKs received
							if (round.isComplete()) {
								debug('[%s] All ACKs received for %s', getTimestamp(), key);
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
			debug('[%s] Cannot adjust count for unknown round: %s', getTimestamp(), key);
			return;
		}

		const oldCount = round.expectedCount;
		round.expectedCount = newExpectedCount;
		debug('[%s] Adjusted expected ACKs for %s from %d to %d', getTimestamp(), key, oldCount, newExpectedCount);

		// Check if we've now received all ACKs
		if (round.isComplete()) {
			debug('[%s] All ACKs now received after adjustment for %s', getTimestamp(), key);
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
			debug('[%s] Received ACK for unknown round: %s', getTimestamp(), key);
			return;
		}

		round.addAck();
		debug('[%s] Recorded ACK for %s - %d of %d received', getTimestamp(), key, round.receivedCount, round.expectedCount);

		if (round.isComplete()) {
			debug('[%s] All ACKs received for %s', getTimestamp(), key);
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
	public resolve: (value: boolean) => void = () => {
		/* placeholder */
	};

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
			prepare: new Map<string, number>(), // regionName -> syncIndex
			play: new Map<string, number>(),     // regionName -> syncIndex for play state
		},
		// Master position now tracked via latest cmd-prepare messages in SyncGroup
		pendingAcks: new Set<string>(), // "region-index-state" keys to avoid duplicates
	};

	constructor(private synchronization: Synchronization) {}

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
					debug('[%s] ' + msg, getTimestamp(), syncIndex, this.synchronization.resyncTargets.play);
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
			debug('[%s] ' + msg, getTimestamp(), regionName, syncIndex);
		}

		const syncGroup = getSyncGroup(`${this.synchronization.syncGroupName}-${regionName}-before`);
		if (!syncGroup) {
			const noGroupMsg = 'No sync group found for region: %s';
			if (timedDebug) {
				timedDebug.log(noGroupMsg, regionName);
			} else {
				debug('[%s] ' + noGroupMsg, getTimestamp(), regionName);
			}
			return true;
		}

		// Coordinate playback start
		return await this.coordinateElementTransition(syncGroup, 'playing', regionName, syncIndex, timedDebug);
	}

	/**
	 * Coordinate the start of element preparation
	 * Master broadcasts cmd-prepare, slaves wait for it
	 * @returns ProcessActionType indicating whether to continue or resync
	 */
	public async coordinatePrepareStart(
		regionName: string,
		syncIndex: number,
		timedDebug?: TimedDebugger,
	): Promise<ProcessActionType> {
		const syncGroup = getSyncGroup(`${this.synchronization.syncGroupName}-${regionName}-before`);
		if (!syncGroup) {
			debug('[%s] No sync group for prepare start: region=%s', getTimestamp(), regionName);
			return ProcessAction.CONTINUE;
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
			return ProcessAction.CONTINUE; // Master always continues
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
				const resyncMsg = 'Slave detected resync needed during prepare start for region=%s, syncIndex=%d';
				if (timedDebug) {
					timedDebug.log(resyncMsg, regionName, syncIndex);
				} else {
					debug(resyncMsg, regionName, syncIndex);
				}
			}

			return action; // Return the action for the caller to handle
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
			debug('[%s] No sync group for prepare complete: region=%s', getTimestamp(), regionName);
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
				const masterPos = this.getPositions(regionName, 'prepared', syncGroup).master;
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
					debug('[%s] Slave in resync but no master position known - sent normal ack-prepared', getTimestamp());
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

			const receivedSignal = await this.waitForSignalReady(regionName, syncIndex, syncGroup, timedDebug);
			if (!receivedSignal) {
				// Timeout occurred - trigger resync
				console.log(`[SYNC] Signal-ready timeout for region=${regionName}, syncIndex=${syncIndex} - triggering resync`);
				this.synchronization.syncingInAction = true;

				// Get master's last known position
				const masterPos = this.getPositions(regionName, 'prepared', syncGroup).master;
				if (masterPos > syncIndex) {
					if (!this.synchronization.resyncTargets) {
						this.synchronization.resyncTargets = {};
					}
					this.synchronization.resyncTargets.prepare = masterPos + 1;
					const msg = 'Timeout recovery: setting resync target to %d (master at %d)';
					if (timedDebug) {
						timedDebug.log(msg, masterPos + 1, masterPos);
					} else {
						debug('[%s] ' + msg, getTimestamp(), masterPos + 1, masterPos);
					}
				}
			} else {
				const readyMsg = 'Slave received signal-ready, continuing for region=%s, syncIndex=%d';
				if (timedDebug) {
					timedDebug.log(readyMsg, regionName, syncIndex);
				} else {
					debug(readyMsg, regionName, syncIndex);
				}
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

			// For playing state, master must broadcast cmd-play
			if (state === 'playing') {
				await this.broadcastSyncMessage('cmd-play', regionName, syncIndex, syncGroup);
				const cmdMsg = 'Master sent cmd-play for region=%s, syncIndex=%d';
				if (timedDebug) {
					timedDebug.log(cmdMsg, regionName, syncIndex);
				} else {
					debug(cmdMsg, regionName, syncIndex);
				}
			}

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

					// After receiving ACKs, broadcast signal-ready
					if (acksReceived || expectedAcks === 0) {
						await this.broadcastSyncMessage('signal-ready', regionName, syncIndex, syncGroup);
						const readyMsg = 'Master sent signal-ready for region=%s, syncIndex=%d, state=%s';
						if (timedDebug) {
							timedDebug.log(readyMsg, regionName, syncIndex, state);
						} else {
							debug(readyMsg, regionName, syncIndex, state);
						}
					}
				} finally {
					// Always unsubscribe from peer monitoring
					unsubscribe();
				}
			} else if (expectedAcks === 0) {
				// No slaves, still send signal-ready for consistency
				await this.broadcastSyncMessage('signal-ready', regionName, syncIndex, syncGroup);
				debug('[%s] Master sent signal-ready (no slaves) for region=%s, syncIndex=%d, state=%s', getTimestamp(), regionName, syncIndex, state);
			}

			return true; // Master always continues
		} else {
			// Handle both prepared and playing states
			if (state !== 'prepared' && state !== 'playing') {
				debug('[%s] Skipping coordination for state: %s', getTimestamp(), state);
				return true;
			}

			// Slave waits for command and sends ACK
			const commandType = state === 'prepared' ? 'cmd-prepare' : 'cmd-play';
			const expectedState = state;
			const slaveMsg = 'Slave waiting for %s from master for region=%s, syncIndex=%d';
			if (timedDebug) {
				timedDebug.log(slaveMsg, commandType, regionName, syncIndex);
			} else {
				debug(slaveMsg, commandType, regionName, syncIndex);
			}

			// Use unified method to wait for command and check sync
			const action = await this.waitForCommandAndCheckSync(
				commandType,
				expectedState,
				regionName,
				syncIndex,
				syncGroup,
				timedDebug,
			);

			console.log('Slave is processing sync action', action);

			// Handle the action returned
			if (action === ProcessAction.CONTINUE) {
				// Send ACK after receiving command
				const ackType = state === 'prepared' ? 'ack-prepared' : 'ack-playing';
				await this.broadcastSyncMessage(ackType, regionName, syncIndex, syncGroup);
				debug('[%s] Slave sent %s for region=%s, syncIndex=%d', getTimestamp(), ackType, regionName, syncIndex);

				// Wait for signal-ready from master before proceeding
				const waitReadyMsg = 'Slave waiting for signal-ready from master for region=%s, syncIndex=%d, state=%s';
				if (timedDebug) {
					timedDebug.log(waitReadyMsg, regionName, syncIndex, state);
				} else {
					debug(waitReadyMsg, regionName, syncIndex, state);
				}

				const receivedSignal = await this.waitForSignalReady(regionName, syncIndex, syncGroup, timedDebug);

				if (!receivedSignal) {
					// Timeout occurred - trigger resync
					console.log(`[SYNC] Signal-ready timeout in coordinateElementTransition for region=${regionName}, syncIndex=${syncIndex} - triggering resync`);
					this.synchronization.syncingInAction = true;

					// Get master's last known position
					const masterPos = this.getPositions(regionName, state, syncGroup).master;
					if (masterPos > syncIndex) {
						if (!this.synchronization.resyncTargets) {
							this.synchronization.resyncTargets = {};
						}
						// Since this is in play coordination, set play target
						this.synchronization.resyncTargets.play = masterPos + 1;
						const msg = 'Timeout recovery in play: setting resync target to %d (master at %d)';
						if (timedDebug) {
							timedDebug.log(msg, masterPos + 1, masterPos);
						} else {
							debug('[%s] ' + msg, getTimestamp(), masterPos + 1, masterPos);
						}
					}
					return false; // Indicate resync needed
				} else {
					const proceedMsg = 'Slave received signal-ready, proceeding with %s for region=%s, syncIndex=%d';
					if (timedDebug) {
						timedDebug.log(proceedMsg, state, regionName, syncIndex);
					} else {
						debug(proceedMsg, state, regionName, syncIndex);
					}
					return true;
				}
			} else if (action === ProcessAction.RESYNC) {
				// Resync needed - still send ACK to not block master
				const masterPos = this.getPositions(regionName, expectedState, syncGroup).master;
				await this.sendAckForPosition(regionName, masterPos, expectedState, syncGroup);
				debug('[%s] Slave in resync mode - sent ACK for master position %d', getTimestamp(), masterPos);
				return false; // Trigger resync
			} else {
				// WAIT should not be returned from waitForCommandAndCheckSync
				debug('[%s] Unexpected WAIT action returned - treating as timeout', getTimestamp());
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
			'[%s] Processing broadcast: state=%s, syncIndex=%d, timestamp=%d for region=%s (waiting for state=%s, syncIndex=%d)',
			getTimestamp(),
			value.state,
			value.syncIndex,
			value.timestamp,
			regionName,
			expectedState,
			syncIndex,
		);

		// Get maxIndex for wraparound detection
		const maxIndex = this.synchronization.maxSyncIndexPerRegion?.[regionName];

		if (value.state === expectedState && value.syncIndex === syncIndex) {
			// Normal case: exact match
			debug('[%s] Received expected state: %s for region=%s, syncIndex=%d', getTimestamp(), expectedState, regionName, syncIndex);

			// Clear sync state when we achieve exact match
			if (this.synchronization.syncingInAction) {
				debug('[%s] Exact match found - clearing resync state', getTimestamp());
				if (this.synchronization.resyncTargets) {
					delete this.synchronization.resyncTargets.prepare;
					delete this.synchronization.resyncTargets.play;
				}
				this.synchronization.syncingInAction = false;
			}

			return ProcessAction.CONTINUE; // In sync, continue normally
		} else if (value.syncIndex < syncIndex || (maxIndex && syncIndex <= 2 && value.syncIndex >= (maxIndex - 1))) {
			// Slave is ahead of master - wait for master to catch up
			// Includes wraparound: slave at start of new iteration, master at end of previous
			const isWraparound = maxIndex && syncIndex <= 2 && value.syncIndex >= (maxIndex - 1);
			debug(
				'[%s] Slave ahead of master %s- slave waiting for syncIndex=%d, master at syncIndex=%d for region=%s',
				getTimestamp(),
				isWraparound ? '(wraparound) ' : '',
				syncIndex,
				value.syncIndex,
				regionName,
			);
			return ProcessAction.WAIT; // Keep waiting for correct broadcast
		} else if (expectedState === 'prepared' && value.state === 'playing' && value.syncIndex > syncIndex) {
			// Special case: We're waiting for 'prepared' but master is already playing a future element
			// This means we missed our chance to prepare and need to catch up
			debug(
				'[%s] Waiting for prepared but master playing future element - need resync. Master playing %d, we waiting at %d',
				getTimestamp(),
				value.syncIndex,
				syncIndex,
			);

			// Set target to prepare for the NEXT element after what master is playing
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
				'[%s] Setting resync target for preparation: region=%s, targetIndex=%d (master playing %d)',
				getTimestamp(),
				regionName,
				nextIndex,
				value.syncIndex,
			);
			console.log(`[SYNC] Slave needs to resync - waiting for prepared at index ${nextIndex}`);
			debug('[%s] Returning false from waitForMasterState to trigger element skip', getTimestamp());
			return ProcessAction.RESYNC; // Trigger resync - skip current element
		} else if (value.state === expectedState && value.syncIndex > syncIndex) {
			// Master ahead with same state
			debug('[%s] Master ahead - need resync. Master at %d, we are at %d', getTimestamp(), value.syncIndex, syncIndex);

			// Handle wraparound for playlist looping
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
					'[%s] Setting resync target for PREPARE: region=%s, targetIndex=%d (master at %d)',
					getTimestamp(),
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
		} else if (value.syncIndex === syncIndex && value.state !== expectedState) {
			// Same element but different state
			// Determine if we're ahead or behind based on state progression
			const stateOrder: SyncElementState[] = ['prepared', 'playing', 'finished'];
			const expectedIndex = stateOrder.indexOf(expectedState);
			const receivedIndex = stateOrder.indexOf(value.state);

			if (receivedIndex > expectedIndex) {
				// We're behind (e.g., we expect 'prepared' but master is at 'playing')
				debug(
					'[%s] Behind in state progression - expected %s but master at %s for syncIndex=%d',
					getTimestamp(),
					expectedState,
					value.state,
					syncIndex,
				);

				// Handle wraparound for playlist looping
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
					'[%s] Setting resync target due to state mismatch: region=%s, targetIndex=%d (behind in state progression)',
					getTimestamp(),
					regionName,
					nextIndex,
				);
				console.log(`[SYNC] Behind in state - resync to prepare at index ${nextIndex}`);
			} else {
				// We're ahead (e.g., we expect 'playing' but master is at 'prepared')
				debug(
					'[%s] Ahead in state progression - expected %s but master at %s for syncIndex=%d',
					getTimestamp(),
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
			debug('[%s] No sync group to broadcast to for region: %s', getTimestamp(), regionName);
			return;
		}

		await group.broadcastValue('sync-coordination', message);
		debug('[%s] Broadcasted sync message: type=%s, region=%s, syncIndex=%d', getTimestamp(), type, regionName, syncIndex);
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
		// Use state-specific resync target based on expected state
		const resyncTarget = expectedState === 'prepared'
			? this.synchronization.resyncTargets?.prepare
			: this.synchronization.resyncTargets?.play;

		if (this.synchronization.syncingInAction && resyncTarget !== undefined && syncIndex < resyncTarget) {
			debug(
				'[%s] Skipping wait during resync: at syncIndex=%d, target=%d for %s',
				getTimestamp(),
				syncIndex,
				resyncTarget,
				expectedState,
			);
			// Return RESYNC immediately - no timeout, no waiting
			return ProcessAction.RESYNC;
		}

		// Log current positions for debugging
		const positions = this.getPositions(regionName, expectedState, syncGroup);
		debug(
			'[%s] Current sync positions for %s %s: slave=%d, master=%d',
			getTimestamp(),
			regionName,
			expectedState,
			positions.slave,
			positions.master,
		);

		// Check for stored command message first
		const storedMsg = syncGroup.getSyncCoordinationMessage(commandType, regionName);
		if (storedMsg) {
			const age = Date.now() - storedMsg.timestamp;
			debug('[%s] Found stored %s for region=%s, storedIndex=%d, expectedIndex=%d, age=%dms', getTimestamp(),
				commandType, regionName, storedMsg.syncIndex, syncIndex, age);
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
				// Don't clear the message - we want to keep the latest for position tracking
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

			// Check if we're at resync target - use 10 minute timeout to prevent indefinite waiting
			const resyncTargetCheck = expectedState === 'prepared'
				? this.synchronization.resyncTargets?.prepare
				: this.synchronization.resyncTargets?.play;
			const isAtResyncTarget =
				this.synchronization.syncingInAction && resyncTargetCheck !== undefined && syncIndex === resyncTargetCheck;

			if (isAtResyncTarget) {
				debug('[%s] At resync target %d for %s - waiting for master with 10 minute timeout', getTimestamp(), syncIndex, expectedState);
				console.log(`[SYNC] Slave at resync target ${syncIndex} - waiting for master command`);
				// Set 10 minute timeout to prevent indefinite waiting
				timeoutId = setTimeout(() => {
					if (resolved) {
						return;
					}
					const timeoutMsg = `Timeout waiting for ${commandType} at resync target=${syncIndex}, region=${regionName} after 10 minutes`;
					if (timedDebug) {
						timedDebug.log(timeoutMsg);
					} else {
						debug('[%s] ' + timeoutMsg, getTimestamp());
					}
					cleanup();
					resolve(ProcessAction.CONTINUE);
				}, 600000); // 10 minutes
			}

			// Monitor master changes - if slave becomes master, continue immediately
			unsubscribeMasterChange = syncGroup.onMasterChange((isMaster: boolean) => {
				if (resolved) {
					return;
				} // Prevent processing after resolution

				if (isMaster) {
					// This device became master while waiting
					debug(
						'[%s] Slave became master while waiting for %s at syncIndex=%d, region=%s',
						getTimestamp(),
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
				if (resolved) {
					return;
				}

				// Handle sync-coordination messages (commands and ACKs)
				if (key === 'sync-coordination' && value) {
					const message = value as SyncMessage;

					// Check if this is a command message for our region
					if (message.type === commandType && message.regionName === regionName) {
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
								debug('[%s] Wrapping resync target from %d to 1 (max=%d)', getTimestamp(), newTarget, maxIndex);
								newTarget = 1; // Wrap to first element
							}

							// Set state-specific resync target based on command type
							if (commandType === 'cmd-prepare') {
								this.synchronization.resyncTargets!.prepare = newTarget;
							} else {
								this.synchronization.resyncTargets!.play = newTarget;
							}

							debug('[%s] Master passed resync target - updating target from %d to %d', getTimestamp(), syncIndex, newTarget);
							console.log(
								`[SYNC] Master at ${message.syncIndex}, updating resync target to ${newTarget}`,
							);

							// Send ACK for master's position to not block it
							await this.sendAckForPosition(regionName, message.syncIndex, expectedState, syncGroup);

							cleanup();
							resolve(ProcessAction.RESYNC);
							return;
						}

						// Use processElementState to determine action
						const action = this.processElementState(
							virtualElementState,
							expectedState,
							syncIndex,
							regionName,
						);

						switch (action) {
							case ProcessAction.CONTINUE:
								// Exact match - we got our command
								const msg = `Received ${commandType} for region=${regionName}, syncIndex=${syncIndex}`;
								if (timedDebug) {
									timedDebug.log(msg);
								} else {
									debug('[%s] ' + msg, getTimestamp());
								}
								// Don't clear the message - we want to keep the latest for position tracking
								cleanup();
								resolve(ProcessAction.CONTINUE);
								break;

							case ProcessAction.RESYNC:
								// We're behind - resync flags already set by processElementState
								debug('[%s] Detected resync needed while waiting for %s', getTimestamp(), commandType);
								// Send ACK for master's position to not block master during resync
								await this.sendAckForPosition(regionName, message.syncIndex, expectedState, syncGroup);
								debug(
									'[%s] Sent ACK for master position %d before starting resync',
									getTimestamp(),
									message.syncIndex,
								);
								cleanup();
								resolve(ProcessAction.RESYNC);
								break;

							case ProcessAction.WAIT:
								// We're ahead - send ACK for master's position but keep waiting
								debug(
									'[%s] Slave ahead at %d, master at %d - sending ACK and waiting',
									getTimestamp(),
									syncIndex,
									message.syncIndex,
								);
								await this.sendAckForPosition(regionName, message.syncIndex, expectedState, syncGroup);
								// Don't resolve - keep listening
								break;
							default:
								// Should not happen
								debug('[%s] Unexpected action from processElementState: %s', getTimestamp(), action);
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
			debug('[%s] Sent ACK for master position %d while slave at different position', getTimestamp(), syncIndex);

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
			debug('[%s] Updated slave prepare position: region=%s, syncIndex=%d', getTimestamp(), regionName, syncIndex);
		} else if (state === 'playing') {
			this.syncState.slavePosition.play.set(regionName, syncIndex);
			debug('[%s] Updated slave play position: region=%s, syncIndex=%d', getTimestamp(), regionName, syncIndex);
		}
	}

	/**
	 * Get current positions for debugging
	 */
	private getPositions(regionName: string, state: 'prepared' | 'playing', syncGroup?: any): { slave: number; master: number } {
		// Get slave position from local tracking based on state
		const slavePos = state === 'prepared'
			? (this.syncState.slavePosition.prepare.get(regionName) || 0)
			: (this.syncState.slavePosition.play.get(regionName) || 0);

		// Get master position from the latest command message in SyncGroup
		let masterPos = 0;
		if (syncGroup) {
			const commandType = state === 'prepared' ? 'cmd-prepare' : 'cmd-play';
			const latestCommand = syncGroup.getSyncCoordinationMessage(commandType, regionName);
			if (latestCommand && latestCommand.syncIndex) {
				masterPos = latestCommand.syncIndex;
			}
		}
		// If no syncGroup provided or no command found, masterPos remains 0

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
	): Promise<boolean> {
		// Check for stored message first
		const storedMsg = syncGroup.getSyncCoordinationMessage('signal-ready', regionName);
		if (storedMsg && storedMsg.syncIndex === syncIndex) {
			const age = Date.now() - storedMsg.timestamp;
			const msg = 'Found stored signal-ready for region=%s, syncIndex=%d, age=%dms';
			if (timedDebug) {
				timedDebug.log(msg, regionName, syncIndex, age);
			} else {
				debug('[%s] ' + msg, getTimestamp(), regionName, syncIndex, age);
			}
			// Clear signal-ready after consuming (unlike commands, we don't need to keep these)
			syncGroup.clearSyncCoordinationMessage('signal-ready', regionName);
			return true; // Continue immediately - signal received
		}

		// Create promise with active listener
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
			};

			// Set up timeout
			timeoutId = setTimeout(() => {
				if (resolved) {
					return;
				}
				const timeoutMsg = `Timeout waiting for signal-ready from master for region=${regionName}, syncIndex=${syncIndex}`;
				if (timedDebug) {
					timedDebug.log(timeoutMsg);
				} else {
					debug('[%s] ' + timeoutMsg, getTimestamp());
				}
				console.log(`[SYNC] ${timeoutMsg} - will trigger resync`);
				cleanup();
				resolve(false);
			}, 500);

			// Set up active listener
			unsubscribe = syncGroup.onValue(({ key, value }: { key: string; value?: any }) => {
				if (resolved) {
					return;
				} // Prevent processing after resolution

				if (key === 'sync-coordination' && value) {
					const message = value as SyncMessage;
					// Check if this is the signal-ready we're waiting for
					if (
						message.type === 'signal-ready' &&
						message.regionName === regionName &&
						message.syncIndex === syncIndex
					) {
						const msg = `Received signal-ready for region=${regionName}, syncIndex=${syncIndex}`;
						if (timedDebug) {
							timedDebug.log(msg);
						} else {
							debug('[%s] ' + msg, getTimestamp());
						}
						// Clear consumed message
						syncGroup.clearSyncCoordinationMessage('signal-ready', regionName);
						cleanup();
						resolve(true);
					}
				}
			});
		});
	}
}
