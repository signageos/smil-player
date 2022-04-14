import { PriorityObject } from '../../../models/priorityModels';
import { PriorityDefault } from "../../../enums/priorityEnums";

export function createPriorityObject(priorityClass: PriorityObject, priorityLevel: number): PriorityObject {
	return {
		priorityLevel,
		lower: priorityClass.lower ?? PriorityDefault.lower,
		peer: priorityClass.peer ?? PriorityDefault.peer,
		higher: priorityClass.higher ?? PriorityDefault.higher,
		pauseDisplay: priorityClass.pauseDisplay ?? PriorityDefault.pauseDisplay,
	};
}
