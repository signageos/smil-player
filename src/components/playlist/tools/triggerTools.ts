// find desired trigger to cancel with same subregion but different trigger value
import { TriggerEndless, TriggerObject } from '../../../models/triggerModels';

export function findTriggerToCancel(triggerObject: TriggerEndless, regionName: string, triggerValue: string): string {
	for (let [key, record] of Object.entries(triggerObject)) {
		const triggerRecord = record;
		if (triggerRecord.regionInfo?.regionName === regionName && key !== triggerValue && triggerRecord.play) {
			return key;
		}
	}
	return '';
}

// find a trigger whose seq.end matches the firing trigger ID, and is currently playing
export function findTriggerToCancelByEndId(
	triggers: { [key: string]: TriggerObject },
	triggersEndless: TriggerEndless,
	firingTriggerId: string,
): string {
	for (const [key, value] of Object.entries(triggers)) {
		if (value.seq?.end === firingTriggerId && triggersEndless[key]?.play) {
			return key;
		}
	}
	return '';
}
