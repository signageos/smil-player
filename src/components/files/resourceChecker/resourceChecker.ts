import { IResourceChecker } from './IResourceChecker';
import Debug from 'debug';

const debug = Debug('@signageos/smil-player:resourceChecker');

export type Resource = {
	url: string;
	interval: number;
	checkFunction: () => Promise<Promise<void>[]>;
	actionOnSuccess: (data: Promise<void>[], stopChecker: () => Promise<void>) => Promise<void>;
};

export class ResourceChecker implements IResourceChecker {
	private groupedResources: Map<number, Resource[]> = new Map();
	private intervalTimers: Map<number, NodeJS.Timeout> = new Map();
	private isRunning: boolean = false;
	private stopPromise: Promise<void> | null = null;

	constructor(
		private resources: Resource[],
		private shouldSync: boolean,
		private playlistNonSyncStopFunction: () => void,
		private restartPlaylist: () => void,
	) {
		this.groupResourcesByInterval();
	}

	public start() {
		if (this.isRunning) {
			debug('ResourceChecker is already running');
			return;
		}

		this.isRunning = true;
		this.clearAllTimers();

		debug('ResourceChecker grouped resources: %O', this.groupedResources);

		for (const [interval, resourceGroup] of this.groupedResources.entries()) {
			const scheduleNext = (): NodeJS.Timeout => {
				const timeout = setTimeout(async () => {
					if (!this.isRunning) {
						return;
					}

					try {
						for (const resource of resourceGroup) {
							if (!this.isRunning) {
								break;
							}
							debug('Checking resource: %O at interval: %d', resource, interval);

							try {
								const response = await resource.checkFunction();
								await resource.actionOnSuccess(response, async () => this.stop());
							} catch (error) {
								debug('Error checking %s: %O', resource.url, error);
							}
						}
					} finally {
						if (this.isRunning) {
							scheduleNext();
						}
					}
				// tslint:disable-next-line:align
				},					   interval);

				this.intervalTimers.set(interval, timeout);
				// Safely unref only if available
				if (typeof timeout.unref === 'function') {
					timeout.unref();
				}
				return timeout;
			};

			scheduleNext();
		}

		debug('Grouped resource checks started.');
	}

	public async stop() {
		if (!this.isRunning) {
			debug('ResourceChecker is not running');
			return;
		}

		// Prevent multiple simultaneous stop operations
		if (this.stopPromise) {
			return this.stopPromise;
		}

		this.stopPromise = (async () => {
			try {
				this.isRunning = false;

				debug('All grouped resource checks stopped.');

				if (this.shouldSync) {
					debug('Updating content with sync on');
					// await this.playlistSyncStopFunction();
					this.playlistNonSyncStopFunction();
					this.restartPlaylist();
				} else {
					debug('Updating content with sync off');
					this.playlistNonSyncStopFunction();
					this.restartPlaylist();
				}

				// Cleanup all resources
				this.groupedResources.clear();
				this.clearAllTimers();
				debug('ResourceChecker resources cleaned up.');
			} catch (error) {
				debug('Error during ResourceChecker stop: %O', error);
				throw error;
			} finally {
				this.stopPromise = null;
			}
		})();

		return this.stopPromise;
	}

	private clearAllTimers() {
		for (const [, timeout] of this.intervalTimers) {
			if (timeout) {
				clearTimeout(timeout);
				// Safely unref only if available
				if (typeof timeout.unref === 'function') {
					timeout.unref();
				}
			}
		}
		this.intervalTimers.clear();
	}

	private groupResourcesByInterval() {
		for (const resource of this.resources) {
			if (!this.groupedResources.has(resource.interval)) {
				this.groupedResources.set(resource.interval, []);
			}
			this.groupedResources.get(resource.interval)!.push(resource);
		}
	}
}
