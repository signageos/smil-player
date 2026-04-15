/**
 * Tracks DOM event listeners so they can all be removed at once.
 *
 * Use as a single-call alternative to `AbortController` for environments whose
 * `addEventListener` does not yet accept the `{ signal }` option (older
 * signage TV runtimes pre-date the 2020 W3C addition). Identical semantics:
 * every `add()` is one matching `removeEventListener` call inside `removeAll()`,
 * dispatched against the same listener reference and capture flag the entry
 * was registered with — those two are what `removeEventListener` keys on per
 * the DOM spec.
 *
 * Typical lifecycle: a long-lived owner holds one scope, registers all its
 * listeners through `add()`, and calls `removeAll()` whenever its setup phase
 * is about to re-run (so the next setup starts from a clean slate).
 */
import Debug from 'debug';

const debug = Debug('@signageos/smil-player:listenerScope');

export interface ListenerEntry {
	target: EventTarget;
	type: string;
	listener: EventListenerOrEventListenerObject;
	options?: AddEventListenerOptions | boolean;
}

export class ListenerScope {
	private entries: ListenerEntry[] = [];

	add<E extends Event = Event>(
		target: EventTarget,
		type: string,
		listener: (event: E) => unknown,
		options?: AddEventListenerOptions | boolean,
	): void {
		// One internal cast absorbs the contravariance between the
		// narrower call-site event types (CustomEvent, KeyboardEvent, ...)
		// and the base `EventListener` signature the DOM API expects.
		// Call sites stay cast-free.
		const erased = listener as EventListener;
		target.addEventListener(type, erased, options);
		this.entries.push({ target, type, listener: erased, options });
	}

	removeAll(): void {
		for (const e of this.entries) {
			try {
				e.target.removeEventListener(e.type, e.listener, e.options);
			} catch (err) {
				// Best-effort: target may have been detached / GC'd, or be a
				// cross-origin iframe whose contentWindow is no longer
				// reachable. removeEventListener on a no-op pair never throws
				// per spec; this catch covers only those pathological cases.
				debug('[listenerScope] removeEventListener threw on cleanup: type=%s, error=%O', e.type, err);
			}
		}
		this.entries.length = 0;
	}

	get size(): number {
		return this.entries.length;
	}
}
