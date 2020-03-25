import Debug from 'debug';
export const debug = Debug('filesModule');

export function getFileName(filePath: string) {
	return filePath.substring(filePath.lastIndexOf('/') + 1);
}
