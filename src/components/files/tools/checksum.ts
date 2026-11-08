import { sha256 } from 'js-sha256';

export function checksumString(message: string, length: number = 50) {
	return sha256(message).substring(0, length);
}
