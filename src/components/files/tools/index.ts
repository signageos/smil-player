import Debug from 'debug';
import * as path from 'path';
import { corsAnywhere } from '../../../../config/parameters';
export const debug = Debug('@signageos/smil-player:filesModule');
// regExp for valid path testing
const reg = new RegExp('^([A-Za-z]:|[A-Za-z0-9_-]+(\\.[A-Za-z0-9_-]+)*)((/[A-Za-z0-9_.-]+)*)$');

function getRandomInt(max: number) {
	return Math.floor(Math.random() * Math.floor(max));
}

export function getFileName(filePath: string) {
	return path.basename(filePath);
}

export function getPath(filePath: string) {
	return path.dirname(filePath);
}

export function isValidLocalPath(filePath: string) {
	return reg.test(filePath);
}

export function createDownloadPath(sourceUrl: string): string {
	return `${corsAnywhere}${sourceUrl}?v=${getRandomInt(1000000)}`;
}
