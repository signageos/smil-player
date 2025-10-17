import { IResourceChecker } from './IResourceChecker';
import { IFilesManager } from '../IFilesManager';
import { MergedDownloadList, MediaInfoObject } from '../../../models/filesModels';
import { FetchStrategy } from '../fetchingStrategies/fetchingStrategies';
import Debug from 'debug';

const debug = Debug('@signageos/smil-player:resourceChecker');

export type UpdateDetection = {
	file: MergedDownloadList;
	localFilePath: string;
	updateValue: string | number;
	needsDownload: boolean;  // true = NEW_CONTENT (needs download), false = MOVED_CONTENT (just update mapping)
	mediaInfoObject: MediaInfoObject;
	fetchStrategy: FetchStrategy;
};

export type Resource = {
	url: string;
	interval: number;
	checkFunction: () => Promise<Promise<void>[]>;
	detectFunction?: (detectedValues: Set<string>) => Promise<UpdateDetection | null>;  // Optional - for media files to support batch download optimization
	actionOnSuccess: (data: Promise<void>[], stopChecker: () => Promise<void>) => Promise<void>;
	mediaObject?: MergedDownloadList;  // Optional - only media resources will have this
};

export class ResourceChecker implements IResourceChecker {
	private groupedResources: Map<number, Resource[]> = new Map();
	private intervalTimers: Map<number, NodeJS.Timeout> = new Map();
	private isRunning: boolean = false;
	private stopPromise: Promise<void> | null = null;

	constructor(
		private resources: Resource[],
		private filesManager: IFilesManager,
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
						// Start batch collection before checking resources
						debug('Starting batch collection for resource group at interval %d', interval);
						this.filesManager.startBatch();

						// Phase 1: Detection - collect all update detections
						const detections: UpdateDetection[] = [];
						const resourcesWithoutDetectFunction: Resource[] = [];
						const detectedValues = new Set<string>();  // Track already-detected values in this cycle

						for (const resource of resourceGroup) {
							if (!this.isRunning) {
								break;
							}

							if (resource.detectFunction) {
								try {
									debug('Phase 1: Detecting updates for %s', resource.url);
									const detection = await resource.detectFunction(detectedValues);
									if (detection) {
										// Add to detected values to prevent duplicates
										detectedValues.add(`${detection.updateValue}|${detection.localFilePath}`);
										detections.push(detection);
									}
								} catch (error) {
									debug('Error detecting update for %s: %O', resource.url, error);
								}
							} else {
								// Resources without detectFunction (like SMIL files) - process later
								resourcesWithoutDetectFunction.push(resource);
							}
						}

						// Phase 2: Classify detections
						const newContentDetections = detections.filter((d) => d.needsDownload);
						const movedContentDetections = detections.filter((d) => !d.needsDownload);

						debug(
							'Phase 2: %d new content detections, %d moved content detections',
							newContentDetections.length,
							movedContentDetections.length,
						);

						// Phase 3: Batch process new content downloads
						if (newContentDetections.length > 0) {
							try {
								debug('Phase 3: Batch downloading %d new content files', newContentDetections.length);
								await this.filesManager.processNewContentUpdates(newContentDetections);
							} catch (error) {
								debug('Error processing new content updates: %O', error);
							}
						}

						// Phase 4: Batch process moved content (copy only, no download)
						if (movedContentDetections.length > 0) {
							try {
								debug('Phase 4: Batch processing %d moved content files', movedContentDetections.length);
								await this.filesManager.processNewContentUpdates(movedContentDetections);
							} catch (error) {
								debug('Error processing moved content updates: %O', error);
							}
						}

						// Phase 5: Process resources without detectFunction (SMIL files, etc.)
						for (const resource of resourcesWithoutDetectFunction) {
							if (!this.isRunning) {
								break;
							}
							debug('Checking resource (legacy): %O at interval: %d', resource, interval);

							try {
								const response = await resource.checkFunction();
								await resource.actionOnSuccess(response, async () => this.stop());
							} catch (error) {
								debug('Error checking %s: %O', resource.url, error);
							}
						}

						// Phase 6: Commit batch after all resources in this interval group have been checked
						debug('Committing batch updates for resource group at interval %d', interval);
						// Extract media objects from resources in this interval group for commitBatch
						const filesList = resourceGroup
							.filter((r) => r.mediaObject)
							.map((r) => r.mediaObject!);
						await this.filesManager.commitBatch(filesList);
						debug('Batch committed successfully for interval %d', interval);
					} finally {
						if (this.isRunning) {
							scheduleNext();
						}
					}
				}, interval);

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

	private groupResourcesByInterval() {
		for (const resource of this.resources) {
			if (!this.groupedResources.has(resource.interval)) {
				this.groupedResources.set(resource.interval, []);
			}
			this.groupedResources.get(resource.interval)!.push(resource);
		}
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
}
