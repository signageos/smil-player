import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** Append one skew record as a JSON line. Cheap, crash-safe, greppable. */
export function recordSkew(entry) {
	const path = 'logs/sync-skew.jsonl';
	mkdirSync(dirname(path), { recursive: true });
	const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
	appendFileSync(path, line);
}
