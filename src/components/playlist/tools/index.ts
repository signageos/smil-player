import Debug from 'debug';
import get = require('lodash/get');
import isNil = require('lodash/isNil');
import cloneDeep = require('lodash/cloneDeep');
import { RegionAttributes, RegionsObject, InfiniteLoopObject, PrefetchObject } from '../../../models';
import { defaults as config } from "../../../config";

export const debug = Debug('@signageos/smil-player:playlistModule');

let cancelFunction = false;

export function disableLoop(value: boolean) {
	cancelFunction = value;
}
// checks if given object contains prefetch element
function checkPrefetchObject(obj: PrefetchObject, path: string): boolean {
	return get(obj, path, 'notFound') === 'notFound';
}
/*	used for detection infinite loops in SMIL file
	these are seq or par section which does not contain any media files:
	example:
	seq: [{
		dur: "60s"
	}, {
		prefetch: [{
			src: "http://butikstv.centrumkanalen.com/play/render/widgets/ebbapettersson/top/top.wgt"
		}, {
			src: "http://butikstv.centrumkanalen.com/play/render/widgets/ebbapettersson/vasttrafik/vasttrafik_news.wgt"
		}, {
			src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbalunch.png"
		}, {
			src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbaical.png"
		}]
	}]
*/
export function detectPrefetchLoop(obj: InfiniteLoopObject): boolean {
	let result = true;
	if (Array.isArray(get(obj, 'seq', 'notFound'))) {
		(<PrefetchObject[]> get(obj, 'seq', 'notFound')).forEach((elem: PrefetchObject) => {
			result = checkPrefetchObject(elem, 'prefetch');
		});
	}

	if (Array.isArray(get(obj, 'par', 'notFound'))) {
		(<PrefetchObject[]> get(obj, 'par', 'notFound')).forEach((elem: PrefetchObject) => {
			result = checkPrefetchObject(elem, 'prefetch');
		});
	}
	if (get(obj, 'seq.prefetch', 'notFound') !== 'notFound') {
		result = false;
	}

	if (get(obj, 'par.prefetch', 'notFound') !== 'notFound') {
		result = false;
	}

	// black screen check, will be removed in future versions
	if (get(obj, 'seq.ref.src', 'notFound') === 'adapi:blankScreen') {
		result = false;
	}

	return result;
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

export function fixVideoDimension(regionInfo: RegionAttributes): RegionAttributes {
	const resultObject: any = cloneDeep(regionInfo);
	Object.keys(resultObject).forEach((attr: string) => {
		// sos video does not support values in %
		if (config.constants.cssElementsPosition.includes(attr) && resultObject[attr].indexOf('%') > 0) {
			switch (attr) {
				case 'width':
					resultObject.width = Math.floor(document.body.clientWidth * parseInt(resultObject.width) / 100);
					break;
				case 'height':
					resultObject.height = Math.floor(document.body.clientHeight * parseInt(resultObject.height) / 100);
					break;
				case 'left':
					resultObject.left = Math.floor(document.body.clientWidth * parseInt(resultObject.left) / 100);
					break;
				case 'top':
					resultObject.top = Math.floor(document.body.clientHeight * parseInt(resultObject.top) / 100);
					break;
				default:
				// unhandled attribute
			}
		}
	});

	return resultObject;
}

export function getRegionInfo(regionObject: RegionsObject, regionName: string): RegionAttributes {
	let regionInfo = get(regionObject.region, regionName, regionObject.rootLayout);
	// unify regionName for further uses in code
	if (regionInfo.hasOwnProperty(config.constants.regionNameAlias)) {
		regionInfo.regionName = regionInfo[config.constants.regionNameAlias];
		delete regionInfo[config.constants.regionNameAlias];
	}

	regionInfo = fixVideoDimension(regionInfo);
	debug('Getting region info: %O for region name: %s', regionInfo, regionName);
	regionInfo = {
		...regionInfo,
		...(!isNil(regionInfo.top) && { top: parseInt(regionInfo.top)}),
		...(!isNil(regionInfo.left) && { left: parseInt(regionInfo.left)}),
		width: parseInt(regionInfo.width),
		height: parseInt(regionInfo.height),
	};
	return regionInfo;
}
