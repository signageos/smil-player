import Debug from 'debug';
export const debug = Debug('@signageos/smil-player:filesModule');

export function getFileName(filePath: string) {
	return filePath.substring(filePath.lastIndexOf('/') + 1);
}

export function getPath(filePath: string) {
	return filePath.substring(0, filePath.lastIndexOf('/') + 1);
}

export function isLocalUrl(filePath: string) {
	return (filePath.indexOf('/') > 0 && filePath.indexOf('.') > 0);
}
