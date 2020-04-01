import Debug from 'debug';
export const debug = Debug('@signageos/smil-player:filesModule');

export function getFileName(filePath: string) {
	return filePath.substring(filePath.lastIndexOf('/') + 1);
}
