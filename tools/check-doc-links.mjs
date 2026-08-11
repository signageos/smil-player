import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';

const files = [];
(function walk(d) {
	for (const e of readdirSync(d)) {
		const p = join(d, e);
		if (e === 'superpowers' || e === 'node_modules') continue;
		if (statSync(p).isDirectory()) walk(p);
		else if (e.endsWith('.md')) files.push(p);
	}
})('docs');

let broken = 0;
for (const f of files) {
	const text = readFileSync(f, 'utf8');
	for (const m of text.matchAll(/\]\(([^)]+)\)/g)) {
		const link = m[1].split('#')[0].trim();
		if (!link || /^[a-z]+:/i.test(link) || link.startsWith('/')) continue;
		const target = resolve(dirname(f), link);
		if (!existsSync(target)) {
			console.log(`BROKEN: ${f} -> ${m[1]}`);
			broken++;
		}
	}
}
process.exit(broken ? 1 : 0);
