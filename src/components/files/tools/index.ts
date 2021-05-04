import Debug from 'debug';
import * as path from 'path';
import * as querystring from 'querystring';
import * as URL from 'url';
import { corsAnywhere } from '../../../../config/parameters';
import { MediaInfoObject, MergedDownloadList } from '../../../models/filesModels';
import { checksumString } from './checksum';
export const debug = Debug('@signageos/smil-player:filesModule');

export function getRandomInt(max: number) {
	return Math.floor(Math.random() * Math.floor(max));
}

export function isRelativePath(filePath: string) {
	const parsedUrl = URL.parse(filePath);
	return !parsedUrl.host;
}

export function getFileName(url: string) {
	if (!url) {
		return url;
	}
	const parsedUrl = URL.parse(url);
	const filePathChecksum = parsedUrl.host ? `_${checksumString(url, 8)}` : '';
	const fileName = path.basename(parsedUrl.pathname ?? url);
	const sanitizedExtname = path.extname(parsedUrl.pathname ?? url).replace(/[^\w\.\-]+/gi, '').substr(0, 10);
	const sanitizedFileName = decodeURIComponent(fileName.substr(0, fileName.length - sanitizedExtname.length))
		.replace(/[^\w\.\-]+/gi, '-')
		.substr(0, 10);
	return `${sanitizedFileName}${filePathChecksum}${sanitizedExtname}`;
}

export function getPath(filePath: string) {
	return path.dirname(filePath);
}

export function createDownloadPath(sourceUrl: string): string {
	return `${corsAnywhere}${createVersionedUrl(sourceUrl)}`;
}

export function createVersionedUrl(sourceUrl: string): string {
	const parsedUrl = URL.parse(sourceUrl, true);
	const searchLength = parsedUrl.search?.length ?? 0;
	const urlWithoutSearch = sourceUrl.substr(0, sourceUrl.length - searchLength);
	parsedUrl.query.__smil_version = getRandomInt(1000000).toString();
	return urlWithoutSearch + '?' + querystring.encode(parsedUrl.query);
}

export function copyQueryParameters(fromUrl: string, toUrl: string) {
	const parsedFromUrl = URL.parse(fromUrl, true);
	const parsedToUrl = URL.parse(toUrl, true);
	const searchLength = parsedToUrl.search?.length ?? 0;
	const toUrlWithoutSearch = toUrl.substr(0, toUrl.length - searchLength);
	Object.assign(parsedToUrl.query, parsedFromUrl.query);
	return toUrlWithoutSearch + '?' + querystring.encode(parsedToUrl.query);
}

export function createLocalFilePath(localFilePath: string, src: string): string {
	return `${localFilePath}/${getFileName(src)}`;
}

export function createJsonStructureMediaInfo(fileList: MergedDownloadList[]): MediaInfoObject {
	let fileLastModifiedObject: MediaInfoObject = {};
	for (let file of fileList) {
		fileLastModifiedObject[getFileName(file.src)] = file.lastModified ? file.lastModified : 0;
	}
	return fileLastModifiedObject;
}

export function updateJsonObject(jsonObject: MediaInfoObject, attr: string, value: any) {
	jsonObject[attr] = value;
}
