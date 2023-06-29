import { RegionAttributes } from './xmlJsonModels';
import Timeout = NodeJS.Timeout;

export type DynamicPlaylist = {
	data: string;
	syncId: string;
	action: string;
	requestUid: string;
};

export type DynamicPlaylistElement = {
	play: boolean;
	latestEventFired: number;
	regionInfo: RegionAttributes;
	dynamicRandom: number;
	parentRegion: string;
	syncId: string;
	isMaster: boolean;
	dynamicConfig: DynamicPlaylist;
	intervalId: Timeout;
	version: number;
	dynamicPlaylistId: string;
};

export type DynamicPlaylistEndless = {
	[dynamic: string]: DynamicPlaylistElement;
};
