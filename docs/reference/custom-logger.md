---
sidebar_position: 6
---
# Custom logger

The SMIL Player writes all diagnostic output through one injected logger. The contract lives in
`src/logger/`; implementations live in `src/loggers/`, where the default `ConsoleLogger` prints to the
browser console when `debugEnabled` is on. To send logs elsewhere, implement one method and register it.

## The contract

```ts
import { Logger, LogEntry, formatMessage } from '../logger'; // from src/loggers/

interface LogEntry {
	level: 'debug' | 'info' | 'warn' | 'error';
	namespace: string;   // e.g. '@signageos/smil-player:filesManager'
	message: string;     // printf template, e.g. '[files] sending report: endpoint=%s'
	args: unknown[];     // template values, by reference
	timestamp: number;   // Date.now() at the call site
}

interface Logger {
	write(entry: LogEntry): void;
}
```

Rules for `write`:
- It is synchronous and fire-and-forget. Exceptions are swallowed by the player, so a broken logger
  cannot stop playback, but you will not be told about them either.
- Filtering by level or namespace is your decision; the player emits everything.
- `args` may contain `Error` objects, DOM nodes, `sos` objects and large playlist structures. Call
  `formatMessage(entry.message, entry.args)` for a readable line; it handles `%s %d %O`, renders
  errors with their stack, survives circular structures and truncates at 2 KB.
- If you buffer, flush on `pagehide`/`beforeunload`. Applet restarts are frequent and the last buffer
  usually holds the reason.
- The entry carries no device identity. Read it from `sos` in your factory if you need it.
- Do not import from `src/components/` or `src/models/` (the `ISos` type is the one exception). Browser APIs,
  bundled packages and the `sos` object are all allowed. `npm run lint` enforces the import rule.

## Swapping the logger

Two ways, in order of preference:

1. **Register it and select it by config.** Add a factory to `loggerFactories` in `src/loggers/index.ts`, then set the
   `logger` applet config key to its name. Devices switch without a rebuild; the name is re-read on every log line, so
   a config change takes effect immediately. Unknown names fall back to `console`.

   ```ts
   // src/loggers/index.ts
   export const loggerFactories: Record<string, LoggerFactory> = {
   	console: (sos) => new ConsoleLogger(() => sos.config.debugEnabled === true || sos.config.debugEnabled === 'true'),
   	html: () => new HtmlLogger(document.body),
   };
   ```

   Per-logger settings come from `sos.config` too (for example a `loggerUrl` key for a remote logger); the factory
   receives `sos` for exactly this purpose.

2. **Hard-wire it** when you build a dedicated bundle and want no config dependency:

   ```ts
   // src/index.ts
   new SmilPlayer(sos, new HtmlLogger(document.body), smilUrl, configOverrides).start();
   ```

## Example: on-screen overlay

```ts
export class HtmlLogger implements Logger {
	private readonly container: HTMLElement;
	constructor(parent: HTMLElement, private readonly maxLines = 200, private readonly only?: RegExp) {
		this.container = document.createElement('pre');
		this.container.style.cssText =
			'position:fixed;left:0;bottom:0;width:100%;height:30%;margin:0;overflow:auto;' +
			'background:rgba(0,0,0,.8);color:#ccc;font:11px monospace;z-index:99999';
		parent.appendChild(this.container);
	}
	write(entry: LogEntry): void {
		if (this.only && !this.only.test(entry.namespace)) { return; }
		const line = document.createElement('div');
		line.textContent =
			`${new Date(entry.timestamp).toISOString()} ${entry.level} ${entry.namespace} ` +
			formatMessage(entry.message, entry.args);
		this.container.appendChild(line);
		while (this.container.childNodes.length > this.maxLines) { this.container.removeChild(this.container.firstChild!); }
		this.container.scrollTop = this.container.scrollHeight;
	}
}
```

## Example: remote server with batching

Mind the deployment target: Chrome 38 (webOS 3.x) has no `fetch` and no `navigator.sendBeacon`, which is why
this example uses `XMLHttpRequest`. `npm run clean-build` loads the bundle with `fetch` deleted to catch that class of mistake.

```ts
export class RemoteLogger implements Logger {
	private buffer: object[] = [];
	constructor(private readonly endpoint: string, private readonly deviceId: string, flushMs = 5000) {
		setInterval(() => this.flush(), flushMs);
		window.addEventListener('pagehide', () => this.flush());
	}
	write(entry: LogEntry): void {
		if (entry.level === 'debug') { return; }
		this.buffer.push({ ...entry, args: undefined, text: formatMessage(entry.message, entry.args), deviceId: this.deviceId });
	}
	private flush(): void {
		if (!this.buffer.length) { return; }
		const body = JSON.stringify(this.buffer.splice(0));
		try {
			const xhr = new XMLHttpRequest();
			xhr.open('POST', this.endpoint, true);
			xhr.setRequestHeader('content-type', 'application/json');
			xhr.send(body);
		} catch (_e) {
			// network failures are dropped; a logger must never throw into the player
		}
	}
}
```

Registering it with device context and the endpoint taken from `sos.config`:

```ts
// src/loggers/index.ts
remote: (sos) => new RemoteLogger(String(sos.config.loggerUrl), String(sos.config.deviceId ?? 'unknown')),
```

## Example: several loggers at once

```ts
export class MultiLogger implements Logger {
	constructor(private readonly targets: Logger[]) {}
	write(entry: LogEntry): void { for (const t of this.targets) { t.write(entry); } }
}
```
