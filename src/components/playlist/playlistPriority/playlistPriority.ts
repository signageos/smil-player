/* tslint:disable:Unnecessary semicolon missing whitespace */
import { SMILMedia } from '../../../models/mediaModels';
import { PriorityObject } from '../../../models/priorityModels';
import { isNil } from 'lodash';
import Debug from 'debug';
import { PlaylistOptions } from '../../../models/playlistModels';
import { ISos } from '../../../models/sosModels';
import { IPlaylistPriority } from './IPlaylistPriority';
import { PlaylistTriggers } from '../playlistTriggers/playlistTriggers';
import { IPrioritySideEffects, PrioritySideEffects } from './prioritySideEffects';
import {
	isEndTimeExpired,
	isPlaylistFinished,
	isRepeatCountExpired,
} from './priorityDecisionEngine';
import { PriorityStateManager } from './priorityStateManager';
import { PriorityConflictResolver } from './priorityConflictResolver';

const debug = Debug('@signageos/smil-player:playlistPriority');

export class PlaylistPriority implements IPlaylistPriority {
	public readonly stateManager: PriorityStateManager;
	private _sideEffects: IPrioritySideEffects;
	private conflictResolver: PriorityConflictResolver;
	private cancelFunction: boolean[];

	constructor(
		options: PlaylistOptions,
		sos?: ISos,
		deps?: {
			stateManager?: PriorityStateManager;
			sideEffects?: IPrioritySideEffects;
			conflictResolver?: PriorityConflictResolver;
		},
	) {
		this.cancelFunction = options.cancelFunction;
		this.stateManager = deps?.stateManager ?? new PriorityStateManager(
			options.currentlyPlayingPriority,
			options.promiseAwaiting,
		);
		this._sideEffects = deps?.sideEffects ?? new PrioritySideEffects(
			sos!,
			options.currentlyPlaying,
			options.currentlyPlayingPriority,
			options.synchronization,
			options.videoPreparing,
			(regionName, filter) => this.stateManager.cancelAllInRegion(regionName, filter),
		);
		this.conflictResolver = deps?.conflictResolver ?? new PriorityConflictResolver(
			this.stateManager,
			this._sideEffects,
			options.synchronization,
			() => this.getCancelFunction(),
			(regionName) => options.currentlyPlaying[regionName]?.src,
		);
	}

	private getCancelFunction = (): boolean => {
		return this.cancelFunction[this.cancelFunction?.length - 1];
	};

	public priorityBehaviour = async (
		value: SMILMedia,
		elementKey: string,
		version: number,
		parent: string = '0',
		endTime: number = 0,
		priorityObject: PriorityObject = <PriorityObject>{},
	): Promise<{
		currentIndex: number;
		previousPlayingIndex: number;
	}> => {
		const priorityRegionName = value.regionInfo.regionName;

		const { currentIndex, previousPlayingIndex } = this.stateManager.registerOrUpdate(
			priorityRegionName,
			value,
			parent,
			endTime,
			priorityObject,
			version,
		);
		debug('[priority] registered element: region=%s, currentIndex=%d, previousIndex=%d', priorityRegionName, currentIndex, previousPlayingIndex);

		if (this.stateManager.hasConflict(priorityRegionName, currentIndex, previousPlayingIndex)) {
			debug('[priority] detected conflict: region=%s, src=%s', priorityRegionName, this.stateManager.getEntry(priorityRegionName, currentIndex).media.src);
			await this.conflictResolver.handlePriorityBeforePlay(
				elementKey,
				priorityObject,
				priorityRegionName,
				currentIndex,
				previousPlayingIndex,
				parent,
				endTime,
			);
		}

		this.stateManager.setPlaying(priorityRegionName, currentIndex);

		return { currentIndex, previousPlayingIndex };
	};

	public handlePriorityWhenDone = async (
		value: SMILMedia,
		priorityRegionName: string,
		currentIndex: number,
		endTime: number,
		isLast: boolean,
		version: number,
		currentVersion: number,
		triggers: PlaylistTriggers,
	): Promise<void> => {
		const currentIndexPriority = this.stateManager.getEntry(priorityRegionName, currentIndex);
		debug('[priority] checking completion: region=%s, src=%s', priorityRegionName, currentIndexPriority.media.src);

		if (isNil(value.triggerValue) && endTime !== 0 && value.src === currentIndexPriority.isFirstInPlaylist.src) {
			this.stateManager.incrementTimesPlayed(priorityRegionName, currentIndex);
		}

		const endTimeExpired = isEndTimeExpired(currentIndexPriority.player.endTime);
		const repeatCountExpired = isRepeatCountExpired(currentIndexPriority.player.timesPlayed, endTime);
		const smilFileUpdated = this.getCancelFunction();
		const expiredVersion = version < currentVersion;

		debug(
			'[priority-done] checking unlock conditions for region: %s, endTimeExpired=%s, repeatCountExpired=%s, isLastElement=%s, smilFileUpdated=%s, expiredVersion=%s',
			priorityRegionName,
			endTimeExpired,
			repeatCountExpired,
			isLast,
			smilFileUpdated,
			expiredVersion,
		);

		if (isPlaylistFinished({ endTimeExpired, repeatCountExpired, isLast, smilFileUpdated, expiredVersion })) {
			debug('[priority-done] playlist finished: region=%s, src=%s', priorityRegionName, currentIndexPriority.media.src);

			const { pausedIndex } = this.stateManager.markFinished(priorityRegionName, currentIndex);

			const priorityLevel = currentIndexPriority.priority?.priorityLevel;
			if (priorityLevel !== undefined) {
				this.stateManager.cleanupPriorityTracking(priorityRegionName, version, priorityLevel);
				debug('[priority-done] cleaned up priority tracking for completed priority %s in region %s', priorityLevel, priorityRegionName);
			}

			if (!isNil(pausedIndex)) {
				debug('[priority-done] unpaused controlled playlist: region=%s', priorityRegionName);
				this.stateManager.unpauseControlled(priorityRegionName, pausedIndex);
			}

			if (currentIndexPriority.media.dynamicValue && currentIndexPriority.priority.priorityLevel !== 1000) {
				debug('[priority-done] dynamic playlist finished: region=%s, src=%s', priorityRegionName, currentIndexPriority.media.src);
				await this._sideEffects.cancelDynamicPlaylist(triggers, value, value.dynamicValue!);
			}
		} else {
			debug('[priority-done] not finished: region=%s, isLast=%s, endTimeExpired=%s, repeatCountExpired=%s', priorityRegionName, isLast, endTimeExpired, repeatCountExpired);
		}
	};

}
