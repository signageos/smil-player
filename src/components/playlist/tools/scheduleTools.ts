/* tslint:disable: missing whitespace */
import moment from 'moment';
import isNil = require('lodash/isNil');
import isObject = require('lodash/isObject');

import { PlaylistElement } from '../../../models/playlistModels';
import { createConditionalFns } from './conditionalTools';
import { SMILScheduleEnum } from '../../../enums/scheduleEnums';
import { createWallclockTools } from './wallclockTools';
import { Log } from '../../../logger';
import { removeDigits } from './generalTools';

export function createScheduleTools(log: Log) {
	const { parseSmilSchedule } = createWallclockTools(log);

	/**
	 * function to set defaultAwait in case of no active element in wallclock schedule to avoid infinite loop
	 * @param playlistElement - element of SMIL media playlists ( seq, or par tags )
	 */
	function setDefaultAwaitWallclock(playlistElement: PlaylistElement): number {
		const nowMillis: number = moment().valueOf();
		const { timeToStart, timeToEnd } = parseSmilSchedule(playlistElement.begin!, playlistElement.end);
		// found element which can be player right now
		if (timeToStart <= 0 && timeToEnd > nowMillis) {
			return SMILScheduleEnum.playImmediately;
		}
		return SMILScheduleEnum.defaultAwait;
	}

	/**
	 * function to set defaultAwait in case of no active element in conditional expression schedule to avoid infinite loop
	 * @param playlistElement - element of SMIL media playlists ( seq, or par tags )
	 * @param playerName
	 * @param playerId
	 */
	function setDefaultAwaitConditional(
		playlistElement: PlaylistElement,
		playerName: string,
		playerId: string,
	): number {
		// found element which can be player right now
		if (!conditional.shouldSkipElement(playlistElement, playerName, playerId)) {
			return SMILScheduleEnum.playImmediately;
		}
		return SMILScheduleEnum.defaultAwait;
	}

	/**
	 * function to set defaultAwait in case of no active element in conditional or wallclock expression schedule to avoid infinite loop
	 * @param elementsArray - array of elements of SMIL media playlists ( seq, or par tags )
	 * @param playerName
	 * @param playerId
	 */
	function setDefaultAwait(
		elementsArray: PlaylistElement[],
		playerName: string = '',
		playerId: string = '',
	): number {
		for (const loopElem of elementsArray) {
			// Runtime unavailable-content flag — never a playable candidate. Must be checked
			// before the no-begin-no-expr early exit below, which would otherwise report a
			// marked element as playImmediately.
			if (loopElem.skipContentMark) {
				continue;
			}

			// no wallclock or expr specified
			if (!loopElem.hasOwnProperty('begin') && !loopElem.hasOwnProperty('expr')) {
				return SMILScheduleEnum.playImmediately;
			}

			if (loopElem.hasOwnProperty('begin')) {
				if (setDefaultAwaitWallclock(loopElem) === SMILScheduleEnum.playImmediately) {
					if (loopElem.hasOwnProperty('expr')) {
						if (
							setDefaultAwaitConditional(loopElem, playerName, playerId) === SMILScheduleEnum.playImmediately
						) {
							return SMILScheduleEnum.playImmediately;
						} else {
							continue;
						}
					}
					return SMILScheduleEnum.playImmediately;
				}
			}

			if (loopElem.hasOwnProperty('expr') && !loopElem.hasOwnProperty('begin')) {
				if (setDefaultAwaitConditional(loopElem, playerName, playerId) === SMILScheduleEnum.playImmediately) {
					return SMILScheduleEnum.playImmediately;
				}
			}
		}

		log.debug('[schedule] no playable item in %d elements, setting default await', elementsArray.length);
		return SMILScheduleEnum.defaultAwait;
	}

	/**
	 * how long should image, audio, widget, ticker stay on the screen
	 * @param dur - duration of element specified in smil file
	 */
	function setElementDuration(dur: string | undefined): number {
		if (dur === 'indefinite') {
			log.debug('[schedule] parsed duration: indefinite');
			return SMILScheduleEnum.infiniteDuration;
		}

		// if duration is undefined
		if (isNil(dur)) {
			log.debug('[schedule] parsed duration: default (dur undefined)');
			return SMILScheduleEnum.defaultDuration;
		}

		// replace wrong decimal delimiter
		dur = dur.replace(/,/g, '.');
		// leave only digits in duration string ( can contain s character )
		dur = dur.replace(/[^0-9.]/g, '');
		// empty string or NaN
		if (isNaN(Number(dur)) || dur.length === 0) {
			log.debug('[schedule] parsed duration: default (invalid format: %s)', dur);
			return SMILScheduleEnum.defaultDuration;
		}

		return parseFloat(dur) * 1000;
	}

	/**
	 * checks if all elements in array have wallclock begin and all are permanently expired (neverPlay)
	 * @param elements - array of playlist elements to check
	 */
	function areAllWallclocksPermanentlyExpired(elements: PlaylistElement[]): boolean {
		if (!Array.isArray(elements) || elements.length === 0) {
			return false;
		}

		for (const elem of elements) {
			if (!elem.hasOwnProperty('begin') || !elem.begin || elem.begin.indexOf('wallclock') === -1) {
				return false;
			}
			const { timeToEnd } = parseSmilSchedule(elem.begin, elem.end);
			if (timeToEnd !== SMILScheduleEnum.neverPlay) {
				return false;
			}
		}

		log.debug('[schedule] all wallclock elements permanently expired: count=%d', elements.length);
		return true;
	}

	// Function declarations are hoisted, so handing setDefaultAwait over before this line is safe.
	const conditional = createConditionalFns(log, setDefaultAwait);

	return {
		...conditional,
		setDefaultAwait,
		setDefaultAwaitWallclock,
		setDefaultAwaitConditional,
		setElementDuration,
		areAllWallclocksPermanentlyExpired,
	};
}
export type ScheduleTools = ReturnType<typeof createScheduleTools>;

export function findDuration(elem: PlaylistElement): string | undefined {
	for (let [key, value] of Object.entries(elem)) {
		if (key === 'dur') {
			return value as string;
		}
		if (
			isObject(value) &&
			removeDigits(key) !== 'img' &&
			removeDigits(key) !== 'ref' &&
			removeDigits(key) !== 'video'
		) {
			return findDuration(value);
		}
	}
}
