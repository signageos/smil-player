import Debug from 'debug';
import * as path from 'path';
import * as querystring from 'querystring';
import * as URLVar from 'url';
import get = require('lodash/get');
import { corsAnywhere } from '../../../../config/parameters';
import { MediaInfoObject, MergedDownloadList } from '../../../models/filesModels';
import { ItemType } from "../../../models/reportingModels";
import { checksumString } from './checksum';
import { WidgetExtensions } from '../../../enums/fileEnums';
import { FileStructure } from "../../../enums/fileEnums";
import { isNil } from 'lodash';

export const debug = Debug('@signageos/smil-player:filesModule');

export function getRandomInt(max: number) {
	return Math.floor(Math.random() * Math.floor(max));
}

export function isRelativePath(filePath: string) {
	const parsedUrl = URLVar.parse(filePath);
	return !parsedUrl.host;
}

export function getProtocol(url: string): string {
	let protocol = new URL(url).protocol.slice(0, -1);
	protocol = protocol.toLowerCase() === 'https' ? 'http' : protocol;
	return protocol;
}

export function getFileName(url: string) {
	if (!url) {
		return url;
	}
	const parsedUrl = URLVar.parse(url);
	const filePathChecksum = parsedUrl.host ? `_${checksumString(parsedUrl.host + parsedUrl.pathname, 8)}` : '';
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

export function createVersionedUrl(sourceUrl: string, smilUrlVersion: string | null = null): string {
	const parsedUrl = URLVar.parse(sourceUrl, true);
	const searchLength = parsedUrl.search?.length ?? 0;
	const urlWithoutSearch = sourceUrl.substr(0, sourceUrl.length - searchLength);
	parsedUrl.query.__smil_version = !isNil(smilUrlVersion) ? smilUrlVersion : getRandomInt(1000000).toString();
	return urlWithoutSearch + '?' + querystring.encode(parsedUrl.query);
}

export function getSmilVersionUrl(sourceUrl: string | null): string | null {
	if (isNil(sourceUrl)) {
		return null;
	}
	const query = URLVar.parse(sourceUrl, true).query;
	if (!isNil(query.__smil_version)) {
		return query.__smil_version as string;
	}
	return null;
}

export function copyQueryParameters(fromUrl: string, toUrl: string) {
	const parsedFromUrl = URLVar.parse(fromUrl, true);
	const parsedToUrl = URLVar.parse(toUrl, true);
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

export function mapFileType(filePath: string): ItemType {
	const mapObject = <const> {
		smil: 'smil',
		images: 'image',
		videos: 'video',
		widgets: 'ref',
		audios: 'audio',
	};
	const fileType = filePath.substring(filePath.lastIndexOf('/'));
	return get(mapObject, fileType, 'unknown');
}

export function createSourceReportObject(localFilePath: string, fileSrc: string, type: string = '') {
	return {
		filePath: {
			path: localFilePath,
			storage: type,
		},
		uri: fileSrc,
		localUri: localFilePath,
	};
}

export function shouldNotDownload(localFilePath: string, file: MergedDownloadList): boolean {
	return (localFilePath === FileStructure.widgets && !isWidgetUrl(file.src))
		|| (localFilePath === FileStructure.videos && file.hasOwnProperty('isStream'));
}

export function isWidgetUrl(widgetUrl: string): boolean {
	for (const ext of WidgetExtensions) {
		if (getFileName(widgetUrl).indexOf(ext) > -1) {
			return true;
		}
	}
	return false;
}
