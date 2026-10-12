import * as path from 'path';
import * as URLVar from 'url';
import { checksumString } from './checksum';

/**
 * Checksummed local filename for a source URL — the single source of truth,
 * deliberately dependency-light (node-safe) so test code (the duration
 * generator, e2e selectors) can import the exact algorithm the player uses
 * instead of maintaining a copy.
 */
export function getFileName(url: string, fallbackUrlForExt?: string) {
	if (!url) {
		return url;
	}
	const parsedUrl = URLVar.parse(url);
	const filePathChecksum = parsedUrl.host
		? `_${checksumString(parsedUrl.host + parsedUrl.pathname + JSON.stringify(parsedUrl.query), 8)}`
		: '';
	const fileName = path.basename(parsedUrl.pathname ?? url);
	const originalExtname = path.extname(parsedUrl.pathname ?? url);
	let sanitizedExtname = originalExtname.replace(/[^\w\.\-]+/gi, '').substr(0, 10);

	// When the primary URL pathname has no extension (e.g. an API endpoint that
	// returns the file via a Location header), borrow the extension from the
	// resolved fallback URL so the on-disk filename can carry it. The `host`
	// guard makes sure non-URL strings (e.g. a Last-Modified date) cannot poison
	// the extension.
	if (!sanitizedExtname && typeof fallbackUrlForExt === 'string') {
		const fallbackParsed = URLVar.parse(fallbackUrlForExt);
		if (fallbackParsed.host) {
			const fallbackExt = path
				.extname(fallbackParsed.pathname ?? '')
				.replace(/[^\w\.\-]+/gi, '')
				.substr(0, 10);
			if (fallbackExt) {
				sanitizedExtname = fallbackExt;
			}
		}
	}

	// Chop the basename by the ORIGINAL extension length, never the fallback's —
	// the basename never contained the fallback extension.
	const rawStem = fileName.substr(0, fileName.length - originalExtname.length);
	// decodeURIComponent throws URIError on malformed `%XX` sequences. This
	// function is upstream of ~18 callers (storage keys, download paths,
	// widget extraction), so letting the throw propagate would blow up
	// large swaths of the file pipeline. Fall back to the raw stem —
	// the sanitization below (.replace(/[^\w\.\-]+/gi, '-')) strips `%`
	// characters down to `-`, so the output is still deterministic.
	let decodedStem: string;
	try {
		decodedStem = decodeURIComponent(rawStem);
	} catch (_err) {
		decodedStem = rawStem; // observable through hasMalformedStem(); logged by FilesManager
	}
	const sanitizedFileName = decodedStem.replace(/[^\w\.\-]+/gi, '-').substr(0, 10);
	return `${sanitizedFileName}${filePathChecksum}${sanitizedExtname}`;
}

/**
 * True when the URL's basename contains a malformed %XX sequence, in which case getFileName() and
 * getStorageFileName() silently fall back to the raw stem. Callers that own a Log use this to record
 * the fallback; the name functions themselves stay pure so test tooling can import them.
 */
export function hasMalformedStem(url: string): boolean {
	if (!url) {
		return false;
	}
	const parsedUrl = URLVar.parse(url);
	try {
		decodeURIComponent(path.basename(parsedUrl.pathname ?? url));
		return false;
	} catch (_err) {
		return true;
	}
}

/**
 * Generate filename for storage folder - hash based on host + pathname only (no query params).
 * This ensures same content with different query params (e.g., campaign IDs) gets same filename.
 * Different hosts still get different filenames.
 */
export function getStorageFileName(url: string) {
	if (!url) {
		return url;
	}
	const parsedUrl = URLVar.parse(url);
	// Hash based on host + pathname only - NO query params
	const filePathChecksum = parsedUrl.host
		? `_${checksumString(parsedUrl.host + parsedUrl.pathname, 8)}`
		: '';
	const fileName = path.basename(parsedUrl.pathname ?? url);
	const sanitizedExtname = path
		.extname(parsedUrl.pathname ?? url)
		.replace(/[^\w\.\-]+/gi, '')
		.substr(0, 10);
	const rawStem = fileName.substr(0, fileName.length - sanitizedExtname.length);
	let decodedStem: string;
	try {
		decodedStem = decodeURIComponent(rawStem);
	} catch (_err) {
		decodedStem = rawStem; // observable through hasMalformedStem(); logged by FilesManager
	}
	const sanitizedFileName = decodedStem.replace(/[^\w\.\-]+/gi, '-').substr(0, 10);
	return `${sanitizedFileName}${filePathChecksum}${sanitizedExtname}`;
}
