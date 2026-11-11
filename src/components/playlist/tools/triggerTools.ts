// find desired trigger to cancel with same subregion but different trigger value
import { TriggerEndless, TriggerObject } from '../../../models/triggerModels';

type FindTriggerToCancelOptions = {
	triggerObject: TriggerEndless;
	regionName: string;
	triggerValue: string;
};

export function findTriggerToCancel({ triggerObject, regionName, triggerValue }: FindTriggerToCancelOptions): string {
	for (let [key, record] of Object.entries(triggerObject)) {
		const triggerRecord = record;
		if (triggerRecord.regionInfo?.regionName === regionName && key !== triggerValue && triggerRecord.play) {
			return key;
		}
	}
	return '';
}

// find a trigger whose seq.end matches the firing trigger ID, and is currently playing
type FindTriggerToCancelByEndIdOptions = {
	triggers: { [key: string]: TriggerObject };
	triggersEndless: TriggerEndless;
	firingTriggerId: string;
};

export function findTriggerToCancelByEndId({
	triggers,
	triggersEndless,
	firingTriggerId,
}: FindTriggerToCancelByEndIdOptions): string {
	for (const [key, value] of Object.entries(triggers)) {
		if (value.seq?.end === firingTriggerId && triggersEndless[key]?.play) {
			return key;
		}
	}
	return '';
}
