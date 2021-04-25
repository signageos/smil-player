export const ExprTag = 'expr';
export const ObsoleteConditionalExprPrefix = 'adapi-';

export enum ConditionalExprFunction {
	compareConst = 'compare',
	currentDate = 'date',
	currentDateUTC = 'gmdate',
	currentTime = 'time',
	currentTimeUTC = 'gmtime',
	substringAfter = 'substring-after',
	weekDay = 'weekday',
	weekDayUTC = 'gmweekday',
	playerId = 'smil-playerId',
	playerName = 'smil-playerName',
}

export enum ConditionalExprFormat {
	dateFormat = 'YYYY-MM-DD',
	timeFormat = 'HH:mm:ss',
	dateAndTimeFormat = 'YYYY-MM-DDTHH:mm:ss',
}

export enum BinaryOperatorChar {
	AND = 'AND',
	and = 'and',
	OR = 'OR',
	or = 'or',
}

export enum ComparatorChar {
	GTE = '>=',
	LTE = '<=',
	GT = '>',
	LT = '<',
	EQ = '=',
}
