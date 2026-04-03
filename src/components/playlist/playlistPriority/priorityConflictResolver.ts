/* tslint:disable:Unnecessary semicolon missing whitespace */
import { SMILVideo } from '../../../models/mediaModels';
import { PriorityObject } from '../../../models/priorityModels';
import { removeDigits } from '../tools/generalTools';
import Debug from 'debug';
import { PriorityBehaviour, PriorityRule } from '../../../enums/priorityEnums';
import { waitForPriorityRelease } from './priorityWaiter';
import { IPrioritySideEffects } from './prioritySideEffects';
import {
	determinePriorityRelation,
	isPeerConflict,
	selectApplicableRule,
} from './priorityDecisionEngine';
import { PriorityStateManager } from './priorityStateManager';

const debug = Debug('@signageos/smil-player:priorityConflictResolver');

export class PriorityConflictResolver {
	constructor(
		private stateManager: PriorityStateManager,
		private sideEffects: IPrioritySideEffects,
		private synchronization: { syncingInAction: boolean; movingForward: boolean },
		private getCancelFunction: () => boolean,
		private getCurrentlyPlayingSrc: (regionName: string) => string | undefined,
	) {}

	public handlePriorityBeforePlay = async (
		elementKey: string,
		priorityObject: PriorityObject,
		priorityRegionName: string,
		currentIndex: number,
		previousPlayingIndex: number,
		parent: string,
		endTime: number,
	): Promise<void> => {
		const currentIndexPriority = this.stateManager.getEntry(priorityRegionName, currentIndex);
		const previousIndexPriority = this.stateManager.getEntry(priorityRegionName, previousPlayingIndex);

		const peerConflict = isPeerConflict(previousIndexPriority, {
			priorityLevel: priorityObject.priorityLevel,
			parent,
			endTime,
		});

		// ignore priority behaviour if syncing is in action
		if ((this.synchronization.syncingInAction || this.synchronization.movingForward) && peerConflict) {
			this.stateManager.setNeverBlocked(priorityRegionName, previousPlayingIndex);
			debug('Syncing in action, skipping priority behaviour');
			return;
		}

		// if attempted to play playlist which was stopped by higher priority, wait till end of higher priority playlist and try again
		if (currentIndexPriority.parent === parent && currentIndexPriority.behaviour === PriorityBehaviour.stop) {
			await this.handlePrecedingContentStop(
				priorityObject,
				priorityRegionName,
				currentIndex,
				previousPlayingIndex,
			);
		}

		const relation = determinePriorityRelation(priorityObject.priorityLevel, previousIndexPriority.priority.priorityLevel);

		if (relation === 'higher' && previousIndexPriority.player.playing) {
			debug('Found conflict with higher priority playlist, lower: %O, higher: %O', previousIndexPriority, currentIndexPriority);
			const rule = selectApplicableRule('higher', previousIndexPriority.priority);
			await this.handlePriorityRules(elementKey, priorityObject, priorityRegionName, currentIndex, previousPlayingIndex, parent, endTime, rule);
		}

		if (peerConflict) {
			debug('Found conflict with same priority playlists, old: %O, new: %O', previousIndexPriority, currentIndexPriority);
			const rule = selectApplicableRule('peer', previousIndexPriority.priority);
			await this.handlePriorityRules(elementKey, priorityObject, priorityRegionName, currentIndex, previousPlayingIndex, parent, endTime, rule);
		}

		if (relation === 'lower' && previousIndexPriority.player.playing) {
			debug('Found conflict with lower priority playlist, higher: %O, lower: %O', previousIndexPriority, currentIndexPriority);
			const rule = selectApplicableRule('lower', previousIndexPriority.priority);
			await this.handlePriorityRules(elementKey, priorityObject, priorityRegionName, currentIndex, previousPlayingIndex, parent, endTime, rule);
		}

		debug('finished handling priority before play');
	};

	private handlePriorityRules = async (
		elementKey: string,
		priorityObject: PriorityObject,
		priorityRegionName: string,
		currentIndex: number,
		previousPlayingIndex: number,
		parent: string,
		endTime: number,
		priorityRule: PriorityRule,
	): Promise<void> => {
		switch (priorityRule) {
			case PriorityRule.never:
				await this.handleNeverBehaviour(priorityRegionName, currentIndex, previousPlayingIndex, priorityObject);
				break;
			case PriorityRule.stop:
				this.handleStopBehaviour(priorityRegionName, previousPlayingIndex);
				break;
			case PriorityRule.pause:
				this.handlePauseBehaviour(priorityRegionName, currentIndex, previousPlayingIndex);
				break;
			case PriorityRule.defer:
				await this.handleDeferBehaviour(
					elementKey,
					priorityObject,
					priorityRegionName,
					currentIndex,
					previousPlayingIndex,
					parent,
					endTime,
				);
				break;
			default:
				debug('Specified priority rule: %s is not supported', priorityRule);
		}
	};

	public handlePrecedingContentStop = async (
		priorityObject: PriorityObject,
		priorityRegionName: string,
		currentIndex: number,
		previousPlayingIndex: number,
	): Promise<void> => {
		const currentPriorityRegion = this.stateManager.getRegion(priorityRegionName)!;
		const currentIndexPriority = this.stateManager.getEntry(priorityRegionName, currentIndex);
		debug('Previous iteration of this playlist was stopped, stopping this one as well: %O', currentIndexPriority);

		const result = await waitForPriorityRelease(
			this.stateManager,
			currentPriorityRegion,
			currentIndexPriority,
			currentIndex,
			previousPlayingIndex,
			priorityRegionName,
			priorityObject,
			() => this.getCancelFunction(),
			{
				shouldExit: (newIdx) => {
					if (newIdx === -1) {
						debug('Stop behaviour, no active playlist found');
						this.stateManager.resetBehaviour(priorityRegionName, currentIndex);
						this.stateManager.resetStop(priorityRegionName, currentIndex);
						return true;
					}
					if (currentPriorityRegion[newIdx].priority.priorityLevel < priorityObject.priorityLevel) {
						debug('Stop behaviour: breaking from stop lock');
						return true;
					}
					return false;
				},
				updateBlocker: (newIdx) => {
					debug('New found playlist has same priority, wait for it to finish');
					return newIdx;
				},
			},
		);

		debug('Stop behaviour lock released with result: %s for playlist: %O', result, currentIndexPriority);
	};

	public handlePauseBehaviour = (
		priorityRegionName: string,
		currentIndex: number,
		previousPlayingIndex: number,
	): void => {
		const previousIndexPriority = this.stateManager.getEntry(priorityRegionName, previousPlayingIndex);

		if (previousIndexPriority.media.hasOwnProperty('transitionInfo')) {
			this.sideEffects.hideTransitionElement(priorityRegionName);
		}

		debug('Pausing playlist: %O', previousIndexPriority);
		this.stateManager.setPaused(priorityRegionName, previousPlayingIndex, currentIndex);
	};

	public handleStopBehaviour = (priorityRegionName: string, previousPlayingIndex: number): void => {
		const previousIndexPriority = this.stateManager.getEntry(priorityRegionName, previousPlayingIndex);

		if (previousIndexPriority.media.hasOwnProperty('transitionInfo')) {
			this.sideEffects.hideTransitionElement(priorityRegionName);
		}

		debug('Stopping playlist: %O', previousIndexPriority);
		this.stateManager.setStopped(priorityRegionName, previousPlayingIndex);
	};

	public handleNeverBehaviour = async (
		priorityRegionName: string,
		currentIndex: number,
		previousPlayingIndex: number,
		priorityObject: PriorityObject,
	) => {
		const currentIndexPriority = this.stateManager.getEntry(priorityRegionName, currentIndex);
		debug('Found never behaviour for playlist: %O, waiting for blocker to finish', currentIndexPriority);

		// SMIL spec (lower="never" / peers="never"): the new element is prevented from
		// beginning — its begin is ignored and it is not added to the queue.
		this.stateManager.setNeverBlocked(priorityRegionName, currentIndex);

		await waitForPriorityRelease(
			this.stateManager,
			this.stateManager.getRegion(priorityRegionName)!,
			currentIndexPriority,
			currentIndex,
			previousPlayingIndex,
			priorityRegionName,
			priorityObject,
			() => this.getCancelFunction(),
			{
				shouldExit: (newIdx) => {
					if (newIdx === -1) {
						return true;
					}
					// Continue blocking only if higher-priority (higher number) is still active
					return this.stateManager.getEntry(priorityRegionName, newIdx).priority.priorityLevel <=
						priorityObject.priorityLevel;
				},
				updateBlocker: (newIdx) => {
					const entry = this.stateManager.getEntry(priorityRegionName, newIdx);
					if (entry.priority.priorityLevel > priorityObject.priorityLevel) {
						return newIdx;
					}
					return null;
				},
			},
		);
	};

	public handleDeferBehaviour = async (
		elementKey: string,
		priorityObject: PriorityObject,
		priorityRegionName: string,
		currentIndex: number,
		previousPlayingIndex: number,
		parent: string,
		endTime: number,
	): Promise<void> => {
		const currentPriorityRegion = this.stateManager.getRegion(priorityRegionName)!;
		const currentIndexPriority = this.stateManager.getEntry(priorityRegionName, currentIndex);
		debug('Handling defer behaviour for playlist: %O', currentIndexPriority);
		this.stateManager.setDeferBehaviour(priorityRegionName, previousPlayingIndex);
		this.stateManager.setDeferred(priorityRegionName, currentIndex);

		// prepare video beforehand for peer priority dynamic values
		try {
			if (currentIndexPriority.media.dynamicValue && removeDigits(elementKey) === 'video') {
				if (
					this.getCurrentlyPlayingSrc(currentIndexPriority.media.regionInfo.regionName) !==
					currentIndexPriority.media.src
				) {
					await this.sideEffects.prepareVideo(
						currentIndexPriority.media as SMILVideo,
						currentIndexPriority.media.regionInfo,
					);
				}
			}
		} catch (err) {
			debug('Error while preparing dynamic content video during peer priority defer stage: %O', err);
		}

		const result = await waitForPriorityRelease(
			this.stateManager,
			currentPriorityRegion,
			currentIndexPriority,
			currentIndex,
			previousPlayingIndex,
			priorityRegionName,
			priorityObject,
			() => this.getCancelFunction(),
			{
				shouldExit: (newIdx) => {
					if (newIdx === -1) {
						debug('Defer behaviour, no active playlist found');
						this.stateManager.resetBehaviour(priorityRegionName, currentIndex);
						return true;
					}
					if (currentPriorityRegion[newIdx].priority.priorityLevel <= priorityObject.priorityLevel) {
						// Same or lower priority - can proceed, but may need peer conflict resolution
						this.stateManager.resetBehaviour(priorityRegionName, currentIndex);
						return true;
					}
					return false;
				},
				updateBlocker: (newIdx) => {
					debug('New found playlist has higher priority, setting defer behaviour for playlist: %O', currentIndexPriority);
					return newIdx;
				},
			},
		);

		// After release, if a peer/lower priority is now playing, resolve conflicts
		if (result === 'released') {
			const newPlayingIndex = this.stateManager.getPlayingIndex(priorityRegionName);
			if (newPlayingIndex !== -1 && currentPriorityRegion[newPlayingIndex].priority.priorityLevel <= priorityObject.priorityLevel) {
				await this.handlePriorityBeforePlay(
					elementKey,
					priorityObject,
					priorityRegionName,
					currentIndex,
					newPlayingIndex,
					parent,
					endTime,
				);
			}
		}
	};
}
