import moment from 'moment';
import split from 'split-string';

import { SMILMediaSingle } from '../../../models/mediaModels';
import { PlaylistElement } from '../../../models/playlistModels';
import { SMILScheduleEnum } from '../../../enums/scheduleEnums';
import { ConditionalExprEnum } from '../../../enums/conditionalEnums';
import { ParsedConditionalExpr } from '../../../models/conditionalModels';
import { setDefaultAwait } from './scheduleTools';
import { debug, generateCurrentDate, getPosition } from './generalTools';

export function isConditionalExpExpired(
	element: SMILMediaSingle | PlaylistElement | PlaylistElement[], playerName: string = '', playerId: string = '',
): boolean {
	if (Array.isArray(element)) {
		return setDefaultAwait(element, playerName, playerId) !== SMILScheduleEnum.playImmediately;
	}
	return (element.hasOwnProperty(ConditionalExprEnum.exprTag) && !checkConditionalExp(element.expr!, playerName, playerId));
}

/**
 * parses nested conditional expression - removes unnecessary characters and replaces AND and OR operators as well as [ ]
 * @param expresion
 */
function removeCharactersNestedExpr(expresion: string): string {
	let parsedExpr = expresion;
	parsedExpr = parsedExpr.replace(/\s/g, '');
	// split-string module can only split by one character, so its necessary to replace AND, OR strings with another characters
	parsedExpr = parsedExpr.replace(/and|AND/g, '!');
	parsedExpr = parsedExpr.replace(/or|OR/g, '?');
	// remove brackets for strings like [ condition ]
	if (parsedExpr[0] === '[') {
		parsedExpr = parsedExpr.substring(1);
	}

	if (parsedExpr[parsedExpr.length - 1] === ']') {
		parsedExpr = parsedExpr.slice(0, -1);
	}
	return parsedExpr;
}

/**
 * Checks if conditional expression evaluates true or false
 * @param expresion - conditional expression such as adapi-compare('2030-01-01T00:00:00', adapi-date())&lt;0
 * @param playerName - name of player specified in sos timings config ( sos.config.playerName )
 * @param playerId - id of player specified in sos timings config ( sos.config.playerId )
 */
export function checkConditionalExp(expresion: string, playerName: string = '', playerId: string = ''): boolean {
	let parsedExpr = removeCharactersNestedExpr(expresion);

	const splitByAnd = split(parsedExpr, {brackets: {'[': ']'}, separator: '!'});
	if (splitByAnd.length > 1) {
		for (const element of splitByAnd) {
			if (!checkConditionalExp(element, playerName, playerId)) {
				return false;
			}
		}
		return true;
	}
	const splitByOr = split(parsedExpr, {brackets: {'[': ']'}, separator: '?'});
	if (splitByOr.length > 1) {
		for (const element of splitByOr) {
			if (checkConditionalExp(element, playerName, playerId)) {
				return true;
			}
		}
		return false;
	}
	return parseConditionalExp(parsedExpr, playerName, playerId);
}

/**
 * Evaluates expression comparing days in week expr="adapi-weekday()=1" or expr="adapi-gmweekday()=1"
 * week days 0 (Sunday) to 6 (Saturday)
 * @param element - conditional expression such as expr="adapi-weekday()=1"
 * @param weekDay - parameter specifying which time format to use adapi-weekday() or adapi-gmweekday()
 * @param isUtc -  if date is in UTC or not
 */
function parseWeekDayExpr(element: string, weekDay: string, isUtc: boolean): boolean {
	let firstArgument;
	let secondArgument;
	let comparator;
	if (element.indexOf(weekDay) === 0) {
		firstArgument = generateCurrentDate(isUtc).day();
		secondArgument = parseInt(element.slice(weekDay.length).slice(-1));
		comparator = element.slice(weekDay.length).slice(0, -1);
		return compareValues(firstArgument, secondArgument, comparator);
	} else {
		firstArgument = parseInt(element.slice(0, 1));
		secondArgument = generateCurrentDate(isUtc).day();
		comparator = element.slice(0, element.indexOf(weekDay[0])).slice(1);
		// in case string contains two g characters, one in comparator &gt; and one in weekDay identifier gmweekday
		// we need to split by second character
		if ((element.match(/g/g) || []).length >= 2) {
			comparator = element.slice(0, getPosition(element, weekDay[0], 2)).slice(1);
		}
		return compareValues(firstArgument, secondArgument, comparator);
	}
}

/**
 * Evaluates expression comparing two dates expr="adapi-compare(adapi-date(),'2010-01-01T00:00:00')&lt;0"
 * @param firstArgument - simple date expression adapi-date() or date specified 2010-01-01T00:00:00
 * @param secondArgument - simple date expression adapi-date() or date specified 2010-01-01T00:00:00
 * @param comparator - specified how to compare two dates ( &lt; , &lt;=, =, &gt;=, &gt; )
 * @param isUtc -  if date is in UTC or not
 */
function parseSimpleDateExpr(firstArgument: string, secondArgument: string, comparator: string, isUtc: boolean): boolean {
	if (firstArgument === ConditionalExprEnum.currentDate || firstArgument === ConditionalExprEnum.currentDateUTC) {
		firstArgument = generateCurrentDate(isUtc).format(ConditionalExprEnum.dateFormat);
		if (isIsoDate(secondArgument)) {
			secondArgument = moment(secondArgument).format(ConditionalExprEnum.dateFormat);
		}
	}

	if (secondArgument === ConditionalExprEnum.currentDate || firstArgument === ConditionalExprEnum.currentDateUTC) {
		secondArgument = generateCurrentDate(isUtc).format(ConditionalExprEnum.dateFormat);
		if (isIsoDate(firstArgument)) {
			firstArgument = moment(firstArgument).format(ConditionalExprEnum.dateFormat);
		}
	}

	return compareValues(firstArgument, secondArgument, comparator);
}

/**
 * Evaluates expression comparing two times expr="adapi-compare(time(),'19:00:00')&lt;0"
 * @param firstArgument - simple time expression time() or date specified 19:00:00
 * @param secondArgument - simple time expression time() or date specified 19:00:00
 * @param comparator - specified how to compare two dates ( &lt; , &lt;=, =, &gt;=, &gt; )
 * @param isUtc -  if time is in UTC or not
 */
function parseSimpleTimeExpr(firstArgument: string, secondArgument: string, comparator: string, isUtc: boolean): boolean {
	if (firstArgument === ConditionalExprEnum.currentTime || firstArgument === ConditionalExprEnum.currentTimeUTC) {
		firstArgument = generateCurrentDate(isUtc).format(ConditionalExprEnum.timeFormat);
		if (isValidTime(secondArgument)) {
			secondArgument = moment(secondArgument, ConditionalExprEnum.timeFormat).format(ConditionalExprEnum.timeFormat);
		}
	}

	if (secondArgument === ConditionalExprEnum.currentTime || secondArgument === ConditionalExprEnum.currentTimeUTC) {
		secondArgument = generateCurrentDate(isUtc).format(ConditionalExprEnum.timeFormat);
		if (isValidTime(firstArgument)) {
			firstArgument = moment(firstArgument, ConditionalExprEnum.timeFormat).format(ConditionalExprEnum.timeFormat);
		}
	}

	return compareValues(firstArgument, secondArgument, comparator);
}

/**
 * Evaluates expression comparing playerID or playerName expr="adapi-compare(smil-playerId(),'playerId')" or
 * expr="adapi-compare(smil-playerName(),'Entrance')"
 * @param firstArgument - smil-playerName or smil-playerId or string identifier
 * @param removedFirstArgument - expression string without first argument such as 'playerId')"
 * @param playerIdentification - playerName or playedId from sos.config object
 */
function parsePlayerIdsExpr(firstArgument: string, removedFirstArgument: string, playerIdentification: string) {
	let secondArgument;
	if (firstArgument === ConditionalExprEnum.playerId || firstArgument === ConditionalExprEnum.playerName) {
		secondArgument = removedFirstArgument.indexOf(',') > -1 ? removedFirstArgument.slice(1, -1) : removedFirstArgument;
		return secondArgument === playerIdentification;
	} else {
		return firstArgument === playerIdentification;
	}
}

/**
 * Parses expression string into separate arguments adapi-compare('17:00:00', substring-after(adapi-date(), 'T')) &gt; 0"
 * @param element - conditional expression such as expr="adapi-weekday()=1"
 */
function parseCompareExpr(element: string): ParsedConditionalExpr {
	let firstArgument;
	let secondArgument;
	let comparator;
	const removedCompare = element.slice(ConditionalExprEnum.compareConst.length);
	firstArgument = removedCompare.substring(0, removedCompare.indexOf(','));
	if (removedCompare.startsWith(ConditionalExprEnum.substring)) {
		firstArgument = removedCompare.substring(0, getPosition(removedCompare, ',', 2));
	}
	const removedFirstArgument = removedCompare.slice(firstArgument.length + 1);

	if (removedFirstArgument.indexOf('&') > -1) {
		[secondArgument, comparator] = removedFirstArgument.split('&');
	} else if (removedFirstArgument.indexOf('=') > -1) {
		secondArgument = removedFirstArgument.split('=')[0];
		comparator = '=';
	} else {
		// compare not lower, greater but for exact string matching (playerId, playerName) expr="adapi-compare(smil-playerName(),'Entrance')"
		secondArgument = removedFirstArgument;
		comparator = '';
	}

	return {
		firstArgument,
		removedFirstArgument,
		secondArgument,
		comparator,
	};
}

/**
 * Parses nested substring expression substring-after(adapi-date(), 'T')
 * @param argument part of conditional expression such as substring-after(adapi-date(), 'T')
 */
function parseSubstringExpr(argument: string): string {
	let [innerFirst, innerSecond] = argument.slice(ConditionalExprEnum.substringAfter.length).split(',');
	if (innerFirst === ConditionalExprEnum.currentDate) {
		argument = generateCurrentDate(false).format(ConditionalExprEnum.dateAndTimeFormat).split(innerSecond)[1];
	}
	if (innerSecond === ConditionalExprEnum.currentDate) {
		argument = generateCurrentDate(false).format(ConditionalExprEnum.dateAndTimeFormat).split(innerFirst)[1];
	}
	return argument;
}

/**
 * Evaluates unparsed expression expr="adapi-compare(adapi-date(),'2010-01-01T00:00:00')&lt;0"
 * @param elementExpr - conditional expression expr="adapi-compare(adapi-date(),'2010-01-01T00:00:00')&lt;0"
 * @param playerName - name of player specified in sos timings config ( sos.config.playerName )
 * @param playerId - id of player specified in sos timings config ( sos.config.playerId )
 */
function parseConditionalExp(elementExpr: string, playerName: string = '', playerId: string = '') {
	let element = removeUnnecessaryCharacters(elementExpr);

	if (element.indexOf(ConditionalExprEnum.weekDayUTC) > -1) {
		return parseWeekDayExpr(element, ConditionalExprEnum.weekDayUTC, true);
	}

	if (element.indexOf(ConditionalExprEnum.weekDay) > -1) {
		return parseWeekDayExpr(element, ConditionalExprEnum.weekDay, false);
	}

	if (element.indexOf(ConditionalExprEnum.compareConst) > -1) {

		let {
			firstArgument,
			removedFirstArgument,
			secondArgument,
			comparator,
		} = parseCompareExpr(element);

		if (element.indexOf(ConditionalExprEnum.playerId) > -1) {
			return parsePlayerIdsExpr(firstArgument, removedFirstArgument, playerId);
		}

		if (element.indexOf(ConditionalExprEnum.playerName) > -1) {
			return parsePlayerIdsExpr(firstArgument, removedFirstArgument, playerName);
		}

		if (firstArgument === ConditionalExprEnum.currentDate ||
			secondArgument === ConditionalExprEnum.currentDate) {
			return parseSimpleDateExpr(firstArgument, secondArgument, comparator, false);
		}

		if (firstArgument === ConditionalExprEnum.currentDateUTC ||
			secondArgument === ConditionalExprEnum.currentDateUTC) {
			return parseSimpleDateExpr(firstArgument, secondArgument, comparator, true);
		}

		if (firstArgument === ConditionalExprEnum.currentTime ||
			secondArgument === ConditionalExprEnum.currentTime) {
			return parseSimpleTimeExpr(firstArgument, secondArgument, comparator, false);
		}

		if (firstArgument === ConditionalExprEnum.currentTimeUTC ||
			secondArgument === ConditionalExprEnum.currentTimeUTC) {
			return parseSimpleTimeExpr(firstArgument, secondArgument, comparator, true);
		}

		if (typeof firstArgument === 'string' && firstArgument.startsWith(ConditionalExprEnum.substringAfter)) {
			firstArgument = parseSubstringExpr(firstArgument);
			return compareValues(firstArgument, secondArgument, comparator);
		}

		if (typeof secondArgument === 'string' && secondArgument.startsWith(ConditionalExprEnum.substringAfter)) {
			secondArgument = parseSubstringExpr(secondArgument);
			return compareValues(firstArgument, secondArgument, comparator);
		}

	}

	debug('Conditional expression format is not supported: %s', element);
	return false;
}

/**
 * adapi-compare(adapi-date(),'2010-01-01T00:00:00')&lt;0 => adapi-compareadapi-date,2010-01-01T00:00:00&lt;0
 * @param expr - conditional expression adapi-compare(adapi-date(),'2010-01-01T00:00:00')&lt;0
 */
function removeUnnecessaryCharacters(expr: string): string {
	let parsedExpr = expr;
	parsedExpr = parsedExpr.replace(/\s/g, '');
	parsedExpr = parsedExpr.replace(/\)/g, '');
	parsedExpr = parsedExpr.replace(/\(/g, '');
	parsedExpr = parsedExpr.replace(/\[/g, '');
	parsedExpr = parsedExpr.replace(/\]/g, '');
	parsedExpr = parsedExpr.replace(/\'/g, '');
	parsedExpr = parsedExpr.replace(/>/g, '&gt;');
	parsedExpr = parsedExpr.replace(/</g, '&lt;');
	parsedExpr = parsedExpr.replace(/adapi-/g, '');

	return parsedExpr;
}

/**
 * check if values and specified comparator match
 * @param firstArgument - string or number to compare
 * @param secondArgument - string or number to compare
 * @param comparator - specified how to compare two dates ( &lt; , &lt;=, =, &gt;=, &gt; )
 */
function compareValues(firstArgument: string | number, secondArgument: string | number, comparator: string) {
	if (firstArgument < secondArgument && comparator.indexOf('lt;') > -1) {
		return true;
	}

	if (firstArgument > secondArgument && comparator.indexOf('gt;') > -1) {
		return true;
	}

	return firstArgument === secondArgument && comparator.indexOf('=') > -1;
}

function isIsoDate(dateString: string) {
	if (!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dateString)) {
		return false;
	}
	let d = moment(dateString).utc(true);
	const stringDate = d.toISOString().indexOf('Z') > -1 ? d.toISOString().substring(0, d.toISOString().length - 5) : d.toISOString();
	return stringDate === dateString;
}

function isValidTime(timeString: string) {
	return /(?:[01]\d|2[0123]):(?:[012345]\d)(:[012345]\d)/.test(timeString);
}
