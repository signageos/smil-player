import moment from "moment";
import isNil = require('lodash/isNil');
import isObject = require('lodash/isObject');

import { PlaylistElement } from '../../../models/playlistModels';
import { isConditionalExpExpired } from './conditionalTools';
import { SMILScheduleEnum } from '../../../enums/scheduleEnums';
import { parseSmilSchedule } from './wallclockTools';
import { removeDigits } from "./generalTools";

/**
 * function to set defaultAwait in case of no active element in wallclock schedule to avoid infinite loop
 * @param playlistElement - element of SMIL media playlists ( seq, or par tags )
 */
export function setDefaultAwaitWallclock(playlistElement: PlaylistElement): number {
	const nowMillis: number = moment().valueOf();
	const {timeToStart, timeToEnd} = parseSmilSchedule(playlistElement.begin!, playlistElement.end);
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
export function setDefaultAwaitConditional(playlistElement: PlaylistElement, playerName: string, playerId: string): number {
	// found element which can be player right now
	if (!isConditionalExpExpired(playlistElement, playerName, playerId)) {
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
export function setDefaultAwait(elementsArray: PlaylistElement[], playerName: string = '', playerId: string = ''): number {
	for (const loopElem of elementsArray) {
		// no wallclock or expr specified
		if (!loopElem.hasOwnProperty('begin') && !loopElem.hasOwnProperty('expr')) {
			return SMILScheduleEnum.playImmediately;
		}

		if (loopElem.hasOwnProperty('begin')) {
			if (setDefaultAwaitWallclock(loopElem) === SMILScheduleEnum.playImmediately) {
				if (loopElem.hasOwnProperty('expr')) {
					if (setDefaultAwaitConditional(loopElem, playerName, playerId) === SMILScheduleEnum.playImmediately) {
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

	return SMILScheduleEnum.defaultAwait;
}

/**
 * how long should image, audio, widget stay on the screen
 * @param dur - duration of element specified in smil file
 */
export function setElementDuration(dur: string | undefined): number {
	if (dur === 'indefinite') {
		return SMILScheduleEnum.infiniteDuration;
	}

	// if duration is undefined
	if (isNil(dur)) {
		return SMILScheduleEnum.defaultDuration;
	}

	// replace wrong decimal delimiter
	dur = dur.replace(/,/g, ".");
	// leave only digits in duration string ( can contain s character )
	dur = dur.replace(/[^0-9.]/g, "");
	// empty string or NaN
	if (isNaN(Number(dur)) || dur.length === 0) {
		return SMILScheduleEnum.defaultDuration;
	}

	return parseFloat(dur) * 1000;
}

export function findDuration(elem: PlaylistElement): string | undefined {
	for (let [key, value] of Object.entries(elem)) {
		if (key === 'dur') {
			return <string> value;
		}
		if (isObject(value) && removeDigits(key) !== 'img' && removeDigits(key) !== 'ref' && removeDigits(key) !== 'video') {
			return findDuration(<any> value);
		}
	}
}
