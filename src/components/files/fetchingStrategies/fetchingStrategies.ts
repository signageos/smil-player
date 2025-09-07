import { MergedDownloadList } from '../../../models/filesModels';
import { ConditionalExprFormat } from '../../../enums/conditionalEnums';
import { createDownloadPath, debug } from '../tools';
import { DEFAULT_LAST_MODIFIED } from '../../../enums/fileEnums';
import { SMILEnums } from '../../../enums/generalEnums';

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
	): Promise<string | null>;
	strategyType?: string;
}

const locationHeaderStrategy: FetchStrategy = async (
	media,
	timeOut,
	skipContentHttpStatusCodes = [],
	updateContentHttpStatusCodes = [],
	makeXhrRequest,
) => {
	let response: Response;
	const downloadUrl = createDownloadPath(media.updateCheckUrl ?? media.src);
	try {
		// Reset skipContent expression if it exists
		if (media.expr === ConditionalExprFormat.skipContent) {
			delete media.expr;
		}

		const authHeaders = window.getAuthHeaders?.(downloadUrl);
		response = await makeXhrRequest('HEAD', downloadUrl, timeOut, authHeaders);
	} catch (err) {
		// Handle timeout specifically
		if (err.message === 'Request timeout') {
			debug('Request to %s was aborted due to timeout.', media.src, timeOut);
			return media.src; // Return original URL on timeout
		}

		// Log other errors with more detail
		debug('HEAD request to %s failed with error: %O', media.src, err);

		// Handle local fallback based on configuration
		if (media.allowLocalFallback === false) {
			debug('allowLocalFallback is false. Skipping content.', media.src);
			media.expr = ConditionalExprFormat.skipContent;
		} else {
			debug('allowLocalFallback is true. Proceeding with local fallback.', media.src);
		}
		return null;
	}

	const resourceLocation = response?.headers?.get('location') ?? response.url;

	debug('Received response when calling HEAD request for url: %s: %O, %d', downloadUrl, response, timeOut);

	// Use Location header if it exists, otherwise use media.src
	if (response && resourceLocation) {
		media.useInReportUrl = resourceLocation;
		debug('Using Location header for reporting: %s', resourceLocation);
	} else {
		media.useInReportUrl = media.src;
		debug('Using original source URL for reporting: %s', media.src);
	}

	// Handle server errors (5xx)
	if (response.status >= 500 && response.status < 600) {
		debug('Server returned error code: %s for media: %s', response.status, media.src);

		if (media.allowLocalFallback === false) {
			debug('allowLocalFallback is false. Skipping content.');
			media.expr = ConditionalExprFormat.skipContent;
		} else {
			debug('allowLocalFallback is true or undefined (legacy). Proceeding with local fallback.');
		}

		return media.src; // Return original URL on server error
	}

	// Handle skip content status codes
	if (response && skipContentHttpStatusCodes.includes(response.status)) {
		debug(
			'Response code: %s for media: %s is included in skipContentHttpStatusCodes: %s, skipping content',
			response.status,
			media.src,
			skipContentHttpStatusCodes,
		);
		media.expr = ConditionalExprFormat.skipContent;
	}

	// Handle update content status codes
	if (response && updateContentHttpStatusCodes.includes(response.status)) {
		debug(
			'Response code: %s for media: %s is included in updateContentHttpStatusCodes: %s, forcing update',
			response.status,
			media.src,
			updateContentHttpStatusCodes,
		);
		// if there is no location return url
		return resourceLocation ?? media.src;
	}

	// Return the Location header after redirects or original URL if not available
	debug('Final Location header for media: %s, location: %s', media.src, resourceLocation);
	return resourceLocation || media.src;
};

const lastModifiedStrategy: FetchStrategy = async (
	media,
	timeOut,
	skipContentHttpStatusCodes = [],
	updateContentHttpStatusCodes = [],
	makeXhrRequest,
) => {
	let response: Response;
	try {
		// Reset skipContent expression if it exists
		if (media.expr === ConditionalExprFormat.skipContent) {
			delete media.expr;
		}

		const downloadUrl = createDownloadPath(media.updateCheckUrl ?? media.src);
		const authHeaders = window.getAuthHeaders?.(downloadUrl);

		response = await makeXhrRequest('HEAD', downloadUrl, timeOut, authHeaders);
	} catch (err) {
		// Handle timeout specifically
		if (err.message === 'Request timeout') {
			debug('Request to %s was aborted due to timeout.', media.src);
			return DEFAULT_LAST_MODIFIED;
		}

		// Log other errors
		debug('HEAD request to %s failed with error: %O', media.src, err);

		// Handle local fallback based on configuration
		if (media.allowLocalFallback === false) {
			debug('allowLocalFallback is false. Skipping content.', media.src);
			media.expr = ConditionalExprFormat.skipContent;
		} else {
			debug('allowLocalFallback is true. Proceeding with local fallback.', media.src);
		}
		return null;
	}

	debug('Received response when calling HEAD request for url: %s: %O', media.src, response, timeOut);

	// Extract URL from response if it exists, otherwise use media.src
	if (response && response.url) {
		media.useInReportUrl = response.url || media.src;
		debug('Using response URL for reporting: %s', response.url);
	} else {
		media.useInReportUrl = media.src;
		debug('Using original source URL for reporting: %s', media.src);
	}

	// Handle server errors (5xx)
	if (response.status >= 500 && response.status < 600) {
		debug('Server returned error code: %s for media: %s', response.status, media.src);

		if (media.allowLocalFallback === false) {
			debug('allowLocalFallback is false. Skipping content.');
			media.expr = ConditionalExprFormat.skipContent;
		} else {
			debug('allowLocalFallback is true or undefined (legacy). Proceeding with local fallback.');
		}

		return DEFAULT_LAST_MODIFIED;
	}

	// Handle skip content status codes
	if (response && skipContentHttpStatusCodes.includes(response.status)) {
		debug(
			'Response code: %s for media: %s is included in skipContentHttpStatusCodes: %s, skipping content',
			response.status,
			media.src,
			skipContentHttpStatusCodes,
		);
		media.expr = ConditionalExprFormat.skipContent;
	}

	// Handle update content status codes
	if (response && updateContentHttpStatusCodes.includes(response.status)) {
		debug(
			'Response code: %s for media: %s is included in updateContentHttpStatusCodes: %s, forcing update',
			response.status,
			media.src,
			updateContentHttpStatusCodes,
		);

		// Create a future date in the same format as DEFAULT_LAST_MODIFIED
		const futureDate = new Date();
		futureDate.setFullYear(futureDate.getFullYear() + 1);
		const futureDateString = futureDate.toUTCString();

		debug('Forcing update by returning future date: %s', futureDateString);
		return futureDateString;
	}

	// Get last-modified header or use default
	const newLastModified = response?.headers?.get('last-modified');
	debug('New last-modified header received for media: %s, last-modified: %s', media.src, newLastModified);
	return newLastModified || DEFAULT_LAST_MODIFIED;
};

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
