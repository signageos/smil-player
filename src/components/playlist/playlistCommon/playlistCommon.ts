/* tslint:disable:Unnecessary semicolon missing whitespace */
import { Log } from '../../../logger';
import {
	CurrentlyPlaying,
	CurrentlyPlayingPriority,
	PlaylistOptions,
	PromiseAwaiting,
	RandomPlaylist,
	VideoPreparing,
} from '../../../models/playlistModels';
import { Synchronization } from '../../../models/syncModels';
import { RegionAttributes } from '../../../models/xmlJsonModels';
import { SMILTicker } from '../../../models/mediaModels';
import { isNil } from 'lodash';
import { SMILVideo } from '../../../models/mediaModels';
import { ISos } from '../../../models/sosModels';
import { FilesManager } from '../../files/filesManager';
import { createScheduleTools, ScheduleTools } from '../tools/scheduleTools';
import { stopTickerAnimation } from '../tools/tickerTools';
import { ExprTag } from '../../../enums/conditionalEnums';
import { SMILEnums } from '../../../enums/generalEnums';
import { SMILScheduleEnum } from '../../../enums/scheduleEnums';
import { SMILTriggersEnum } from '../../../enums/triggerEnums';
import { SMILDynamicEnum } from '../../../enums/dynamicEnums';
import { IPlaylistCommon } from './IPlaylistCommon';
import { DynamicPlaylistEndless } from '../../../models/dynamicModels';
import { Deferred } from '../tools/Deferred';

export class PlaylistCommon implements IPlaylistCommon {
	protected sos: ISos;
	protected files: FilesManager;
	protected cancelFunction: boolean[] = [];
	protected currentlyPlaying: CurrentlyPlaying = {};
	protected promiseAwaiting: PromiseAwaiting = {};
	protected currentlyPlayingPriority: CurrentlyPlayingPriority = {};
	protected synchronization: Synchronization;
	protected videoPreparing: VideoPreparing = {};
	protected lastPreparedVideoUrl: { [regionName: string]: string } = {};
	protected randomPlaylist: RandomPlaylist = {};
	protected cancelDeferred: Deferred<void> = new Deferred<void>();
	protected regionChangeDeferred: Deferred<void> = new Deferred<void>();

	protected readonly schedule: ScheduleTools;

	constructor(sos: ISos, files: FilesManager, options: PlaylistOptions, protected readonly log: Log) {
		this.schedule = createScheduleTools(log);
		this.sos = sos;
		this.files = files;
		this.cancelFunction = options.cancelFunction;
		this.currentlyPlaying = options.currentlyPlaying;
		this.promiseAwaiting = options.promiseAwaiting;
		this.currentlyPlayingPriority = options.currentlyPlayingPriority;
		this.synchronization = options.synchronization;
		this.videoPreparing = options.videoPreparing;
		this.randomPlaylist = options.randomPlaylist;
	}

	// disables endless loop for media playing
	public disableLoop = (value: boolean) => {
		this.cancelFunction.push(value);
	};

	protected getCancelFunction = (): boolean => {
		return this.cancelFunction[this.cancelFunction?.length - 1];
	};

	protected waitForCancelFunction(): Promise<void> {
		if (this.getCancelFunction()) { return Promise.resolve(); }
		return this.cancelDeferred.promise;
	}

	public notifyRegionChange(): void {
		this.regionChangeDeferred.resolve();
		this.regionChangeDeferred = new Deferred<void>();
	}

	protected waitForRegionChange(): Promise<void> {
		return this.regionChangeDeferred.promise;
	}

	/**
	 * runs function given as parameter in endless loop
	 * @param fn - Function
	 * @param version - smil internal version of current playlist
	 * @param conditionalExpr
	 * @param dynamicPlaylist
	 * @param dynamicPlaylistId
	 */
	protected runEndlessLoop = async (
		fn: Function,
		version: number = 0,
		conditionalExpr: string = '',
		dynamicPlaylist: DynamicPlaylistEndless = {},
		dynamicPlaylistId: string | undefined = undefined,
	) => {
		while (
			!this.cancelFunction[version] &&
			(conditionalExpr === '' || !this.schedule.shouldSkipElement({ [ExprTag]: conditionalExpr })) &&
			(!dynamicPlaylistId ||
				!dynamicPlaylist[dynamicPlaylistId] ||
				dynamicPlaylist[dynamicPlaylistId]?.play === true)
		) {
			try {
				const result = await fn();
				if (result === SMILScheduleEnum.allExpired) {
					this.log.debug('[playback] breaking endless loop: all wallclock content expired');
					break;
				}
			} catch (err) {
				this.log.debug('[playback] error in %s: %O', fn.name, err);
				throw err;
			}
		}
	};

	protected stopAllContent = async (cancelFullscreen: boolean = true) => {
		for (let [, region] of Object.entries(this.currentlyPlaying)) {
			if (cancelFullscreen) {
				// option to cancel fullscreen region during smil update when using dynamic playlist functionality
				if ('regionInfo' in region && region.regionInfo.regionName !== SMILEnums.defaultRegion) {
					await this.cancelPreviousMedia(region.regionInfo, true);
					// has nested regions - cancel content which is playing in nested regions
					if (region.regionInfo.region) {
						if (!Array.isArray(region.regionInfo.region)) {
							region.regionInfo.region = [region.regionInfo.region];
						}

						for (const nestedRegion of region.regionInfo.region) {
							await this.cancelPreviousMedia(nestedRegion, true);
						}
					}
				}
			} else {
				if (
					'regionInfo' in region &&
					region.regionInfo.regionName !== SMILEnums.defaultRegion &&
					region.regionInfo.regionName !== 'fullScreenTrigger'
				) {
					await this.cancelPreviousMedia(region.regionInfo, true);
				}
			}
		}
	};

	/**
	 * determines which function to use to cancel previous content
	 * @param regionInfo - information about region when current video belongs to
	 * @param isPlaylistUpdate - if element is cancelled during smil playlist update or not, default value is false
	 */
	protected cancelPreviousMedia = async (regionInfo: RegionAttributes, isPlaylistUpdate: boolean = false) => {
		this.log.debug(
			'[playback] cancelling media: region=%s, tag=%s',
			regionInfo.regionName,
			this.currentlyPlaying[regionInfo.regionName]?.media,
		);
		switch (this.currentlyPlaying[regionInfo.regionName]?.media) {
			case 'video':
				await this.cancelPreviousVideo(regionInfo);
				break;
			case 'html':
				await this.cancelPreviousHtmlElement(regionInfo, isPlaylistUpdate);
				break;
			case 'ticker':
				await this.cancelPreviousTicker(regionInfo);
			default:
				this.log.debug('[playback] unsupported element for cancellation');
				break;
		}
	};

	/**
	 * Clears the per-region identity fields after an element finishes/cancels so the
	 * next cycle's findFirstFreeRegion reservation (which sets `playing=true` ~5s
	 * before cmd-play) is not mistaken for a still-displaying element by gating
	 * predicates such as isRegionOrNestedActive. Identity is set alongside the
	 * visible flip in setCurrentlyPlaying, making `playing && (triggerValue ||
	 * dynamicValue)` the reliable "actually painted" signal.
	 */
	private clearRegionIdentity(regionName: string): void {
		const entry = this.currentlyPlaying[regionName];
		if (!entry) { return; }
		delete entry[SMILDynamicEnum.dynamicValue];
		delete entry[SMILTriggersEnum.triggerValue];
		delete entry.syncGroupName;
	}

	/**
	 * sets element which played in current region before currently playing element invisible ( image, widget, video )
	 * @param regionInfo - information about region when current video belongs to
	 * @param isPlaylistUpdate - if element is cancelled during smil playlist update or not, default value is false
	 */
	private cancelPreviousHtmlElement = async (regionInfo: RegionAttributes, isPlaylistUpdate?: boolean) => {
		try {
			this.log.debug('[playback] previous html element playing: region=%s', regionInfo.regionName);
			if (isNil(this.currentlyPlaying[regionInfo.regionName])) {
				this.log.debug('[playback] html element already cancelled');
				return;
			}
			const element = <HTMLImageElement>document.getElementById(this.currentlyPlaying[regionInfo.regionName].id);
			element.style.visibility = 'hidden';

			/* previous widget was cancelled, remove src to improve playback performance,
			but only during regular cancel and not when newer playlist is cancelling other one ( one widget in region bug ) */
			if (element.id.indexOf('ref') > -1 && !isPlaylistUpdate) {
				element.src = '';
			}

			this.currentlyPlaying[regionInfo.regionName].player = 'stop';
			this.currentlyPlaying[regionInfo.regionName].playing = false;
			this.clearRegionIdentity(regionInfo.regionName);
			this.notifyRegionChange();
		} catch (err) {
			await this.cancelPreviousVideo(regionInfo);
		}
	};

	private cancelPreviousTicker = async (regionInfo: RegionAttributes) => {
		try {
			stopTickerAnimation(this.currentlyPlaying[regionInfo.regionName] as SMILTicker);
			this.currentlyPlaying[regionInfo.regionName].player = 'stop';
			this.currentlyPlaying[regionInfo.regionName].playing = false;
			this.clearRegionIdentity(regionInfo.regionName);
			this.notifyRegionChange();
		} catch (err) {
			this.log.debug('[playback] ticker cancellation error: %O', err);
		}
	};

	/**
	 * removes video from DOM which played in current region before currently playing element ( image, widget or video )
	 * @param regionInfo - information about region when current video belongs to
	 */
	private cancelPreviousVideo = async (regionInfo: RegionAttributes) => {
		try {
			this.log.debug('[playback] previous video playing: region=%s', regionInfo.regionName);
			if (isNil(this.currentlyPlaying[regionInfo.regionName])) {
				this.log.debug('[playback] video already cancelled');
				return;
			}

			this.currentlyPlaying[regionInfo.regionName].player = 'stop';

			const video = <SMILVideo>this.currentlyPlaying[regionInfo.regionName];
			const sosVideoObject = isNil(video.isStream) ? this.sos.video : this.sos.stream;
			const videoElement = isNil(video.isStream) ? 'video' : 'stream';
			const elementUrl = isNil(video.isStream) ? video.localFilePath : video.src;

			let localRegionInfo = video.regionInfo;
			// cancelling trigger, have to find correct nested region
			if (localRegionInfo.regionName !== regionInfo.regionName) {
				localRegionInfo.region.forEach((nestedRegion: RegionAttributes) => {
					if (nestedRegion.regionName === regionInfo.regionName) {
						localRegionInfo = nestedRegion;
					}
				});
			}
			this.log.debug('[playback] stopping video: %O', video);
			await sosVideoObject.stop(
				elementUrl,
				localRegionInfo.left,
				localRegionInfo.top,
				localRegionInfo.width,
				localRegionInfo.height,
			);
			video.playing = false;
			this.clearRegionIdentity(regionInfo.regionName);
			this.notifyRegionChange();
			this.log.debug('[playback] previous %s stopped: %O', videoElement, video);
		} catch (err) {
			this.log.debug('[playback] video cancellation error: %O', err);
		}
	};
}
