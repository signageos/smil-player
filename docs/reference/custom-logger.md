---
sidebar_position: 6
---
# Custom logger

The SMIL Player writes all diagnostic output through one injected logger. The contract lives in
`src/logger/`; implementations live in `src/loggers/`, where the default `ConsoleLogger` prints to the
browser console when `debugEnabled` is on. A `remote` logger that POSTs batches to a URL ships as well; see below.
To send logs elsewhere, implement one method and register it.

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

## Shipped: `remote`

`RemoteLogger` (`src/loggers/remoteLogger.ts`) is selected with the applet config `logger=remote` and needs
`loggerUrl`. It is for devices where nobody can open a developer console.

- Sends every level. Nothing is sent while `debugEnabled` is off, so the stream is switched on and off from
  config without a redeploy. The console prints nothing while `remote` is selected; set `logger=console` to get it back.
- Lines are rendered with `formatMessage` at write time, buffered (cap 1000, oldest dropped) and POSTed every
  5 seconds and on `pagehide`. A failed POST is dropped, there is no retry.
- The body is JSON sent with `Content-Type: text/plain`, which makes it a CORS "simple request": the server does not
  need to answer a preflight or send CORS headers for the bytes to arrive. The player never reads the response.
- `deviceId` is `sos.management.getSerialNumber()`, resolved after boot; the first batch may say `unknown`.

Payload:

```json
{
	"deviceId": "ABC123SERIAL",
	"entries": [
		{
			"timestamp": 1760300000000,
			"level": "debug",
			"namespace": "@signageos/smil-player:filesManager",
			"text": "[files] sending report: endpoint=https://..."
		}
	]
}
```

A receiver can be as small as an HTTP server that appends each request body to a file. Chrome 38 (webOS 3.x)
has no `fetch` and no `navigator.sendBeacon`, which is why the logger uses `XMLHttpRequest`; `npm run clean-build`
loads the bundle with `fetch` deleted to catch that class of mistake in new loggers.

## Example: several loggers at once

```ts
export class MultiLogger implements Logger {
	constructor(private readonly targets: Logger[]) {}
	write(entry: LogEntry): void { for (const t of this.targets) { t.write(entry); } }
}
```
