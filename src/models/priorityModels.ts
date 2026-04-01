import { PriorityRule } from '../enums/priorityEnums';

export type PriorityObject = {
	priorityLevel: number;
	maxPriorityLevel: number;
	lower: PriorityRule;
	peer: PriorityRule;
	higher: PriorityRule;
	pauseDisplay?: string;
};

export type PriorityCoordination = {
	version: number;
	priority: number;
};
