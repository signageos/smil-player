import { PriorityObject } from '../../../models/priorityModels';
import { PriorityDefault, PriorityRule } from '../../../enums/priorityEnums';

export function createPriorityObject(
	priorityClass: PriorityObject,
	priorityLevel: number,
	maxPriorityLevel: number,
): PriorityObject {
	return {
		priorityLevel,
		maxPriorityLevel,
		lower: priorityClass.lower ?? PriorityRule.defer,
		peer: priorityClass.peer ?? PriorityRule.never,
		higher: priorityClass.higher ?? PriorityRule.stop,
		pauseDisplay: priorityClass.pauseDisplay ?? PriorityDefault.pauseDisplay,
	};
}
