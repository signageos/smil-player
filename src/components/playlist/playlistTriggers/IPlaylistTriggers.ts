import { TriggerEndless } from "../../../models/triggerModels";
import { SMILFileObject } from "../../../models/filesModels";
import { SMILMedia } from "../../../models/mediaModels";
import { RegionAttributes } from "../../../models/xmlJsonModels";

export interface IPlaylistTriggers {
	triggersEndless: TriggerEndless;
	watchTriggers: (smilObject: SMILFileObject) => Promise<void>;
	handleTriggers: (media: SMILMedia, element: HTMLElement | undefined) => Promise<RegionAttributes>;
}
