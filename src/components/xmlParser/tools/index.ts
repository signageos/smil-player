import Debug from 'debug';
import { SMILFile } from '../../../models';
export const debug = Debug('@signageos/smil-player:xmlParseModule');

export function containsElement(arr: any[], fileSrc: string): boolean  {
	if (arr.filter(function(elem: SMILFile) { return elem.src === fileSrc; }).length > 0) {
		return true;
	}
	return false;
}
