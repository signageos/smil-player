// Browser stand-in for node's `timers` (xml2js requires it at load time).
export function setImmediate(fn) {
	return setTimeout(fn, 0);
}
