/**
 * Standalone copy of the player's getFileName() logic for use in tests.
 * Computes the same checksummed filenames the player produces at runtime,
 * allowing selectors to be port-independent.
 *
 * Source: src/components/files/tools/index.ts + src/components/files/tools/checksum.ts
 */
import { createHash } from 'crypto';
import * as path from 'path';
import * as URLVar from 'url';

function checksumString(message: string, length: number = 50) {
	return createHash('sha256').update(message).digest('hex').substring(0, length);
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
