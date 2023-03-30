import { RegionAttributes } from './xmlJsonModels';

export type DynamicPlaylist = {
	data: string;
	syncId: string;
	action: string;
};

export type DynamicPlaylistEndless = {
	[dynamic: string]: {
		play: boolean;
		latestEventFired: number;
		regionInfo: RegionAttributes;
		dynamicRandom: number;
		parentRegion: string;
		syncId: string;
		isMaster: boolean;
		dynamicConfig: any;
	};
};
