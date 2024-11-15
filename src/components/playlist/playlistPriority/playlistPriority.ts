/* tslint:disable:Unnecessary semicolon missing whitespace */
import { SMILMedia, SMILVideo } from '../../../models/mediaModels';
import { PriorityObject } from '../../../models/priorityModels';
import { getIndexOfPlayingMedia, removeDigits, sleep } from '../tools/generalTools';
import { cloneDeep, isEqual, isNil } from 'lodash';
import Debug from 'debug';
import { PlaylistCommon } from '../playlistCommon/playlistCommon';
import FrontApplet from '@signageos/front-applet/es6/FrontApplet/FrontApplet';
import { FilesManager } from '../../files/filesManager';
import { CurrentlyPlayingRegion, PlaylistOptions } from '../../../models/playlistModels';
import { PriorityRule } from '../../../enums/priorityEnums';
import { IPlaylistPriority } from './IPlaylistPriority';
import { PlaylistTriggers } from '../playlistTriggers/playlistTriggers';
import { cancelDynamicPlaylistMaster } from '../tools/dynamicTools';

const debug = Debug('@signageos/smil-player:playlistPriority');

export class PlaylistPriority extends PlaylistCommon implements IPlaylistPriority {
	constructor(sos: FrontApplet, files: FilesManager, options: PlaylistOptions) {
		super(sos, files, options);
	}

	/**
	 * Handles lifecycle of playlist in priority behaviour
	 * @param value - json object or array of json objects of type SMILAudio | SMILImage | SMILWidget | SMILVideo | SMILTicker
	 * @param elementKey
	 * @param version - smil internal version of current playlist
	 * @param parent - parent specifying parent object in xml with randomly generated suffix (par-98324)
	 * @param endTime - time when should playlist end in millis or as repeatCount ( less than 1000 )
	 * @param priorityObject - information about priority rules for given playlist
	 */
	public priorityBehaviour = async (
		value: SMILMedia,
		elementKey: string,
		version: number,
		parent: string = '0',
		endTime: number = 0,
		priorityObject: PriorityObject = <PriorityObject>{},
	): Promise<{
		currentIndex: number;
		previousPlayingIndex: number;
	}> => {
		const priorityRegionName = value.regionInfo.regionName;

		let { currentIndex, previousPlayingIndex } = this.handlePriorityInfoObject(
			priorityRegionName,
			value,
			parent,
			endTime,
			priorityObject,
			version,
		);
		debug(
			'Got currentIndex and previousPlayingIndex: %s, %s for priorityRegionName: %s',
			currentIndex,
			previousPlayingIndex,
			priorityRegionName,
		);

		if (
			this.currentlyPlayingPriority[priorityRegionName]?.length > 1 &&
			currentIndex !== previousPlayingIndex &&
			this.currentlyPlayingPriority[priorityRegionName][currentIndex].version ===
				this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex].version
		) {
			debug(
				'Detected priority conflict for playlist: %O',
				this.currentlyPlayingPriority[priorityRegionName][currentIndex],
			);
			await this.handlePriorityBeforePlay(
				elementKey,
				priorityObject,
				priorityRegionName,
				currentIndex,
				previousPlayingIndex,
				parent,
				endTime,
			);
		}

		this.currentlyPlayingPriority[priorityRegionName][currentIndex].player.playing = true;

		return {
			currentIndex,
			previousPlayingIndex,
		};
	};

	/**
	 * Function set current playlist as finished based on endTime or repeatCount and releases all playlists which were dependent on it
	 * @param value
	 * @param priorityRegionName - regionName in which playlist will be played
	 * @param currentIndex - at which index is playlist stored in currentlyPlayingPriority object
	 * @param endTime - time when should playlist end in millis or as repeatCount ( less than 1000 )
	 * @param isLast - if current playlist is last in playlist chain ( could me multiple image, video, widgets playlists )
	 * @param version - smil internal version of current playlist
	 * @param currentVersion - global version of the newest playlist of smil
	 * @param triggers
	 */
	public handlePriorityWhenDone = async (
		value: SMILMedia,
		priorityRegionName: string,
		currentIndex: number,
		endTime: number,
		isLast: boolean,
		version: number,
		currentVersion: number,
		triggers: PlaylistTriggers,
	): Promise<void> => {
		const currentIndexPriority = this.currentlyPlayingPriority[priorityRegionName][currentIndex];
		debug('Checking if playlist is finished: %O for region: %s', currentIndexPriority, priorityRegionName);
		/*
			condition which determines if this was last iteration of playlist
			endTimeExpired: if endTime in millis is lower as current time and at the same time is higher than 1000
				- endTime is specified in date in millis
			repeatCountExpired: if timesPlayed is bigger than endTime
				- endTime is specified as repeatCount ( <= 1000 )
			isLastElement: is last part of current playlist chain
			smilFileUpdated: smil file was updated force end of playlist
			expiredVersion: smil file was updated force end of playlist based on version
		 */

		const endTimeExpired: boolean =
			currentIndexPriority.player.endTime <= Date.now() && currentIndexPriority.player.endTime > 1000;
		// TODO: dynamic playlist is somehow one iteration forward
		const repeatCountExpired: boolean = currentIndexPriority.player.timesPlayed >= endTime - 1;
		const isLastElement: boolean = isLast;
		const smilFileUpdated: boolean = this.getCancelFunction();
		const expiredVersion: boolean = version < currentVersion;

		if (((endTimeExpired || repeatCountExpired) && isLastElement) || smilFileUpdated || expiredVersion) {
			debug('Finished playing playlist: %O for region: %s', currentIndexPriority, priorityRegionName);
			// some playlist was paused by this one, unpause it
			const pausedIndex = currentIndexPriority.controlledPlaylist;
			// reset counter for finished playlist
			currentIndexPriority.player.timesPlayed = 0;
			currentIndexPriority.player.playing = false;

			if (!isNil(pausedIndex)) {
				const pausedIndexPriority = this.currentlyPlayingPriority[priorityRegionName][pausedIndex];
				debug(
					'Un paused priority dependant playlist: %O for region: %s',
					pausedIndexPriority,
					priorityRegionName,
				);
				pausedIndexPriority.player.contentPause = 0;
				pausedIndexPriority.behaviour = '';
			}

			if (currentIndexPriority.media.dynamicValue && currentIndexPriority.priority.priorityLevel !== 1000) {
				debug('Dynamic playlist finished: %O for region: %s', currentIndexPriority.media, priorityRegionName);
				await cancelDynamicPlaylistMaster(
					triggers,
					this.sos,
					this.currentlyPlaying,
					this.synchronization,
					this.currentlyPlayingPriority,
					value.dynamicValue!,
				);
			}
		}
	};

	/**
	 * Determines which priority rule to use
	 * @param priorityObject - information about priority rules for given playlist
	 * @param priorityRegionName - regionName in which playlist will be played
	 * @param currentIndex - at which index is playlist stored in currentlyPlayingPriority object
	 * @param previousPlayingIndex - at which index is previously playing playlist stored in currentlyPlayingPriority object
	 * @param parent - parent specifying parent object in xml with randomly generated suffix (par-98324)
	 * @param endTime - time when should playlist end in millis or as repeatCount ( less than 1000 )
	 * @param priorityRule - which priority rule will be used ( never, stop, pause or defer )
	 */
	private handlePriorityRules = async (
		elementKey: string,
		priorityObject: PriorityObject,
		priorityRegionName: string,
		currentIndex: number,
		previousPlayingIndex: number,
		parent: string,
		endTime: number,
		priorityRule: string,
	): Promise<void> => {
		switch (priorityRule) {
			case PriorityRule.never:
				await this.handleNeverBehaviour(priorityRegionName, currentIndex);
				break;
			case PriorityRule.stop:
				this.handleStopBehaviour(priorityRegionName, previousPlayingIndex);
				break;
			case PriorityRule.pause:
				this.handlePauseBehaviour(priorityRegionName, currentIndex, previousPlayingIndex);
				break;
			case PriorityRule.defer:
				await this.handleDeferBehaviour(
					elementKey,
					priorityObject,
					priorityRegionName,
					currentIndex,
					previousPlayingIndex,
					parent,
					endTime,
				);
				break;
			default:
				debug('Specified priority rule: %s is not supported', priorityRule);
		}
	};

	/**
	 * Function checks if conditions are met for va rious priority cases
	 * @param priorityObject - information about priority rules for given playlist
	 * @param priorityRegionName - regionName in which playlist will be played
	 * @param currentIndex - at which index is playlist stored in currentlyPlayingPriority object
	 * @param previousPlayingIndex - at which index is previously playing playlist stored in currentlyPlayingPriority object
	 * @param parent - parent specifying parent object in xml with randomly generated suffix (par-98324)
	 * @param endTime - time when should playlist end in millis or as repeatCount ( less than 1000 )
	 */
	private handlePriorityBeforePlay = async (
		elementKey: string,
		priorityObject: PriorityObject,
		priorityRegionName: string,
		currentIndex: number,
		previousPlayingIndex: number,
		parent: string,
		endTime: number,
	): Promise<void> => {
		const currentIndexPriority = this.currentlyPlayingPriority[priorityRegionName][currentIndex];
		const previousIndexPriority = this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex];

		const isPeerPriorityConflict =
			previousIndexPriority.priority.priorityLevel === priorityObject.priorityLevel &&
			previousIndexPriority.parent !== parent &&
			previousIndexPriority.player.playing &&
			(Date.now() <= endTime || endTime <= 1000);

		// ignore priority behaviour if syncing is in action
		// ( one device is skipping playlist elements to catch up to other devices in the group )
		if ((this.synchronization.syncingInAction || this.synchronization.movingForward) && isPeerPriorityConflict) {
			// turn off previous priority playlist marked as playing
			this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex].player.playing = false;
			debug('Syncing in action, skipping priority behaviour');
			return;
		}

		// console.log('handlePriorityBeforePlay++', currentIndexPriority.media.src);
		// if attempted to play playlist which was stopped by higher priority, wait till end of higher priority playlist and try again
		if (currentIndexPriority.parent === parent && currentIndexPriority.behaviour === 'stop') {
			await this.handlePrecedingContentStop(
				priorityObject,
				priorityRegionName,
				currentIndex,
				previousPlayingIndex,
			);
		}

		// playlist has higher priority than currently playing
		if (
			previousIndexPriority.priority.priorityLevel < priorityObject.priorityLevel &&
			previousIndexPriority.player.playing
		) {
			debug(
				'Found conflict with lower priority playlist playlist, lower: %O, higher: %O',
				previousIndexPriority,
				currentIndexPriority,
			);

			await this.handlePriorityRules(
				elementKey,
				priorityObject,
				priorityRegionName,
				currentIndex,
				previousPlayingIndex,
				parent,
				endTime,
				previousIndexPriority.priority.higher,
			);
		}

		// playlist has same ( peer ) priority than currently playing
		if (isPeerPriorityConflict) {
			debug(
				'Found conflict with same priority playlists, old: %O, new: %O',
				previousIndexPriority,
				currentIndexPriority,
			);

			await this.handlePriorityRules(
				elementKey,
				priorityObject,
				priorityRegionName,
				currentIndex,
				previousPlayingIndex,
				parent,
				endTime,
				previousIndexPriority.priority.peer,
			);
		}

		// playlist has lower priority than currently playing
		if (
			previousIndexPriority.priority.priorityLevel > priorityObject.priorityLevel &&
			previousIndexPriority.player.playing
		) {
			debug(
				'Found conflict with higher priority playlist playlist, higher: %O, lower: %O',
				previousIndexPriority,
				currentIndexPriority,
			);

			await this.handlePriorityRules(
				elementKey,
				priorityObject,
				priorityRegionName,
				currentIndex,
				previousPlayingIndex,
				parent,
				endTime,
				previousIndexPriority.priority.lower,
			);
		}
	};

	/**
	 * If preceding playlist in chain was stopped, this function stops also following playlist
	 * @param priorityObject - information about priority rules for given playlist
	 * @param priorityRegionName - regionName in which playlist will be played
	 * @param currentIndex - at which index is playlist stored in currentlyPlayingPriority object
	 * @param previousPlayingIndex - at which index is previously playing playlist stored in currentlyPlayingPriority object
	 */
	private handlePrecedingContentStop = async (
		priorityObject: PriorityObject,
		priorityRegionName: string,
		currentIndex: number,
		previousPlayingIndex: number,
	): Promise<void> => {
		let currentPriorityRegion = this.currentlyPlayingPriority[priorityRegionName];
		const currentIndexPriority = this.currentlyPlayingPriority[priorityRegionName][currentIndex];
		debug('Previous iteration of this playlist was stopped, stopping this one as well: %O', currentIndexPriority);

		while (true) {
			if (
				!(await this.handlePriorityDeferStopWait(
					currentPriorityRegion,
					currentIndexPriority,
					previousPlayingIndex,
					priorityRegionName,
					priorityObject,
				))
			) {
				return;
			}

			currentIndexPriority.behaviour = '';
			currentIndexPriority.player.stop = false;

			debug('Stop behaviour lock released for playlist: %O', currentIndexPriority);

			// regenerate
			let newPreviousIndex = getIndexOfPlayingMedia(this.currentlyPlayingPriority[priorityRegionName]);

			debug(
				'Found new active playlist index for stop behaviour, current: %s, new: %s',
				previousPlayingIndex,
				newPreviousIndex,
			);

			// no playlist currently playing, this one can proceed to playback
			if (newPreviousIndex === -1) {
				newPreviousIndex = 0;
				previousPlayingIndex = newPreviousIndex;
				debug('Stop behaviour, no active playlist found');
				break;
			}

			previousPlayingIndex = newPreviousIndex;
			// break only if priority level is not same, because if it is, peer priority which comes later in
			// playlist is playing, and previous playlist cannot cancel it
			if (currentPriorityRegion[previousPlayingIndex].priority.priorityLevel < priorityObject.priorityLevel) {
				debug('Stop behaviour: breaking from stop lock');
				break;
			}
			debug(
				'New found playlist has same priority, wait for it to finish, setting stop behaviour for playlist: %O',
				currentIndexPriority,
			);
		}
	};

	/**
	 * Function handles pause behaviour meaning current playlist is paused higher priority finishes
	 * @param priorityRegionName - regionName in which playlist will be played
	 * @param currentIndex - at which index is playlist stored in currentlyPlayingPriority object
	 * @param previousPlayingIndex - at which index is previously playing playlist stored in currentlyPlayingPriority object
	 */
	private handlePauseBehaviour = (
		priorityRegionName: string,
		currentIndex: number,
		previousPlayingIndex: number,
	): void => {
		const currentIndexPriority = this.currentlyPlayingPriority[priorityRegionName][currentIndex];
		const previousIndexPriority = this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex];
		debug('Pausing playlist: %O', previousIndexPriority);
		previousIndexPriority.player.contentPause = 9999999;
		previousIndexPriority.player.playing = false;
		previousIndexPriority.behaviour = 'pause';
		currentIndexPriority.controlledPlaylist = previousPlayingIndex;
	};

	/**
	 * Function handles stop behaviour meaning current playlist is stopped higher priority finishes
	 * @param priorityRegionName - regionName in which playlist will be played
	 * @param previousPlayingIndex - at which index is previously playing playlist stored in currentlyPlayingPriority object
	 */
	private handleStopBehaviour = (priorityRegionName: string, previousPlayingIndex: number): void => {
		const previousIndexPriority = this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex];
		debug('Stopping playlist: %O', previousIndexPriority);
		previousIndexPriority.player.stop = true;
		previousIndexPriority.player.playing = false;
		previousIndexPriority.behaviour = 'stop';
	};

	private handleNeverBehaviour = async (priorityRegionName: string, currentIndex: number) => {
		debug(
			'Found never behaviour for playlist: %O skipping',
			this.currentlyPlayingPriority[priorityRegionName][currentIndex],
		);
		// avoid infinite loop
		await sleep(100);
	};

	/**
	 * Function handles defer behaviour meaning current playlist is delayed until higher priority finishes
	 * @param priorityObject - information about priority rules for given playlist
	 * @param priorityRegionName - regionName in which playlist will be played
	 * @param currentIndex - at which index is playlist stored in currentlyPlayingPriority object
	 * @param previousPlayingIndex - at which index is previously playing playlist stored in currentlyPlayingPriority object
	 * @param parent - parent specifying parent object in xml with randomly generated suffix (par-98324)
	 * @param endTime - time when should playlist end in millis or as repeatCount ( less than 1000 )
	 */
	private handleDeferBehaviour = async (
		elementKey: string,
		priorityObject: PriorityObject,
		priorityRegionName: string,
		currentIndex: number,
		previousPlayingIndex: number,
		parent: string,
		endTime: number,
	): Promise<void> => {
		let currentPriorityRegion = this.currentlyPlayingPriority[priorityRegionName];
		const currentIndexPriority = this.currentlyPlayingPriority[priorityRegionName][currentIndex];
		debug('Handling defer behaviour for playlist: %O', currentIndexPriority);
		this.currentlyPlayingPriority[priorityRegionName][previousPlayingIndex].behaviour = 'defer';
		// set current deferred content to not playing
		currentIndexPriority.player.playing = false;

		// prepare video beforehand for peer priority dynamic values
		// ( usecase when defer lock is released video is not prepared and hisense has issues with it )
		try {
			if (currentIndexPriority.media.dynamicValue && removeDigits(elementKey) === 'video') {
				if (
					this.currentlyPlaying[currentIndexPriority.media.regionInfo.regionName]?.src !==
					currentIndexPriority.media.src
				) {
					const video = currentIndexPriority.media as SMILVideo;
					await this.sos.video.prepare(
						video.localFilePath,
						currentIndexPriority.media.regionInfo.left,
						currentIndexPriority.media.regionInfo.top,
						currentIndexPriority.media.regionInfo.width,
						currentIndexPriority.media.regionInfo.height,
					);

					this.videoPreparing.fullScreenTrigger = cloneDeep(video);
					debug('Prepared dynamic content video during peer priority defer stage: %O', video);
				}
			}
		} catch (err) {
			debug('Error while preparing dynamic content video during peer priority defer stage: %O', err);
		}

		while (true) {
			if (
				!(await this.handlePriorityDeferStopWait(
					currentPriorityRegion,
					currentIndexPriority,
					previousPlayingIndex,
					priorityRegionName,
					priorityObject,
				))
			) {
				return;
			}

			debug('Defer behaviour lock released for playlist: %O', currentIndexPriority);
			debug('Defer behaviour lock released priority region name: %O', priorityRegionName);

			// regenerate and also check dynamic playlist region
			let newPreviousIndex = getIndexOfPlayingMedia(this.currentlyPlayingPriority[priorityRegionName]);

			debug(
				'Found new active playlist index for defer behaviour, current: %s, new: %s',
				previousPlayingIndex,
				newPreviousIndex,
			);

			// no playlist currently playing, this one can proceed to playback
			if (newPreviousIndex === -1) {
				debug('Defer behaviour, no active playlist found');
				// TODO: make it work for all media
				// const video = currentIndexPriority.media as SMILVideo;
				// await this.sos.video.prepare(
				// 	video.localFilePath,
				// 	currentIndexPriority.media.regionInfo.left,
				// 	currentIndexPriority.media.regionInfo.top,
				// 	currentIndexPriority.media.regionInfo.width,
				// 	currentIndexPriority.media.regionInfo.height,
				// );
				// this.videoPreparing[currentIndexPriority.media.regionInfo.regionName] = cloneDeep(video);
				// debug('Prepared## video during peer priority defer stage: %O', video);
				break;
			}

			if (currentPriorityRegion[newPreviousIndex].priority.priorityLevel > priorityObject.priorityLevel) {
				debug(
					'New found playlist has higher priority, setting defer behaviour for playlist:  %O',
					currentIndexPriority,
				);
				previousPlayingIndex = newPreviousIndex;
			} else {
				await this.handlePriorityBeforePlay(
					elementKey,
					priorityObject,
					priorityRegionName,
					currentIndex,
					newPreviousIndex,
					parent,
					endTime,
				);
				break;
			}
		}
	};

	private handlePriorityDeferStopWait = async (
		currentPriorityRegion: CurrentlyPlayingRegion[],
		currentIndexPriority: CurrentlyPlayingRegion,
		previousPlayingIndex: number,
		priorityRegionName: string,
		priorityObject: PriorityObject,
	): Promise<boolean> => {
		while (currentPriorityRegion[previousPlayingIndex].player.playing) {
			await sleep(25);
		}

		console.log('Jumped OUT!!!!', currentIndexPriority);

		// if playlist is paused and new smil file version is detected, cancel pause behaviour and cancel playlist
		if (this.getCancelFunction()) {
			return false;
		}

		// during playlist pause was exceeded its endTime, dont play it and return from function, if endtime is 0, play indefinitely
		// TODO: previously currentIndexPriority.player.timesPlayed >= currentIndexPriority.player.endTime
		if (
			(currentIndexPriority.player.endTime <= Date.now() && currentIndexPriority.player.endTime > 1000) ||
			(currentIndexPriority.player.timesPlayed >= currentIndexPriority.player.endTime &&
				currentIndexPriority.player.endTime !== 0)
		) {
			// TODO: experimental, reset timesPlayed
			currentIndexPriority.player.timesPlayed = 0;
			debug('Playtime for playlist: %O was exceeded priority, exiting', currentIndexPriority);
			await sleep(
				(this.currentlyPlayingPriority[priorityRegionName]?.length - priorityObject.priorityLevel) * 50,
			);
			return false;
		}
		// wait for new potential playlist to appear
		if (!currentIndexPriority.media.dynamicValue) {
			debug(
				'sleeping defer priority interval: %s',
				(this.currentlyPlayingPriority[priorityRegionName]?.length - priorityObject.priorityLevel) * 50,
			);
			await sleep(
				(this.currentlyPlayingPriority[priorityRegionName]?.length - priorityObject.priorityLevel) * 50,
			);
		}
		return true;
	};

	/**
	 * Functions handles elements in currentlyPlayingPriority object, pushes new ones or replaces older ones when parent is same
	 * also copies necessary info from older playlists
	 * @param priorityRegionName - regionName in which playlist will be played
	 * @param value - actual playlist
	 * @param parent - parent specifying parent object in xml with randomly generated suffix (par-98324)
	 * @param endTime - time when should playlist end in millis or as repeatCount ( less than 1000 )
	 * @param priorityObject - information about priority rules for given playlist
	 * @param version
	 */
	private handlePriorityInfoObject = (
		priorityRegionName: string,
		value: SMILMedia,
		parent: string,
		endTime: number,
		priorityObject: PriorityObject,
		version: number,
	): {
		currentIndex: number;
		previousPlayingIndex: number;
	} => {
		let skipLoop = false;
		const infoObject = {
			media: value,
			player: {
				contentPause: 0,
				stop: false,
				endTime: endTime,
				playing: false,
				timesPlayed: 0,
			},
			parent: parent,
			priority: priorityObject,
			controlledPlaylist: null,
			version,
			behaviour: '',
			isFirstInPlaylist: {} as SMILMedia,
		};

		if (isNil(this.currentlyPlayingPriority[priorityRegionName])) {
			this.currentlyPlayingPriority[priorityRegionName] = [];
			// remember first media in the playlist chain
			infoObject.isFirstInPlaylist = infoObject.media;
			this.currentlyPlayingPriority[priorityRegionName].push(infoObject);
			// dont iterate over loop for the first element
			skipLoop = true;
		}

		let previousPlayingIndex = getIndexOfPlayingMedia(this.currentlyPlayingPriority[priorityRegionName]);

		previousPlayingIndex = previousPlayingIndex > -1 ? previousPlayingIndex : 0;

		let currentIndex = 0;

		if (!skipLoop) {
			let arrayIndex: number = 0;
			for (const elem of this.currentlyPlayingPriority[priorityRegionName]) {
				if (isEqual(elem.media, infoObject.media) && elem.parent === infoObject.parent) {
					// preserve behaviour of previous element from same parent
					infoObject.behaviour = elem.behaviour;
					infoObject.player.playing = elem.player.playing;
					infoObject.controlledPlaylist = <any>elem.controlledPlaylist;
					// same playlist is played again, increase count to track how many times it was already played
					// not for triggers or infinite playlists
					if (isNil(value.triggerValue) && endTime !== 0) {
						infoObject.player.timesPlayed = elem.player.timesPlayed + 1;
					}
					this.currentlyPlayingPriority[priorityRegionName][arrayIndex] = infoObject;
					currentIndex = arrayIndex;
					break;
				}

				// same parent of playlist, update currently playing object
				if (elem.parent === infoObject.parent) {
					// preserve behaviour of previous element from same parent
					infoObject.behaviour = elem.behaviour;
					infoObject.player.playing = elem.player.playing;
					infoObject.controlledPlaylist = <any>elem.controlledPlaylist;
					infoObject.player.timesPlayed = elem.player.timesPlayed;
					// increase times played only if first media in chain is playing again
					// not for triggers or infinite playlists
					if (
						isEqual(elem.isFirstInPlaylist, infoObject.media) &&
						isNil(value.triggerValue) &&
						endTime !== 0
					) {
						infoObject.player.timesPlayed = elem.player.timesPlayed + 1;
					}
					// remember first in playlist
					infoObject.isFirstInPlaylist = elem.isFirstInPlaylist;
					this.currentlyPlayingPriority[priorityRegionName][arrayIndex] = infoObject;
					if (arrayIndex === 0) {
						currentIndex = arrayIndex;
						break;
					}
					currentIndex = arrayIndex;
					break;
				}
				// new element, new parent
				if (arrayIndex === this.currentlyPlayingPriority[priorityRegionName]?.length - 1) {
					infoObject.isFirstInPlaylist = infoObject.media;
					this.currentlyPlayingPriority[priorityRegionName].push(infoObject);
					currentIndex = this.currentlyPlayingPriority[priorityRegionName]?.length - 1;
					break;
				}
				arrayIndex += 1;
			}
		}
		return { currentIndex, previousPlayingIndex };
	};
}
