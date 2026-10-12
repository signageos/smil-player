import { Log } from '../../../logger';
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
	contentLength?: number;
};

export type Resource = {
	url: string;
	interval: number;
	checkFunction: () => Promise<Promise<void>[]>;
	// Optional - for media files to support batch download optimization
	detectFunction?: () => Promise<UpdateDetection | null>;
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
		protected readonly log: Log,
	) {
		this.groupResourcesByInterval();
	}

	public start() {
		if (this.isRunning) {
			debug('[files] resource checker already running, skipping start');
			return;
		}

		this.isRunning = true;
		this.clearAllTimers();

		debug('[files] resource checker grouped resources: groups=%d', this.groupedResources.size);

		for (const [interval, resourceGroup] of this.groupedResources.entries()) {
			const scheduleNext = (): NodeJS.Timeout => {
				const timeout = setTimeout(async () => {
					if (!this.isRunning) {
						return;
					}

					try {
						// Start batch collection before checking resources
						debug('[files] starting batch collection for resource group: interval=%d', interval);
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
									debug('[files] phase 1: detecting updates: url=%s', resource.url);
									const detection = await resource.detectFunction();
									if (detection) {
										// Add to detected values to prevent duplicates
										detectedValues.add(`${detection.updateValue}|${detection.localFilePath}`);
										detections.push(detection);
									}
								} catch (error) {
									debug('[files] error detecting update: url=%s, error=%O', resource.url, error);
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
							'[files] phase 2: new content detections=%d, moved content detections=%d',
							newContentDetections.length,
							movedContentDetections.length,
						);

						// Get full files list for preservation check
						const allFilesList = resourceGroup
							.filter((r) => r.mediaObject)
							.map((r) => r.mediaObject!);

						// Phase 3: Batch process new content downloads
						if (newContentDetections.length > 0) {
							try {
								debug('[files] phase 3: batch downloading new content files=%d', newContentDetections.length);
								await this.filesManager.processNewContentUpdates(newContentDetections, allFilesList);
							} catch (error) {
								debug('[files] error processing new content updates: error=%O', error);
							}
						}

						// Phase 4: Batch process moved content (copy only, no download)
						if (movedContentDetections.length > 0) {
							try {
								debug('[files] phase 4: batch processing moved content files=%d', movedContentDetections.length);
								await this.filesManager.processNewContentUpdates(movedContentDetections, allFilesList);
							} catch (error) {
								debug('[files] error processing moved content updates: error=%O', error);
							}
						}

						// Phase 5: Process resources without detectFunction (SMIL files, etc.)
						for (const resource of resourcesWithoutDetectFunction) {
							if (!this.isRunning) {
								break;
							}
							debug('[files] checking resource (legacy): url=%s, interval=%d', resource.url, interval);

							try {
								const response = await resource.checkFunction();
								await resource.actionOnSuccess(response, async () => this.stop());
							} catch (error) {
								debug('[files] resource check error: url=%s, error=%O', resource.url, error);
							}
						}

						// Phase 6: Commit batch after all resources in this interval group have been checked
						debug('[files] committing batch updates for resource group: interval=%d', interval);
						// Extract media objects from resources in this interval group for commitBatch
						const filesList = resourceGroup
							.filter((r) => r.mediaObject)
							.map((r) => r.mediaObject!);
						await this.filesManager.commitBatch(filesList);
						debug('[files] batch committed successfully: interval=%d', interval);
					} finally {
						if (this.isRunning) {
							scheduleNext();
						}
					}
				},                         interval);

				this.intervalTimers.set(interval, timeout);
				// Safely unref only if available
				if (typeof timeout.unref === 'function') {
					timeout.unref();
				}
				return timeout;
			};

			scheduleNext();
		}

		debug('[files] resource checker started');
	}

	public async stop() {
		if (!this.isRunning) {
			debug('[files] resource checker not running, skipping stop');
			return;
		}

		// Prevent multiple simultaneous stop operations
		if (this.stopPromise) {
			return this.stopPromise;
		}

		this.stopPromise = (async () => {
			try {
				this.isRunning = false;

				debug('[files] resource checker stopped');

				if (this.shouldSync) {
					debug('[files] updating content: sync=on');
					// await this.playlistSyncStopFunction();
					this.playlistNonSyncStopFunction();
					this.restartPlaylist();
				} else {
					debug('[files] updating content: sync=off');
					this.playlistNonSyncStopFunction();
					this.restartPlaylist();
				}

				// Cleanup all resources
				this.groupedResources.clear();
				this.clearAllTimers();
				debug('[files] resource checker cleaned up');
			} catch (error) {
				debug('[files] resource checker stop error: %O', error);
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
