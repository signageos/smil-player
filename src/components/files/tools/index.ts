import Debug from 'debug';
import * as path from 'path';
export const debug = Debug('@signageos/smil-player:filesModule');
// regExp for valid path testing
const reg = new RegExp('^([A-Za-z]:|[A-Za-z0-9_-]+(\\.[A-Za-z0-9_-]+)*)((/[A-Za-z0-9_.-]+)*)$');

export function getFileName(filePath: string) {
	return path.basename(filePath);
}

export function getPath(filePath: string) {
	return path.dirname(filePath);
}

export function isValidLocalPath(filePath: string) {
	return reg.test(filePath);
}
