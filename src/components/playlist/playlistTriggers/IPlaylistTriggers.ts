import { TriggerEndless } from '../../../models/triggerModels';
import { SMILMedia } from '../../../models/mediaModels';
import { RegionAttributes } from '../../../models/xmlJsonModels';

import type { WatchTriggersOptions } from './playlistTriggers';

export interface IPlaylistTriggers {
	triggersEndless: TriggerEndless;
	watchTriggers: (options: WatchTriggersOptions) => Promise<void>;
	handleTriggers: (media: SMILMedia, element: HTMLElement | undefined) => Promise<RegionAttributes>;
}
