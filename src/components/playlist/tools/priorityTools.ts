import get = require('lodash/get');

import { PriorityObject } from '../../../models/priorityModels';

export function createPriorityObject(priorityClass: object, priorityLevel: number): PriorityObject {
	return {
		priorityLevel,
		lower: get(priorityClass, 'lower', 'defer'),
		peer: get(priorityClass, 'peer', 'stop'),
		higher: get(priorityClass, 'higher', 'pause'),
		pauseDisplay: get(priorityClass, 'pauseDisplay', 'show'),
	};
}
