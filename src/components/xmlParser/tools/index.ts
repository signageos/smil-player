import Debug from 'debug';
import { SMILMediaSingle } from '../../../models';
export const debug = Debug('@signageos/smil-player:xmlParseModule');

export function containsElement(arr: SMILMediaSingle[], fileSrc: string): boolean  {
	return arr.filter(function (elem: SMILMediaSingle) {
		return elem.src === fileSrc;
	}).length > 0;
}
