import { CurrentlyPlayingRegion } from '../../../src/models/playlistModels';
import { PriorityBehaviour, PriorityRule } from '../../../src/enums/priorityEnums';
import { PriorityObject } from '../../../src/models/priorityModels';
import { SMILMedia } from '../../../src/models/mediaModels';
import { RegionAttributes } from '../../../src/models/xmlJsonModels';
import { IPrioritySideEffects } from '../../../src/components/playlist/playlistPriority/prioritySideEffects';

export function makePriorityObject(overrides: Partial<PriorityObject> = {}): PriorityObject {
	return {
		priorityLevel: 0,
		maxPriorityLevel: 2,
		lower: PriorityRule.defer,
		peer: PriorityRule.never,
		higher: PriorityRule.stop,
		...overrides,
	};
}

export function makeMedia(src: string = 'test.mp4'): SMILMedia {
	return { src, regionInfo: { regionName: 'main' } as RegionAttributes } as SMILMedia;
}

export function makeRegion(overrides: Partial<CurrentlyPlayingRegion> = {}): CurrentlyPlayingRegion {
	return {
		media: makeMedia(),
		priority: makePriorityObject(),
		player: {
			contentPause: 0,
			stop: false,
			endTime: 0,
			playing: false,
			timesPlayed: 0,
			playingCompletionDeferred: undefined,
		},
		parent: 'par-abc',
		behaviour: PriorityBehaviour.none,
		version: 1,
		controlledPlaylist: null,
		isFirstInPlaylist: {} as SMILMedia,
		...overrides,
	};
}

export function makeMockSideEffects(): IPrioritySideEffects {
	return {
		hideTransitionElement: () => {},
		prepareVideo: async () => {},
		cancelDynamicPlaylist: async () => {},
	};
}
