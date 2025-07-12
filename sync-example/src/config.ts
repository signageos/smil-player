import sos from "@signageos/front-applet";
import { SyncEngine } from "@signageos/front-applet/es6/FrontApplet/Sync/Sync";

export type Config = {
	syncEngine: SyncEngine | undefined;
	syncServerUri: string | undefined;
	syncId: string | undefined;

	webpageUrl: string;

	periodicVideo: {
		groupName: string;
		videoUrls: string[];
		periodMs: number;
	};

	triggeredVideo?: {
		groupName: string;
		videoUrls: string[];
	};

	debugMode: boolean;
};

export function getConfig(): Config {
	const periodicVideoUrls = sos.config.periodic_video_urls;
	const webpageUrl = sos.config.webpage_url;

	if (!periodicVideoUrls) {
		throw new Error('periodic_video_urls parameter is required');
	}

	if (!webpageUrl) {
		throw new Error('webpage_url parameter is required');
	}

	const periodicVideoSyncGroup = sos.config.periodic_video_sync_group || 'periodic-video';
	const triggeredVideoSyncGroup = sos.config.triggered_video_sync_group || 'triggered-video';

	if (periodicVideoSyncGroup === triggeredVideoSyncGroup) {
		throw new Error(`periodic_video_sync_group and triggered_video_sync_group must be different - same name "${periodicVideoSyncGroup}"`);
	}

	const triggeredVideoUrls = sos.config.triggered_video_urls?.split(',') || undefined;

	return {
		syncEngine: sos.config.sync_engine,
		syncServerUri: sos.config.sync_server_uri,
		syncId: sos.config.sync_id,
		webpageUrl: webpageUrl,

		periodicVideo: {
			groupName: periodicVideoSyncGroup,
			videoUrls: periodicVideoUrls.split(','),
			periodMs: sos.config.periodic_video_period_ms || 5e3,
		},

		triggeredVideo: triggeredVideoUrls ? {
			groupName: triggeredVideoSyncGroup,
			videoUrls: triggeredVideoUrls,
		} : undefined,

		debugMode: sos.config.debug_mode === 'true' || false,
	};
}
