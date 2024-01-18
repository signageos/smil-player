import moment from 'moment';
import he from 'he';
import split, { Options } from 'split-string';
import ical from 'ical';
import { SMILMediaSingle } from '../../../models/mediaModels';
import { PlaylistElement } from '../../../models/playlistModels';
import { SMILScheduleEnum } from '../../../enums/scheduleEnums';
import {
	ExprTag,
	ComparatorChar,
	ConditionalExprFunction,
	ConditionalExprFormat,
	ObsoleteConditionalExprPrefix,
	BinaryOperatorChar,
} from '../../../enums/conditionalEnums';
import { setDefaultAwait } from './scheduleTools';
import { debug, generateCurrentDate } from './generalTools';
import { parseRFC5545Duration } from './rfc5545';
import { ComparableExpr, ConstExpr, FuncExpr, ParsedExpr } from '../../../models/conditionalModels';

export function isConditionalExpExpired(
	element: SMILMediaSingle | PlaylistElement | PlaylistElement[],
	playerName: string = '',
	playerId: string = '',
): boolean {
	if (Array.isArray(element)) {
		return setDefaultAwait(element, playerName, playerId) !== SMILScheduleEnum.playImmediately;
	}
	return element.hasOwnProperty(ExprTag) && !checkConditionalExprSafe(element.expr!, playerName, playerId);
}

/**
 * parses nested conditional expression - removes characters [ ] covering
 * @param expression
 */
function trimAndRemoveEdgeBrackets(expression: string): string {
	expression = expression.trim();
	// remove brackets for strings like [ condition ]
	if (expression[0] === '[' && expression[expression.length - 1] === ']') {
		expression = expression.substring(1).slice(0, -1);
	}
	return expression;
}

const algebraicSplitOpts: Options = {
	brackets: {
		'[': ']',
		'(': ')',
	},
	quotes: ["'"],
};

/**
 * Checks if conditional expression evaluates true or false
 * @param expression - conditional expression such as adapi-compare('2030-01-01T00:00:00', adapi-date())&lt;0
 * @param playerName - name of player specified in sos timings config ( sos.config.playerName )
 * @param playerId - id of player specified in sos timings config ( sos.config.playerId )
 */
export function checkConditionalExprSafe(expression: string, playerName: string = '', playerId: string = '') {
	try {
		expression = sanitizeConditionalExpr(expression);
		return checkConditionalExpr(expression, playerName, playerId);
	} catch (error) {
		debug('Error happened during parsing expr attribute: %o', error);
		return false;
	}
}

function sanitizeConditionalExpr(expression: string) {
	expression = he.decode(expression.trim());
	const initialSplit = split(expression, {
		...algebraicSplitOpts,
		separator: Object.values(BinaryOperatorChar),
	});
	if (initialSplit.length === 1 && expression[0] === '[' && expression[expression.length - 1] === ']') {
		expression = trimAndRemoveEdgeBrackets(expression);
	}
	return expression;
}

export function checkConditionalExpr(expression: string, playerName: string, playerId: string): boolean {
	const splitByAnd = split(expression, {
		...algebraicSplitOpts,
		separator: [BinaryOperatorChar.AND, BinaryOperatorChar.and],
	});
	if (splitByAnd.length > 1) {
		for (const element of splitByAnd) {
			if (!checkConditionalExprSafe(trimAndRemoveEdgeBrackets(element), playerName, playerId)) {
				return false;
			}
		}
		return true;
	}

	const splitByOr = split(expression, {
		...algebraicSplitOpts,
		separator: [BinaryOperatorChar.OR, BinaryOperatorChar.or],
	});
	if (splitByOr.length > 1) {
		for (const element of splitByOr) {
			if (checkConditionalExprSafe(trimAndRemoveEdgeBrackets(element), playerName, playerId)) {
				return true;
			}
		}
		return false;
	}

	return executeConditionalExpr(expression, playerName, playerId);
}

/**
 * Evaluates expression comparing icsString expr="adapi-compare(adapi-ics(),'icsString')"
 * @param icsData - expression string without first argument such as 'icsString'
 */
function compareIcsExpr(icsData: string): boolean {
	const calendar = ical.parseICS(icsData);
	const events = Object.values(calendar).filter((i) => i.type === 'VEVENT');
	return events.some((event) => {
		const currentDate = generateCurrentDate(false);
		const closedPastStart = event.rrule?.before(currentDate.toDate(), true);
		const durationMs =
			// if duration is in event, parse and use it
			typeof event.duration === 'string'
				? parseRFC5545Duration(event.duration)
				: // if no duration in event, get it from difference of start & end date
				event.start && event.end
				? event.end.valueOf() - event.start.valueOf()
				: 0;
		const closedPastEnd = moment(closedPastStart).add(durationMs);
		return currentDate.isBetween(closedPastStart, closedPastEnd, 'milliseconds', '[]');
	});
}

/**
 * Evaluates expression comparing days in week expr="adapi-weekday()=1" or expr="adapi-gmweekday()=1"
 * @param compareValue week days 0 (Sunday) to 6 (Saturday)
 * @param comparator
 * @param isUtc -  if date is in UTC or not
 */
function compareWeekDayExpr(compareValue: string, comparator: ComparatorChar, isUtc: boolean): boolean {
	return compareValues(generateCurrentDate(isUtc).day(), parseInt(compareValue), { comparator, compareValue: '0' });
}

/**
 * Evaluates expression comparing two dates expr="adapi-compare(adapi-date(),'2010-01-01T00:00:00')&lt;0"
 * @param inputValue - date specified 2010-01-01T00:00:00
 * @param comparable
 * @param isUtc - if date is in UTC or not
 */
function compareSimpleDateAndTimeExpr(inputValue: string, comparable: ComparableExpr, isUtc: boolean): boolean {
	const formattedDate = generateCurrentDate(isUtc).format(ConditionalExprFormat.dateAndTimeFormat);
	const formattedInputValue = isIsoDate(inputValue)
		? moment(inputValue).format(ConditionalExprFormat.dateAndTimeFormat)
		: inputValue;

	return compareValues(formattedDate, formattedInputValue, comparable);
}

/**
 * Evaluates expression comparing two times expr="adapi-compare(time(),'19:00:00')&lt;0"
 * @param inputValue - date specified 19:00:00
 * @param comparable
 * @param isUtc - if time is in UTC or not
 */
function compareSimpleTimeExpr(inputValue: string, comparable: ComparableExpr, isUtc: boolean): boolean {
	const formattedTime = generateCurrentDate(isUtc).format(ConditionalExprFormat.timeFormat);
	const formattedInputValue = isValidTime(inputValue)
		? moment(inputValue, ConditionalExprFormat.timeFormat).format(ConditionalExprFormat.timeFormat)
		: inputValue;

	return compareValues(formattedTime, formattedInputValue, comparable);
}

/**
 * Parses nested substring expression substring-after('2021-04-24T05:00:00', 'T') -> '05:00:00'
 * @param inputValue example: output of adapi-date() ~ 2021-04-24T05:00:00
 * @param delimiter example: T
 */
function parseSubstringAfterExpr(inputValue: string, delimiter: string): string {
	return inputValue.substr(inputValue.indexOf(delimiter) + 1);
}

const FUNCTION_REGEX = new RegExp(`^(${ObsoleteConditionalExprPrefix})?([\\w]+[\\w\\-]*[\\w]+)\\(`);

function parseConditionalExpr(element: string): ParsedExpr {
	const elementSanitized = element.trim();
	const splitOpts: Options = {
		quotes: ["'"],
		brackets: { '(': ')' },
	};
	let compareValue: string | undefined;
	let functionElement = elementSanitized;
	// first decide whether comparing is used, or method returns bool by itself
	let comparator = detectUnsafeComparator(elementSanitized, splitOpts);
	if (comparator) {
		const elementParts = split(elementSanitized, { ...splitOpts, separator: comparator });
		if (elementParts.length > 2) {
			throw new Error(`Invalid expr attribute contains too many comparators: ${elementSanitized}`);
		}
		const firstArg = elementParts[0].trim();
		const secondArg = elementParts[1].trim();
		if (firstArg.match(FUNCTION_REGEX)) {
			functionElement = firstArg;
			compareValue = secondArg;
		} else if (secondArg.match(FUNCTION_REGEX)) {
			functionElement = secondArg;
			compareValue = firstArg;
			// comparator has to be swapped because arguments are swapped to be standardized for later use
			comparator = swapComparator(comparator);
		} else {
			throw new Error(`At least one side of expr has to be valid function: ${comparator}`);
		}
	}
	const fnMatches = functionElement.match(FUNCTION_REGEX);
	if (!fnMatches) {
		return {
			constValue: parseString(functionElement),
			comparator,
			compareValue,
		};
	}
	if (!Object.values<string>(ConditionalExprFunction).includes(fnMatches[2])) {
		throw new Error(`Unknown expr function: ${functionElement}`);
	}
	const func = fnMatches[2] as ConditionalExprFunction;
	const argsStr = functionElement.substring(fnMatches[0].length, functionElement.length - 1);
	const args = split(argsStr, {
		separator: ',',
		quotes: ["'"],
		brackets: { '(': ')' },
	});

	return {
		func,
		args,
		comparator,
		compareValue,
	};
}

function detectUnsafeComparator(elementSanitized: string, splitOpts: Options) {
	// It depends on order of items (more characters has to be first)
	const allComparators = [...Object.values(ComparatorChar)].sort((a, b) => b.length - a.length);
	const detected = allComparators.find(
		(comparator) =>
			split(elementSanitized, {
				...splitOpts,
				separator: comparator,
			}).length > 1,
	);
	return detected;
}

function swapComparator(comparator: ComparatorChar): ComparatorChar {
	if (comparator === ComparatorChar.GT) {
		return ComparatorChar.LT;
	}
	if (comparator === ComparatorChar.GTE) {
		return ComparatorChar.LTE;
	}
	if (comparator === ComparatorChar.LT) {
		return ComparatorChar.GT;
	}
	if (comparator === ComparatorChar.LTE) {
		return ComparatorChar.GTE;
	}
	return comparator;
}

function parseString(str: string) {
	str = str.trim();
	if (str.length > 1 && str[0] === "'" && str[str.length - 1] === "'") {
		return str.substring(1, str.length - 1);
	}
	return str;
}

/**
 * Evaluates unparsed expression expr="adapi-compare(adapi-date(),'2010-01-01T00:00:00')&lt;0"
 * @param element - conditional expression expr="adapi-compare(adapi-date(),'2010-01-01T00:00:00')&lt;0"
 * @param playerName - name of player specified in sos timings config ( sos.config.playerName )
 * @param playerId - id of player specified in sos timings config ( sos.config.playerId )
 */
function executeConditionalExpr(element: string, playerName: string = '', playerId: string = ''): boolean {
	const parsed = parseConditionalExpr(element);
	const comparable: ComparableExpr = { comparator: parsed.comparator, compareValue: parsed.compareValue };

	// this is very rare case, where top level expr is constant (always returns same)
	if ('constValue' in parsed) {
		// E.g.: expr="1 > 0" (true)
		return compareValues(parsed.constValue, '0', comparable);
	}

	// helper simplified syntax for weekdays
	if (parsed.func === ConditionalExprFunction.weekDay || parsed.func === ConditionalExprFunction.weekDayUTC) {
		if (!parsed.compareValue || !parsed.comparator) {
			throw new Error(`You have to compare weekday() function`);
		}
		const isUtc = parsed.func === ConditionalExprFunction.weekDayUTC;
		return compareWeekDayExpr(parsed.compareValue, parsed.comparator, isUtc);
	}

	if (parsed.func === ConditionalExprFunction.compareConst) {
		const firstParsed = parseConditionalExpr(parsed.args[0]);
		const secondParsed = parseConditionalExpr(parsed.args[1]);
		// this is very rare case, where two const values are compared
		if ('constValue' in firstParsed && 'constValue' in secondParsed) {
			// E.g.: expr="compare(1, 0) > 0"
			return compareValues(firstParsed.constValue, secondParsed.constValue, comparable);
		}

		let funcArg: FuncExpr;
		let constArg: ConstExpr;
		if ('func' in firstParsed && 'constValue' in secondParsed) {
			funcArg = firstParsed;
			constArg = secondParsed;
		} else if ('func' in secondParsed && 'constValue' in firstParsed) {
			funcArg = secondParsed;
			constArg = firstParsed;
			comparable.comparator = comparable.comparator && swapComparator(comparable.comparator);
		} else {
			throw new Error(
				`Comparing two functions are currently not supported. One side has to be const: ${element}`,
			);
		}

		if (funcArg.func === ConditionalExprFunction.ics) {
			return compareIcsExpr(constArg.constValue);
		}

		// Evaluates expression comparing playerId expr="adapi-compare(smil-playerId(),'playerId')"
		if (funcArg.func === ConditionalExprFunction.playerId) {
			return constArg.constValue === playerId;
		}

		// Evaluates expression comparing playerName expr="adapi-compare(smil-playerName(),'Entrance')"
		if (funcArg.func === ConditionalExprFunction.playerName) {
			return constArg.constValue === playerName;
		}

		if (funcArg.func === ConditionalExprFunction.currentDate) {
			return compareSimpleDateAndTimeExpr(constArg.constValue, comparable, false);
		}

		if (funcArg.func === ConditionalExprFunction.currentDateUTC) {
			return compareSimpleDateAndTimeExpr(constArg.constValue, comparable, true);
		}

		if (funcArg.func === ConditionalExprFunction.currentTime) {
			return compareSimpleTimeExpr(constArg.constValue, comparable, false);
		}

		if (funcArg.func === ConditionalExprFunction.currentTimeUTC) {
			return compareSimpleTimeExpr(constArg.constValue, comparable, true);
		}

		// Backward compatibility function in compare only for adapi-compare('12:00', substring-after(adapi-date(), 'T'))
		if (funcArg.func === ConditionalExprFunction.substringAfter) {
			if (!comparable.comparator || !comparable.compareValue) {
				throw new Error(`Substring comparator is required: ${element}`);
			}
			const parsedFirstFuncArg = parseConditionalExpr(funcArg.args[0]);
			const delimiter = parseString(funcArg.args[1]);
			if ('func' in parsedFirstFuncArg) {
				if (parsedFirstFuncArg.func === ConditionalExprFunction.currentDate) {
					const inputValue = generateCurrentDate(false).format(ConditionalExprFormat.dateAndTimeFormat);
					return compareValues(
						parseSubstringAfterExpr(inputValue, delimiter),
						constArg.constValue,
						comparable,
					);
				}
			} else {
				throw new Error(`Currently unsupported syntax of substring-after: ${element}`);
			}
		}
	}

	throw new Error(`Conditional expression format is not supported: ${element}`);
}

/**
 * check if values and specified comparator match
 * @param firstArgument - string or number to compare
 * @param secondArgument - string or number to compare
 * @param comparable
 */
function compareValues(firstArgument: string | number, secondArgument: string | number, comparable: ComparableExpr) {
	// TODO introduce comparison other than "0". It's already available in comparable.compareValue
	if (
		firstArgument < secondArgument &&
		(comparable.comparator === ComparatorChar.LT || comparable.comparator === ComparatorChar.LTE)
	) {
		return true;
	}

	if (
		firstArgument > secondArgument &&
		(comparable.comparator === ComparatorChar.GT || comparable.comparator === ComparatorChar.GTE)
	) {
		return true;
	}

	return (
		firstArgument === secondArgument &&
		(comparable.comparator === ComparatorChar.EQ ||
			comparable.comparator === ComparatorChar.GTE ||
			comparable.comparator === ComparatorChar.LTE)
	);
}

function isIsoDate(dateString: string) {
	if (!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dateString)) {
		return false;
	}
	let d = moment(dateString).utc(true);
	const stringDate =
		d.toISOString().indexOf('Z') > -1 ? d.toISOString().substring(0, d.toISOString().length - 5) : d.toISOString();
	return stringDate === dateString;
}

function isValidTime(timeString: string) {
	return /(?:[01]\d|2[0123]):(?:[012345]\d)(:[012345]\d)/.test(timeString);
}
