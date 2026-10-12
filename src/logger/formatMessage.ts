const SPECIFIER = /%[sdOX]/g;

function renderObject(value: unknown): string {
	if (value instanceof Error) {
		return value.stack || `${value.name}: ${value.message}`;
	}
	try {
		const json = JSON.stringify(value);
		return json === undefined ? String(value) : json;
	} catch (_e) {
		try {
			return String(value);
		} catch (_e2) {
			return '[unprintable]';
		}
	}
}

function renderOne(spec: string, value: unknown): string {
	switch (spec) {
		case '%s':
			return String(value);
		case '%d':
			return String(Number(value));
		case '%X':
			return Number(value).toString(16);
		default:
			return renderObject(value);
	}
}

/**
 * Renders a printf-style template and its args into one string. Supports %s %d %O %X.
 * A missing arg leaves its specifier in place; leftover args are appended space-separated.
 * Never throws. Output is truncated to maxLength with a trailing ellipsis.
 */
export function formatMessage(message: string, args: unknown[], maxLength: number = 2048): string {
	let index = 0;
	let out: string;
	try {
		out = message.replace(SPECIFIER, (spec) => (index < args.length ? renderOne(spec, args[index++]) : spec));
		for (; index < args.length; index++) {
			const extra = args[index];
			out += ' ' + (typeof extra === 'string' ? extra : renderObject(extra));
		}
	} catch (_e) {
		out = message;
	}
	return out.length > maxLength ? out.slice(0, maxLength - 1) + '…' : out;
}
