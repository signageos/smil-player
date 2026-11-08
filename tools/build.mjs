// Player build: esbuild bundles src/index.ts into one IIFE, swc lowers it to ES5 for Chrome 38 (webOS 3.x).
// Polyfills are NOT injected here; they come from @signageos/front-applet's bundled core-js (see check:chrome38).
//
//   node tools/build.mjs            build once into dist/
//   node tools/build.mjs --watch    rebuild on src changes
//   node tools/build.mjs --serve    after the build, serve dist/ in the local emulator (tools/emulator.mjs, :8090)
//   NODE_ENV=production             minify, no source maps
import { build, context } from 'esbuild';
import { transform } from '@swc/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = path.join(root, 'dist');
const prod = process.env.NODE_ENV === 'production';
const watch = process.argv.includes('--watch');
const serve = process.argv.includes('--serve');

/** @type {import('esbuild').BuildOptions} */
const esbuildOptions = {
	absWorkingDir: root,
	entryPoints: ['src/index.ts'],
	outdir: 'dist',
	bundle: true,
	format: 'iife',
	platform: 'browser',
	target: 'esnext', // swc does all the downleveling below
	supported: { 'unicode-escapes': false }, // printer-level: keep astral chars as surrogate pairs, not \u{…}
	sourcemap: prod ? false : 'external',
	write: false, // the JS goes through swc first; assets are written as-is
	loader: { '.jpg': 'file' },
	alias: {
		// Use the compiled dist version instead of ES6 modules
		'@signageos/front-applet/es6/FrontApplet/FrontApplet': '@signageos/front-applet',
		'@signageos/front-applet/es6/FrontApplet/Sync/Sync': './src/shims/SyncShim.js',
		// Node builtins used by src/ (webpack 4 polyfilled these silently)
		path: 'path-browserify',
		events: 'events',
		timers: './src/shims/timers.js',
	},
	// Only reached on node code paths (js-sha256's node branch, sax stream writes); never evaluated in a browser.
	external: ['crypto', 'buffer'],
	define: { 'process.env.NODE_ENV': JSON.stringify(prod ? 'production' : 'development') },
	logLevel: 'info',
	plugins: [{ name: 'es5', setup: (b) => b.onEnd(emit) }],
};

async function emit(result) {
	if (result.errors.length) {
		return;
	}
	fs.mkdirSync(dist, { recursive: true });
	const files = Object.fromEntries(result.outputFiles.map((f) => [path.basename(f.path), f]));
	for (const f of result.outputFiles) {
		if (!/\.js(\.map)?$/.test(f.path)) {
			fs.writeFileSync(f.path, f.contents);
		}
	}
	const started = Date.now();
	const out = await transform(files['index.js'].text, {
		filename: 'index.js',
		isModule: false,
		env: { targets: { chrome: '38' } },
		minify: prod,
		jsc: prod ? { minify: { compress: true, mangle: true } } : undefined,
		sourceMaps: !prod,
		inputSourceMap: prod ? undefined : files['index.js.map'].text,
	});
	let code = out.code;
	if (out.map) {
		fs.writeFileSync(path.join(dist, 'index.js.map'), out.map);
		code += '\n//# sourceMappingURL=index.js.map';
	}
	fs.writeFileSync(path.join(dist, 'index.js'), code);
	fs.copyFileSync(path.join(root, 'public/index.html'), path.join(dist, 'index.html'));
	console.log(`swc → ES5: ${(code.length / 1024 / 1024).toFixed(1)} MB in ${Date.now() - started} ms`);
}

if (watch) {
	const ctx = await context(esbuildOptions);
	await ctx.watch();
} else {
	await build(esbuildOptions);
}

if (serve) {
	await import('./emulator.mjs');
}
