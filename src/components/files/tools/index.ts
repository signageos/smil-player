import Debug from 'debug';
import * as path from 'path';
import * as querystring from 'querystring';
import * as URLVar from 'url';
import { corsAnywhere } from '../../../../config/parameters';
import { MediaInfoObject, MergedDownloadList } from '../../../models/filesModels';
import { CustomEndpointReport, ItemType } from '../../../models/reportingModels';
import { checksumString } from './checksum';
import {
	DEFAULT_LAST_MODIFIED,
	FileStructure,
	mapObject,
	WidgetExtensions,
	WidgetFullPath,
} from '../../../enums/fileEnums';
import { isNil } from 'lodash';
import get = require('lodash/get');
import IRecordItemOptions from '@signageos/front-applet/es6/FrontApplet/ProofOfPlay/IRecordItemOptions';
import { removeLastArrayItem } from '../../playlist/tools/generalTools';
import moment from 'moment';

export const debug = Debug('@signageos/smil-player:filesManager');

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
	const filePathChecksum = parsedUrl.host
		? `_${checksumString(parsedUrl.host + parsedUrl.pathname + JSON.stringify(parsedUrl.query), 8)}`
		: '';
	const fileName = path.basename(parsedUrl.pathname ?? url);
	const sanitizedExtname = path
		.extname(parsedUrl.pathname ?? url)
		.replace(/[^\w\.\-]+/gi, '')
		.substr(0, 10);
	const sanitizedFileName = decodeURIComponent(fileName.substr(0, fileName.length - sanitizedExtname.length))
		.replace(/[^\w\.\-]+/gi, '-')
		.substr(0, 10);
	return `${sanitizedFileName}${filePathChecksum}${sanitizedExtname}`;
}

export function getPath(filePath: string) {
	return path.dirname(filePath);
}

/**
 * Get URL without query parameters for comparison purposes.
 * Used for deduplication and grouping to treat URLs with different query params
 * (like campaign definitions) as the same content.
 * @param url - The URL to strip query params from
 * @returns URL without query parameters, or original value if not a valid URL
 */
export function getUrlWithoutQueryParams(url: string | number): string {
	if (!url || typeof url !== 'string') {
		return String(url);
	}
	try {
		const parsedUrl = new URL(url);
		return `${parsedUrl.origin}${parsedUrl.pathname}`;
	} catch {
		// If URL parsing fails, try simple split (handles relative URLs)
		return url.split('?')[0];
	}
}

export function createDownloadPath(sourceUrl: string): string {
	return `${corsAnywhere}${createVersionedUrl(sourceUrl)}`;
}

// assets/loading.mp4 => http://example-smil-url.com/assets/loading.mp4
export function convertRelativePathToAbsolute(src: string, smilFileUrl: string): string {
	return isRelativePath(src) ? `${getPath(smilFileUrl)}/${src}` : src;
}

export function createVersionedUrl(
	sourceUrl: string,
	playlistVersion: number = 0,
	smilUrlVersion: string | null = null,
	isWidget: boolean = false,
	wasUpdated: boolean = false,
): string {
	const parsedUrl = URLVar.parse(sourceUrl, true);
	const searchLength = parsedUrl.search?.length ?? 0;
	const urlWithoutSearch = sourceUrl.substr(0, sourceUrl.length - searchLength);
	// do not generate unique query string __smil_version for websites
	if (isWidget && !isLocalFileWidget(sourceUrl)) {
		return urlWithoutSearch;
	}
	parsedUrl.query.__smil_version = generateSmilUrlVersion(playlistVersion, smilUrlVersion, wasUpdated);
	return urlWithoutSearch + '?' + querystring.encode(parsedUrl.query);
}

export function generateSmilUrlVersion(
	playlistVersion: number = 0,
	smilUrlVersion: string | null = null,
	wasUpdated: boolean = false,
): string {
	if (
		!isNil(smilUrlVersion) &&
		playlistVersion === parseInt(smilUrlVersion.substring(smilUrlVersion.indexOf('_') + 1)) &&
		!wasUpdated
	) {
		return smilUrlVersion;
	}

	return `${getRandomInt(1000000).toString()}_${playlistVersion}`;
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
	// no query parameters, return url without ? character
	if (Object.keys(parsedToUrl.query).length === 0) {
		return toUrlWithoutSearch;
	}
	return toUrlWithoutSearch + '?' + querystring.encode(parsedToUrl.query);
}

export function createLocalFilePath(localFilePath: string, src: string): string {
	return `${localFilePath}/${getFileName(src)}`;
}

export function createJsonStructureMediaInfo(fileList: MergedDownloadList[]): MediaInfoObject {
	let fileLastModifiedObject: MediaInfoObject = {};
	for (let file of fileList) {
		fileLastModifiedObject[getFileName(file.src)] = file.lastModified
			? file.lastModified
			: moment(DEFAULT_LAST_MODIFIED).valueOf();
	}
	return fileLastModifiedObject;
}

export function updateJsonObject(jsonObject: MediaInfoObject, attr: string, value: number | string) {
	jsonObject[attr] = value;
}

export function mapFileType(filePath: string): ItemType {
	const fileType = filePath.substring(filePath.lastIndexOf('/') + 1);
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
	return (
		(localFilePath === FileStructure.widgets && !isWidgetUrl(file.src)) ||
		(localFilePath === FileStructure.videos && file.hasOwnProperty('isStream'))
	);
}

export function isWidgetUrl(widgetUrl: string): boolean {
	for (const ext of WidgetExtensions) {
		if (getFileName(widgetUrl).indexOf(ext) > -1) {
			return true;
		}
	}
	return false;
}

export function isLocalFileWidget(filePath: string): boolean {
	return filePath.includes(WidgetFullPath);
}

export function createPoPMessagePayload(value: MergedDownloadList): IRecordItemOptions {
	return {
		...{
			name: value.popName!,
		},
		...(value.popCustomId ? { customId: value.popCustomId } : {}),
		...(value.popType ? { type: value.popType } : {}),
		...(value.popTags
			? { tags: [...value.popTags.split(','), value.useInReportUrl!, new Date().toISOString()] }
			: {}),
		...(value.popFileName ? { fileName: value.popFileName } : {}),
	};
}

export function createCustomEndpointMessagePayload(
	message: IRecordItemOptions,
	locationUrl?: string,
	statusCode?: number,
): CustomEndpointReport {
	return {
		...message,
		...(message.tags ? { tags: removeLastArrayItem(message.tags) } : {}),
		status: statusCode ?? 200,
		time: Math.floor(Date.now() / 1000),
		url: locationUrl || '',
	};
}
