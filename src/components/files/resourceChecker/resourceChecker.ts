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
	private isRunning = false;
	private stopPromise: Promise<void> | null = null;

	constructor(
		private resources: Resource[],
		private shouldSync: boolean,
		private playlistNonSyncStopFunction: () => void,
		private restartPlaylist: () => void,
	) {
		this.groupResourcesByInterval();
	}

	private groupResourcesByInterval() {
		for (const resource of this.resources) {
			if (!this.groupedResources.has(resource.interval)) {
				this.groupedResources.set(resource.interval, []);
			}
			this.groupedResources.get(resource.interval)!.push(resource);
		}
	}

	start() {
		if (this.isRunning) {
			debug('ResourceChecker is already running');
			return;
		}

		this.isRunning = true;
		this.stopPromise = null;

		debug('ResourceChecker grouped resources: %O', this.groupedResources);

		for (const [interval, resourceGroup] of this.groupedResources.entries()) {
			const timer = setInterval(async () => {
				if (!this.isRunning) {
					clearInterval(timer);
					return;
				}

				for (const resource of resourceGroup) {
					if (!this.isRunning) break;
					debug('Checking resource: %s at interval: %d', resource.url, interval);

					try {
						const response = await resource.checkFunction();
						await resource.actionOnSuccess(response, async () => this.stop());
					} catch (error) {
						debug('Error checking %s: %O', resource.url, error);
					}
				}
			}, interval);

			this.intervalTimers.set(interval, timer);
		}

		debug('Grouped resource checks started.');
	}

	async stop() {
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

				// Clear all intervals
				for (const [interval, timer] of this.intervalTimers.entries()) {
					clearInterval(timer);
					this.intervalTimers.delete(interval);
				}

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
				this.intervalTimers.clear();
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
}
