import Debug from 'debug';
import * as path from 'path';
import * as querystring from 'querystring';
import * as URLVar from 'url';
import { corsAnywhere } from '../../../../config/parameters';
import { MediaInfoObject, MergedDownloadList } from '../../../models/filesModels';
import { CustomEndpointReport, ItemType } from '../../../models/reportingModels';
import { getFileName, getStorageFileName } from './fileName';
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

const isUrl = require('is-url-superb');

/**
 * Extracts a valid URL string from updateValue, returns undefined if not a valid URL.
 * Used for passing explicit reportUrl to sendDownloadReport.
 */
export function getReportUrlFromUpdateValue(updateValue: string | number | undefined): string | undefined {
	return typeof updateValue === 'string' && isUrl(updateValue) ? updateValue : undefined;
}

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

export { getFileName, getStorageFileName };

export function getPath(filePath: string) {
	return path.dirname(filePath);
}

/**
 * Get URL without query parameters for comparison purposes.
 * Used for deduplication and grouping to treat URLs with different query params
 * (like campaign definitions) as the same content.
 * @param url - The URL to strip query params from (can be null)
 * @returns URL without query parameters, or original value if not a valid URL
 */
export function getUrlWithoutQueryParams(url: string | number | null | undefined): string {
	if (url === null || url === undefined) {
		return '';
	}
	if (typeof url !== 'string') {
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
	// Tizen AVPlayer rejects any query string on file:// URIs with
	// PLAYER_ERROR_INVALID_URI, so we cannot use __smil_version as an HTTP-style
	// cache-buster here. Callers (rePrepareUpdatedVideo) already stop the stale
	// player before prepare, which frees the pool slot and forces a fresh player
	// instance — URI-level versioning is redundant for local files.
	if (sourceUrl.startsWith('file://')) {
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

export function createLocalFilePath(localFilePath: string, src: string, fallbackUrlForExt?: string): string {
	return `${localFilePath}/${getFileName(src, fallbackUrlForExt)}`;
}

/**
 * Resolve the canonical filename key for `srcUrl` against `mediaInfoObject`.
 *
 * The location-header strategy may produce URLs whose pathname has no extension
 * (e.g. ".../content"). We still want the on-disk filename (and the in-memory
 * key) to include the resolved extension from the Location header. Callers that
 * already hold the resolved Location URL should call `getFileName(srcUrl, locationUrl)`
 * directly. Callers that only have `srcUrl` plus the persisted `mediaInfoObject`
 * use this helper: it returns the canonical key already present in the map
 * (which carries the extension) when one exists, falling back to the bare
 * `getFileName(srcUrl)` for brand-new entries that haven't been committed yet.
 */
export function getCanonicalFileName(srcUrl: string, mediaInfoObject: MediaInfoObject): string {
	const baseKey = getFileName(srcUrl);
	// Fast path: the URL pathname already carried its own extension, so baseKey
	// IS the canonical key. Gate on the extension itself — NOT on the key being
	// present in the map. A present-but-extensionless baseKey may be a stale
	// pre-extension-borrowing entry that is now shadowed by an extensionful
	// sibling; resolving to it would pin reports to a frozen Location URL.
	if (path.extname(baseKey)) {
		return baseKey;
	}
	// Slow path: scan for a previously-committed entry whose key starts with
	// `baseKey.` — that's the extensionful canonical name we wrote last time.
	const prefix = baseKey + '.';
	for (const key of Object.keys(mediaInfoObject)) {
		if (key.startsWith(prefix)) {
			return key;
		}
	}
	// No prior entry — caller should pass a fallback once it has one (from HEAD).
	return baseKey;
}

/**
 * Remove legacy extensionless keys (`name_<hash>`) that are shadowed by an
 * extensionful sibling (`name_<hash>.<ext>`).
 *
 * Builds before extension-borrowing wrote location-header entries under the
 * bare `getFileName(src)` key. Current builds write the extensionful form. On a
 * device upgraded across that change both keys coexist, and the stale bare key
 * is never refreshed again — `getCanonicalFileName` must resolve to the
 * extensionful sibling, and this prune drops the dead bare key for good.
 *
 * Bare keys with no extensionful sibling are left alone: they are the only
 * record for that entry and the next update cycle rewrites them correctly.
 *
 * Mutates `mediaInfoObject` in place and returns the removed keys.
 */
export function pruneShadowedMediaInfoKeys(mediaInfoObject: MediaInfoObject): string[] {
	const removed: string[] = [];
	const keys = Object.keys(mediaInfoObject);
	for (const key of keys) {
		if (path.extname(key)) {
			continue;
		}
		const prefix = key + '.';
		if (keys.some((other) => other.startsWith(prefix))) {
			delete mediaInfoObject[key];
			removed.push(key);
		}
	}
	return removed;
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

/**
 * playCheckUrl gate classifier: skip playback when the gate response status is explicitly listed
 * in skipPlaybackOnHttpStatus, or — with the element's playCheckSkipOnError flag — on any unlisted
 * 5xx ("server broken"). Everything else plays (fail-open). An empty list means the gate is inert
 * (the meta is required, no default).
 */
export function shouldGateSkipForStatus(
	status: number,
	skipPlaybackHttpStatusCodes: number[],
	skipOnError: boolean = false,
): boolean {
	if (skipPlaybackHttpStatusCodes.includes(status)) {
		return true;
	}
	return skipOnError && status >= 500 && status < 600;
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

export function createPoPMessagePayload(
	value: MergedDownloadList,
	errMessage: string | null = null,
	event: 'download' | undefined = undefined,
): IRecordItemOptions {
	return {
		...{
			name: value.popName!,
		},
		...(event !== 'download' ? { playbackSuccess: !errMessage } : {}),
		...(errMessage ? { errorMessage: errMessage } : {}),
		...(value.popCustomId ? { customId: value.popCustomId } : {}),
		...(value.popType ? { type: value.popType } : {}),
		...(value.popTags
			? { tags: [...value.popTags.split(','), value.useInReportUrl!, new Date().toISOString()] }
			: {}),
		...(value.popFileName ? { fileName: value.popFileName } : {}),
	};
}

export interface OfflineReportFileInfo {
	numberOfReports: number;
	hasFailureReports?: boolean;
}

/**
 * Extracts the numeric index from an offline report file path
 * (e.g. smil/offlineReports/offlineReports12.csv -> 12), looking only at
 * the file name so digits elsewhere in the path cannot corrupt the index.
 */
export function getOfflineReportFileIndex(filePath: string): number {
	const fileName = filePath.split('/').pop() ?? '';
	return parseInt(fileName.split('.csv')[0].replace(/\D/g, ''), 10);
}

/**
 * The watcher holds back the currently active file only while it is purely
 * accumulating reportMode="batch" reports below the limit. Files containing
 * failure-saved realtime reports must upload on the next pass — the device
 * being back online is the whole point of saving them.
 */
export function shouldSkipActiveReportFile(
	trackedInfo: OfflineReportFileInfo | undefined,
	reportCount: number,
	reportFileLimit: number,
): boolean {
	return !!trackedInfo && !trackedInfo.hasFailureReports && reportCount < reportFileLimit;
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
