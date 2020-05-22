import Debug from 'debug';
import * as path from 'path';
export const debug = Debug('@signageos/smil-player:filesModule');

export function getFileName(filePath: string) {
	return path.basename(filePath);
}

export function getPath(filePath: string) {
	return path.dirname(filePath);
}

export function isLocalUrl(filePath: string) {
	return (filePath.indexOf('/') > 0 && filePath.indexOf('.') > 0);
}
