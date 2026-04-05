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

	private static readonly MAX_PRIORITY_RECURSION_DEPTH = 3;

	public handlePriorityBeforePlay = async (
		elementKey: string,
		priorityObject: PriorityObject,
		priorityRegionName: string,
		currentIndex: number,
		previousPlayingIndex: number,
		parent: string,
		endTime: number,
		depth: number = 0,
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
			debug('[priority] skipping priority behaviour: sync in progress');
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
			const rule = selectApplicableRule('higher', previousIndexPriority.priority);
			debug('[priority] detected conflict: type=higher, rule=%s, incoming=%s (pri=%d), existing=%s (pri=%d)', rule, currentIndexPriority.media.src, priorityObject.priorityLevel, previousIndexPriority.media.src, previousIndexPriority.priority.priorityLevel);
			await this.handlePriorityRules(elementKey, priorityObject, priorityRegionName, currentIndex, previousPlayingIndex, parent, endTime, rule, depth);
		} else if (peerConflict) {
			const rule = selectApplicableRule('peer', previousIndexPriority.priority);
			debug('[priority] detected conflict: type=peer, rule=%s, incoming=%s (pri=%d), existing=%s (pri=%d)', rule, currentIndexPriority.media.src, priorityObject.priorityLevel, previousIndexPriority.media.src, previousIndexPriority.priority.priorityLevel);
			await this.handlePriorityRules(elementKey, priorityObject, priorityRegionName, currentIndex, previousPlayingIndex, parent, endTime, rule, depth);
		} else if (relation === 'lower' && previousIndexPriority.player.playing) {
			const rule = selectApplicableRule('lower', previousIndexPriority.priority);
			debug('[priority] detected conflict: type=lower, rule=%s, incoming=%s (pri=%d), existing=%s (pri=%d)', rule, currentIndexPriority.media.src, priorityObject.priorityLevel, previousIndexPriority.media.src, previousIndexPriority.priority.priorityLevel);
			await this.handlePriorityRules(elementKey, priorityObject, priorityRegionName, currentIndex, previousPlayingIndex, parent, endTime, rule, depth);
		}

		debug('[priority] completed priority resolution');
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
		depth: number,
	): Promise<void> => {
		debug('[priority] applying rule: %s, region=%s', priorityRule, priorityRegionName);
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
					depth,
				);
				break;
			default:
				debug('[priority] unsupported priority rule: %s', priorityRule);
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
		debug('[priority] blocking element: previous iteration stopped by higher priority, src=%s', currentIndexPriority.media.src);

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
						debug('[priority] stop released: no active higher-priority blocker');
						this.stateManager.resetBehaviour(priorityRegionName, currentIndex);
						this.stateManager.resetStop(priorityRegionName, currentIndex);
						return true;
					}
					if (currentPriorityRegion[newIdx].priority.priorityLevel < priorityObject.priorityLevel) {
						debug('[priority] stop released: blocker has lower priority');
						return true;
					}
					return false;
				},
				updateBlocker: (newIdx) => {
					debug('[priority] stop waiting: new blocker has same priority');
					return newIdx;
				},
			},
		);

		debug('[priority] stop lock released: result=%s, src=%s', result, currentIndexPriority.media.src);
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

		debug('[priority] pausing playlist: src=%s, reason=higher/peer priority takeover', previousIndexPriority.media.src);
		this.stateManager.setPaused(priorityRegionName, previousPlayingIndex, currentIndex);
	};

	public handleStopBehaviour = (priorityRegionName: string, previousPlayingIndex: number): void => {
		const previousIndexPriority = this.stateManager.getEntry(priorityRegionName, previousPlayingIndex);

		if (previousIndexPriority.media.hasOwnProperty('transitionInfo')) {
			this.sideEffects.hideTransitionElement(priorityRegionName);
		}

		debug('[priority] stopping playlist: src=%s, reason=higher priority stop rule', previousIndexPriority.media.src);
		this.stateManager.setStopped(priorityRegionName, previousPlayingIndex);
	};

	public handleNeverBehaviour = async (
		priorityRegionName: string,
		currentIndex: number,
		previousPlayingIndex: number,
		priorityObject: PriorityObject,
	) => {
		const currentIndexPriority = this.stateManager.getEntry(priorityRegionName, currentIndex);
		debug('[priority] never behaviour: blocking element src=%s, waiting for blocker to finish', currentIndexPriority.media.src);

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
		depth: number = 0,
	): Promise<void> => {
		const currentPriorityRegion = this.stateManager.getRegion(priorityRegionName)!;
		const currentIndexPriority = this.stateManager.getEntry(priorityRegionName, currentIndex);
		debug('[priority] defer behaviour: queuing src=%s until current content finishes', currentIndexPriority.media.src);
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
			debug('[priority] defer error: failed to prepare dynamic video: %O', err);
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
						debug('[priority] defer released: no active higher-priority blocker');
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
					debug('[priority] defer continuing: new blocker has higher priority, src=%s', currentIndexPriority.media.src);
					return newIdx;
				},
			},
		);

		// After release, if a peer/lower priority is now playing, resolve conflicts
		if (result === 'released') {
			const newPlayingIndex = this.stateManager.getPlayingIndex(priorityRegionName);
			if (newPlayingIndex !== -1 && currentPriorityRegion[newPlayingIndex].priority.priorityLevel <= priorityObject.priorityLevel) {
				if (depth >= PriorityConflictResolver.MAX_PRIORITY_RECURSION_DEPTH) {
					debug('[priority] max recursion depth reached: depth=%d, region=%s', depth, priorityRegionName);
					return;
				}
				await this.handlePriorityBeforePlay(
					elementKey,
					priorityObject,
					priorityRegionName,
					currentIndex,
					newPlayingIndex,
					parent,
					endTime,
					depth + 1,
				);
			}
		}
	};
}
