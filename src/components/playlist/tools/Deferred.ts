/**
 * A Deferred object that provides external control over promise resolution.
 * Allows multiple waiters to await the same completion event.
 */
export class Deferred<T = void> {
	public readonly promise: Promise<T>;
	private _resolve!: (value: T | PromiseLike<T>) => void;
	private _resolved: boolean = false;

	constructor() {
		this.promise = new Promise<T>((resolve) => {
			this._resolve = resolve;
		});
	}

	/**
	 * Resolves the promise. Idempotent - calling multiple times has no effect after first call.
	 */
	public resolve(value?: T): void {
		if (!this._resolved) {
			this._resolved = true;
			this._resolve(value as T);
		}
	}

	/**
	 * Returns true if the promise has been resolved.
	 */
	public get isSettled(): boolean {
		return this._resolved;
	}
}
