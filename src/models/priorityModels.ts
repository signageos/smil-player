export type PriorityObject = {
	priorityLevel: number;
	maxPriorityLevel: number;
	lower: string;
	peer: string;
	higher: string;
	pauseDisplay?: string;
};

export type PriorityCoordination = {
	version: number;
	priority: number;
};
