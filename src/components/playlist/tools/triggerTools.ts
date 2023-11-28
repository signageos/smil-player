// find desired trigger to cancel with same subregion but different trigger value
import { TriggerEndless } from '../../../models/triggerModels';

export function findTriggerToCancel(triggerObject: TriggerEndless, regionName: string, triggerValue: string): string {
	for (let [key, record] of Object.entries(triggerObject)) {
		const triggerRecord = record;
		if (triggerRecord.regionInfo.regionName === regionName && key !== triggerValue && triggerRecord.play) {
			return key;
		}
	}
	return '';
}
