import Debug from 'debug';
import get = require('lodash/get');
import { RegionAttributes, RegionsObject } from '../../../models';

export const debug = Debug('@signageos/smil-player:playlistModule');

let cancelFunction = false;

export function disableLoop(value: boolean) {
	cancelFunction = value;
}

export async function sleep(ms: number): Promise<object> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

export async function runEndlessLoop(fn: Function) {
	while (!cancelFunction) {
		try {
			await fn();
		} catch (err) {
			debug('Error: %O occured during processing function %s', err, fn.name);
			throw err;
		}
	}
}

export function getRegionInfo(regionObject: RegionsObject, regionName: string): RegionAttributes {
	let regionInfo = get(regionObject.region, regionName, regionObject.rootLayout);
	debug('Getting region info: %O for region name: %s', regionInfo, regionName);
	regionInfo = {
		...regionInfo,
		x: parseInt(regionInfo.x ?? 0),
		y: parseInt(regionInfo.y ?? 0),
		width: parseInt(regionInfo.width),
		height: parseInt(regionInfo.height),
	};
	return regionInfo;
}
