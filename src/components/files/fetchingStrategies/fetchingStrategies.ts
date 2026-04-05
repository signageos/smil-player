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

interface StrategyCallbacks {
	prefix: string;
	onTimeout: (media: MergedDownloadList) => string | null;
	onServerError: (media: MergedDownloadList) => string | null;
	getReportUrl: (response: Response, media: MergedDownloadList) => string;
	onUpdateContent: (response: Response, reportUrl: string, media: MergedDownloadList) => string;
	extractFinalValue: (response: Response, reportUrl: string, media: MergedDownloadList) => string;
}

async function executeHeadRequest(
	media: MergedDownloadList,
	timeOut: number,
	skipContentHttpStatusCodes: number[],
	updateContentHttpStatusCodes: number[],
	makeXhrRequest: XhrRequestFunction,
	callbacks: StrategyCallbacks,
): Promise<string | null> {
	const { prefix } = callbacks;
	let response: Response;

	try {
		if (media.expr === ConditionalExprFormat.skipContent) {
			delete media.expr;
		}

		const downloadUrl = createDownloadPath(media.updateCheckUrl ?? media.src);
		const authHeaders = window.getAuthHeaders?.(downloadUrl);
		response = await makeXhrRequest('HEAD', downloadUrl, timeOut, authHeaders);
	} catch (err) {
		if (err.message === 'Request timeout') {
			debug('[files] %s request aborted (timeout=%d): src=%s', prefix, timeOut, media.src);
			return callbacks.onTimeout(media);
		}

		debug('[files] %s HEAD request failed: src=%s, error=%O', prefix, media.src, err);

		if (media.allowLocalFallback === false) {
			debug('[files] %s skipping content (no local fallback): src=%s', prefix, media.src);
			media.expr = ConditionalExprFormat.skipContent;
		} else {
			debug('[files] %s using local fallback: src=%s', prefix, media.src);
		}
		return null;
	}

	const reportUrl = callbacks.getReportUrl(response, media);
	media.useInReportUrl = reportUrl;
	debug('[files] %s HEAD response: src=%s, status=%d, reportUrl=%s', prefix, media.src, response.status, reportUrl);

	if (response.status >= 500 && response.status < 600) {
		debug('[files] %s server error: status=%d, src=%s', prefix, response.status, media.src);

		if (media.allowLocalFallback === false) {
			debug('[files] %s skipping content (no local fallback): src=%s', prefix, media.src);
			media.expr = ConditionalExprFormat.skipContent;
		} else {
			debug('[files] %s using local fallback: src=%s', prefix, media.src);
		}
		return callbacks.onServerError(media);
	}

	if (response && skipContentHttpStatusCodes.includes(response.status)) {
		debug('[files] %s skipping content (status=%d matched skip codes): src=%s', prefix, response.status, media.src);
		media.expr = ConditionalExprFormat.skipContent;
	}

	if (response && updateContentHttpStatusCodes.includes(response.status)) {
		debug('[files] %s forcing update (status=%d matched update codes): src=%s', prefix, response.status, media.src);
		return callbacks.onUpdateContent(response, reportUrl, media);
	}

	return callbacks.extractFinalValue(response, reportUrl, media);
}

const locationCallbacks: StrategyCallbacks = {
	prefix: '[location]',
	onTimeout: (media) => media.src,
	onServerError: (media) => media.src,
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
	onTimeout: () => null,
	onServerError: () => null,
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
