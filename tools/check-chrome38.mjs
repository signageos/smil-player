// Boot-time check for the Chrome 38 (webOS <= 3.x) deployment target.
// Loads dist/index.js in jsdom after deleting every builtin Chrome 38 lacks and fails on a
// synchronous throw. Catches load-order regressions where a module calls e.g. Object.assign
// before @signageos/front-applet's bundled core-js has installed the polyfills.
// Also rejects what Chrome 38's V8 fails to PARSE although es-check (acorn, modern Unicode) accepts it:
// identifiers outside the ES5 UnicodeLetter/Mn/Mc/Nd/Pc categories (a minifier unquoting {"℘": 1} into {℘: 1} —
// ES2015 ID_Start, not an ES5 letter) and raw U+2028/U+2029 line separators.
// Usage: node tools/check-chrome38.mjs [path/to/index.js]   (run after `npm run build`)
import fs from 'fs';
import { JSDOM } from 'jsdom';
import { tokenizer } from 'acorn';

const bundlePath = process.argv[2] || 'dist/index.js';
const code = fs.readFileSync(bundlePath, 'utf8');

const lineSep = code.search(/[\u2028\u2029]/);
if (lineSep !== -1) {
	console.error(`Chrome 38 check FAILED: ${bundlePath} has a raw U+2028/U+2029 at offset ${lineSep}`);
	process.exit(1);
}
const es5Identifier = /^[\p{L}\p{Nl}$_][\p{L}\p{Nl}$_\p{Mn}\p{Mc}\p{Nd}\p{Pc}\u200c\u200d]*$/u;
for (const token of tokenizer(code, { ecmaVersion: 5 })) {
	if (token.type.label === 'name' && !es5Identifier.test(token.value)) {
		console.error(`Chrome 38 check FAILED: ${bundlePath} has non-ES5 identifier ${JSON.stringify(token.value)} at offset ${token.start}`);
		process.exit(1);
	}
}
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
	runScripts: 'outside-only',
	url: 'file:///applet/index.html',
	pretendToBeVisual: true,
});
const w = dom.window;
w.eval(`(function () {
	var del = function (o, k) { if (o && k in o) { delete o[k]; } };
	['assign', 'entries', 'values', 'getOwnPropertyDescriptors', 'fromEntries'].forEach(function (k) { del(Object, k); });
	['from', 'of'].forEach(function (k) { del(Array, k); });
	['find', 'findIndex', 'fill', 'includes', 'flat', 'flatMap', 'copyWithin', 'at', 'values'].forEach(function (k) { del(Array.prototype, k); });
	['includes', 'startsWith', 'endsWith', 'repeat', 'padStart', 'padEnd', 'trimStart', 'trimEnd', 'codePointAt', 'matchAll', 'replaceAll', 'at'].forEach(function (k) { del(String.prototype, k); });
	['raw', 'fromCodePoint'].forEach(function (k) { del(String, k); });
	del(Promise.prototype, 'finally');
	['allSettled', 'any'].forEach(function (k) { del(Promise, k); });
	['Reflect', 'Proxy', 'globalThis', 'URLSearchParams', 'AbortController', 'AbortSignal', 'fetch', 'queueMicrotask', 'structuredClone', 'IntersectionObserver', 'ResizeObserver', 'requestIdleCallback', 'BroadcastChannel'].forEach(function (k) { del(window, k); });
	['closest', 'append', 'prepend', 'after', 'before', 'replaceWith', 'getRootNode', 'toggleAttribute'].forEach(function (k) { del(Element.prototype, k); });
	del(NodeList.prototype, 'forEach');
})();`);
w.console.log = () => {}; // silence the player's own boot logs
try {
	w.eval(code + '\n//# sourceURL=index.js');
} catch (e) {
	console.error(`Chrome 38 check FAILED: ${bundlePath} throws at load on a Chrome-38 API surface:\n${e && e.stack}`);
	process.exit(1);
}
console.log(`Chrome 38 check OK: ${bundlePath} loads on a Chrome-38 API surface`);
process.exit(0);
