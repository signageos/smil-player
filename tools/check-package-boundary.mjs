// Packages under packages/ depend one way: on their own package.json deps, other workspace packages and
// files inside themselves. Two rules:
//  1. no relative import may leave its package (so nothing under packages/ reaches src/, test/, test-runner/)
//  2. the `debug` package is an implementation detail of the console logger only
// Usage: node tools/check-package-boundary.mjs   (exit 1 and one line per offender)
import fs from 'fs';
import path from 'path';

const DEBUG_ALLOWED = ['packages/logger/loggers/consoleLogger.ts', 'packages/logger/test/consoleLogger.spec.ts'];
const SPECIFIER = /(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g;
const violations = [];

for (const pkg of fs.readdirSync('packages', { withFileTypes: true }).filter((d) => d.isDirectory())) {
	const pkgDir = path.resolve('packages', pkg.name);
	const files = fs
		.readdirSync(pkgDir, { recursive: true })
		.filter((f) => /\.tsx?$/.test(f) && !f.split(path.sep).includes('node_modules'));
	for (const rel of files) {
		const file = path.join(pkgDir, rel);
		const shown = path.relative('.', file);
		fs.readFileSync(file, 'utf8')
			.split('\n')
			.forEach((text, i) => {
				for (const [, spec] of text.matchAll(SPECIFIER)) {
					if (spec.startsWith('.') && !path.resolve(path.dirname(file), spec).startsWith(pkgDir + path.sep)) {
						violations.push(`${shown}:${i + 1}: ${spec} leaves packages/${pkg.name}`);
					}
					if (spec === 'debug' && !DEBUG_ALLOWED.includes(shown)) {
						violations.push(`${shown}:${i + 1}: debug is an implementation detail of consoleLogger`);
					}
				}
			});
	}
}

if (violations.length) {
	console.error('package boundary violations:\n' + violations.join('\n'));
	process.exit(1);
}
