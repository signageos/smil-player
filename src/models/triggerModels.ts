import { SMILAudio, SMILImage, SMILIntro, SMILVideo, SMILWidget } from './mediaModels';

export type TriggerObject = {
	begin: string,
	repeatCount: string,
	dur: string,
	[key: string]: SMILVideo[] | SMILImage[] | SMILWidget[] | SMILAudio[] | SMILIntro[] | string,
};

export type TriggerList = {
	sensors: ParsedSensor[],
	triggerSensorInfo: ParsedTriggerInfo,
	triggers: { [key: string]: TriggerObject },
};

export type SMILTriggers = {
	trigger: SMILTriggerInfo | SMILTriggerInfo[],
};

export type SMILTriggerInfo = {
	id: string,
	condition: SMILTriggerCondition | SMILTriggerCondition[],
};

export type SMILTriggerCondition = {
	origin: string,
	data?: string,
	action: string,
};

export type SMILSensors = {
	sensor: SMILSensor | SMILSensor[],
};

export type SMILSensor = {
	type: string,
	id: string,
	driver: string,
	option: SMILSensorOption | SMILSensorOption[],
};

export type SMILSensorOption = {
	_: string,
	name: string,
};

export type ParsedSensor = {
	type: string,
	id: string,
	driver: string,
	address?: string,
	[key: string]: string | undefined,
};

export type ParsedTriggerInfo = {
	[key: string]: {
		condition: ParsedTriggerCondition[],
		stringCondition: string,
		trigger: string,
	},
};

export type ParsedTriggerCondition = {
	action: string,
};
