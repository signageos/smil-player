
import { createHash } from 'crypto';

export function checksumString(message: string, length: number = 50) {
	const hash = createHash('sha256');
	hash.update(message);
	return hash.digest('hex').substring(0, length);
}
