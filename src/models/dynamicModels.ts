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
	dynamicConfig: any;
	intervalId: Timeout;
	version: number;
};

export type DynamicPlaylistEndless = {
	[dynamic: string]: DynamicPlaylistElement;
};
