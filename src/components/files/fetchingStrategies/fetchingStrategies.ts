import { MergedDownloadList } from '../../../models/filesModels';
import { createDownloadPath, debug } from '../tools';
import { DEFAULT_LAST_MODIFIED } from '../../../enums/fileEnums';
import { SMILEnums } from '../../../enums/generalEnums';
import { UpdateCheckResult } from '../IFilesManager';

type XhrRequestFunction = (
	method: string,
	url: string,
	timeout: number,
	authHeaders?: Record<string, string>,
) => Promise<Response>;

export interface FetchStrategy {
	(
		media: MergedDownloadList,
		timeOut: number,
		skipContentHttpStatusCodes: number[],
		updateContentHttpStatusCodes: number[],
		makeXhrRequest: XhrRequestFunction,
	): Promise<UpdateCheckResult>;
	strategyType?: string;
}

interface StrategyCallbacks {
	prefix: string;
	// Value used when the request times out or hits a server/skip error.
	// location uses media.src, lastModified uses DEFAULT_LAST_MODIFIED.
	fallbackValue: (media: MergedDownloadList) => string | undefined;
	// Report URL derived from the HEAD response (stored on media.useInReportUrl).
	getReportUrl: (response: Response, media: MergedDownloadList) => string;
	// Value to return when an update is forced (updateContentHttpStatusCodes match).
	onUpdateContent: (response: Response, reportUrl: string, media: MergedDownloadList) => string;
	// Final resolved value on a normal (non-forced) successful response.
	extractFinalValue: (response: Response, reportUrl: string, media: MergedDownloadList) => string;
}

async function executeHeadRequest(
	media: MergedDownloadList,
	timeOut: number,
	skipContentHttpStatusCodes: number[] = [],
	updateContentHttpStatusCodes: number[] = [],
	makeXhrRequest: XhrRequestFunction,
	callbacks: StrategyCallbacks,
): Promise<UpdateCheckResult> {
	const { prefix } = callbacks;
	let response: Response;
	const downloadUrl = createDownloadPath(media.updateCheckUrl ?? media.src);

	try {
		// Clear the skip mark before re-checking; a failing response below re-sets it.
		// The mark is a dedicated runtime flag — media.expr stays untouched so a
		// declarative conditional survives the skip→recover cycle.
		delete media.skipContentMark;

		const authHeaders = window.getAuthHeaders?.(downloadUrl);
		response = await makeXhrRequest('HEAD', downloadUrl, timeOut, authHeaders);
	} catch (err) {
		if (err.message === 'Request timeout') {
			debug('[files] %s request aborted (timeout=%d): src=%s', prefix, timeOut, media.src);
			return { shouldUpdate: false, value: callbacks.fallbackValue(media), statusCode: 408 };
		}

		debug('[files] %s HEAD request failed: src=%s, error=%O', prefix, media.src, err);

		if (media.allowLocalFallback === false) {
			debug('[files] %s skipping content (no local fallback): src=%s', prefix, media.src);
			media.skipContentMark = true;
		} else {
			debug('[files] %s using local fallback: src=%s', prefix, media.src);
		}
		return { shouldUpdate: false, value: undefined, statusCode: 503 };
	}

	const reportUrl = callbacks.getReportUrl(response, media);
	media.useInReportUrl = reportUrl;
	debug('[files] %s HEAD response: src=%s, status=%d, reportUrl=%s', prefix, media.src, response.status, reportUrl);

	// Get Content-Length from the HEAD response.
	let contentLength = parseInt(response?.headers?.get('content-length') || '0', 10) || 0;
	// The API may return 204 with Content-Length: 0 while the real file size is on
	// the CDN URL (resolved via the Location header). Fetch the actual content URL
	// to learn the size for the pre-download space check.
	const resourceLocation = response?.headers?.get('location') ?? response.url;
	if (resourceLocation && resourceLocation !== downloadUrl && contentLength === 0) {
		try {
			const cdnAuthHeaders = window.getAuthHeaders?.(resourceLocation);
			const cdnResponse = await makeXhrRequest('HEAD', resourceLocation, timeOut, cdnAuthHeaders);
			contentLength = parseInt(cdnResponse?.headers?.get('content-length') || '0', 10) || 0;
			debug('[files] %s content-length from CDN HEAD: %d bytes for %s', prefix, contentLength, resourceLocation);
		} catch (err) {
			debug('[files] %s CDN HEAD request failed for %s: %O', prefix, resourceLocation, err);
			// Best-effort: fall back to 0 (will use MINIMAL_STORAGE_FREE_SPACE)
		}
	}

	if (response.status >= 500 && response.status < 600) {
		debug('[files] %s server error: status=%d, src=%s', prefix, response.status, media.src);

		if (media.allowLocalFallback === false) {
			debug('[files] %s skipping content (no local fallback): src=%s', prefix, media.src);
			media.skipContentMark = true;
		} else {
			debug('[files] %s using local fallback: src=%s', prefix, media.src);
		}
		return { shouldUpdate: false, value: callbacks.fallbackValue(media), statusCode: response.status };
	}

	if (response && skipContentHttpStatusCodes.includes(response.status)) {
		debug('[files] %s skipping content (status=%d matched skip codes): src=%s', prefix, response.status, media.src);
		media.skipContentMark = true;
		return { shouldUpdate: false, value: callbacks.fallbackValue(media), statusCode: response.status };
	}

	if (response && updateContentHttpStatusCodes.includes(response.status)) {
		debug('[files] %s forcing update (status=%d matched update codes): src=%s', prefix, response.status, media.src);
		return {
			shouldUpdate: true,
			value: callbacks.onUpdateContent(response, reportUrl, media),
			statusCode: response.status,
			contentLength,
		};
	}

	return {
		shouldUpdate: true,
		value: callbacks.extractFinalValue(response, reportUrl, media),
		statusCode: response.status,
		contentLength,
	};
}

const locationCallbacks: StrategyCallbacks = {
	prefix: '[location]',
	fallbackValue: (media) => media.src,
	getReportUrl: (response, media) => {
		const resourceLocation = response?.headers?.get('location') ?? response.url;
		return resourceLocation || media.src;
	},
	onUpdateContent: (_response, reportUrl, media) => reportUrl ?? media.src,
	extractFinalValue: (_response, reportUrl, media) => {
		debug('[files] resolved location: src=%s, location=%s', media.src, reportUrl);
		return reportUrl || media.src;
	},
};

const lastModifiedCallbacks: StrategyCallbacks = {
	prefix: '[lastModified]',
	fallbackValue: () => DEFAULT_LAST_MODIFIED,
	getReportUrl: (response, media) => response?.url || media.src,
	onUpdateContent: (_response, _reportUrl, media) => {
		const futureDate = new Date();
		futureDate.setFullYear(futureDate.getFullYear() + 1);
		const futureDateString = futureDate.toUTCString();
		debug('[files] forcing update (future date): src=%s, date=%s', media.src, futureDateString);
		return futureDateString;
	},
	extractFinalValue: (response, _reportUrl, media) => {
		const newLastModified = response?.headers?.get('last-modified');
		debug('[files] last-modified: src=%s, value=%s', media.src, newLastModified);
		return newLastModified || DEFAULT_LAST_MODIFIED;
	},
};

const locationHeaderStrategy: FetchStrategy = async (
	media, timeOut, skipContentHttpStatusCodes, updateContentHttpStatusCodes, makeXhrRequest,
) => executeHeadRequest(media, timeOut, skipContentHttpStatusCodes, updateContentHttpStatusCodes, makeXhrRequest, locationCallbacks);

const lastModifiedStrategy: FetchStrategy = async (
	media, timeOut, skipContentHttpStatusCodes, updateContentHttpStatusCodes, makeXhrRequest,
) => executeHeadRequest(media, timeOut, skipContentHttpStatusCodes, updateContentHttpStatusCodes, makeXhrRequest, lastModifiedCallbacks);

// Add strategy type identifiers
locationHeaderStrategy.strategyType = SMILEnums.location;
lastModifiedStrategy.strategyType = SMILEnums.lastModified;

// Strategy map
const strategies: Record<string, FetchStrategy> = {
	[SMILEnums.location]: locationHeaderStrategy,
	[SMILEnums.lastModified]: lastModifiedStrategy,
};

// Factory function
export const getStrategy = (updateMechanism: string): FetchStrategy => {
	const strategy = strategies[updateMechanism] || strategies[SMILEnums.lastModified];
	// Ensure the strategyType is preserved
	if (!strategy.strategyType) {
		strategy.strategyType = updateMechanism === SMILEnums.location ? SMILEnums.location : SMILEnums.lastModified;
	}
	return strategy;
};
