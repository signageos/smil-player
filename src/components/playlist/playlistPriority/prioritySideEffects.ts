import { cloneDeep } from 'lodash';
import Debug from 'debug';
import { SMILMedia, SMILVideo } from '../../../models/mediaModels';
import { CurrentlyPlaying, CurrentlyPlayingPriority, VideoPreparing } from '../../../models/playlistModels';
import { Synchronization } from '../../../models/syncModels';
import { ISos } from '../../../models/sosModels';
import { PlaylistTriggers } from '../playlistTriggers/playlistTriggers';
import { cancelDynamicPlaylistMaster } from '../tools/dynamicTools';
import { RegionAttributes } from '../../../models/xmlJsonModels';

const debug = Debug('@signageos/smil-player:prioritySideEffects');

/**
 * Interface for side effects performed during priority operations.
 * Abstracts DOM manipulation and SOS API calls for testability.
 */
export interface IPrioritySideEffects {
	hideTransitionElement(regionName: string): void;
	prepareVideo(video: SMILVideo, regionInfo: RegionAttributes): Promise<void>;
	cancelDynamicPlaylist(
		triggers: PlaylistTriggers,
		value: SMILMedia,
		dynamicValue: string,
	): Promise<void>;
}

/**
 * Concrete implementation that delegates to the real DOM and SOS APIs.
 */
export class PrioritySideEffects implements IPrioritySideEffects {
	constructor(
		private sos: ISos,
		private currentlyPlaying: CurrentlyPlaying,
		private currentlyPlayingPriority: CurrentlyPlayingPriority,
		private synchronization: Synchronization,
		private videoPreparing: VideoPreparing,
	) {}

	hideTransitionElement(regionName: string): void {
		const nextElementHtml = document.getElementById(this.currentlyPlaying[regionName].nextElement.id!);
		nextElementHtml?.style.setProperty('visibility', 'hidden');
	}

	async prepareVideo(video: SMILVideo, regionInfo: RegionAttributes): Promise<void> {
		await this.sos.video.prepare(
			video.localFilePath,
			regionInfo.left,
			regionInfo.top,
			regionInfo.width,
			regionInfo.height,
		);
		this.videoPreparing.fullScreenTrigger = cloneDeep(video);
		debug('Prepared dynamic content video during peer priority defer stage: %O', video);
	}

	async cancelDynamicPlaylist(
		triggers: PlaylistTriggers,
		_value: SMILMedia,
		dynamicValue: string,
	): Promise<void> {
		await cancelDynamicPlaylistMaster(
			triggers,
			this.sos,
			this.currentlyPlaying,
			this.synchronization,
			this.currentlyPlayingPriority,
			dynamicValue,
		);
	}
}
