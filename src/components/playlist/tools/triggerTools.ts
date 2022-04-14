// find desired trigger to cancel with same subregion but different trigger value
export function findTriggerToCancel(triggerObject: any, regionName: string, triggerValue: string): string {
	for (let [key, record] of Object.entries(triggerObject)) {
		const triggerRecord: any = record;
		if (triggerRecord.regionInfo.regionName === regionName && key !== triggerValue) {
			return key;
		}
	}
	return '';
}
