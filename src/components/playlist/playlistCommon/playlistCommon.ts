/* tslint:disable:Unnecessary semicolon missing whitespace */
import { CurrentlyPlaying, CurrentlyPlayingPriority, PromiseAwaiting } from '../../../models/playlistModels';
import { Synchronization } from '../../../models/syncModels';
import { RegionAttributes } from '../../../models/xmlJsonModels';
import { SMILTicker } from '../../../models/mediaModels';
import { debug } from '../tools/generalTools';
import { isNil } from 'lodash';
import { SMILVideo } from '../../../models/mediaModels';
import FrontApplet from '@signageos/front-applet/es6/FrontApplet/FrontApplet';
import { FilesManager } from '../../files/filesManager';
import { isConditionalExpExpired } from '../tools/conditionalTools';
import { stopTickerAnimation } from '../tools/tickerTools';
import { ExprTag } from '../../../enums/conditionalEnums';
import { SMILEnums } from '../../../enums/generalEnums';
import { IPlaylistCommon } from './IPlaylistCommon';

export class PlaylistCommon implements IPlaylistCommon {
	protected sos: FrontApplet;
	protected files: FilesManager;
	protected cancelFunction: boolean[] = [];
	protected currentlyPlaying: CurrentlyPlaying = {};
	protected promiseAwaiting: PromiseAwaiting = {};
	protected currentlyPlayingPriority: CurrentlyPlayingPriority = {};
	protected synchronization: Synchronization;

	constructor(sos: FrontApplet, files: FilesManager, options: any) {
		this.sos = sos;
		this.files = files;
		this.cancelFunction = options.cancelFunction;
		this.currentlyPlaying = options.currentlyPlaying;
		this.promiseAwaiting = options.promiseAwaiting;
		this.currentlyPlayingPriority = options.currentlyPlayingPriority;
		this.synchronization = options.synchronization;
	}

	// disables endless loop for media playing
	public disableLoop = (value: boolean) => {
		this.cancelFunction.push(value);
	};

	protected getCancelFunction = (): boolean => {
		return this.cancelFunction[this.cancelFunction.length - 1];
	};

	/**
	 * runs function given as parameter in endless loop
	 * @param fn - Function
	 * @param version - smil internal version of current playlist
	 * @param conditionalExpr
	 */
	protected runEndlessLoop = async (fn: Function, version: number = 0, conditionalExpr: string = '') => {
		while (
			!this.cancelFunction[version] &&
			(conditionalExpr === '' || !isConditionalExpExpired({ [ExprTag]: conditionalExpr }))
		) {
			try {
				await fn();
			} catch (err) {
				debug('Error: %O occurred during processing function %s', err, fn.name);
				throw err;
			}
		}
	};

	protected stopAllContent = async () => {
		for (let [, region] of Object.entries(this.currentlyPlaying)) {
			if (
				'regionInfo' in region &&
				region.regionInfo.regionName !== SMILEnums.defaultRegion &&
				region.regionInfo.regionName !== 'fullScreenTrigger'
			) {
				await this.cancelPreviousMedia(region.regionInfo);
			}
		}
	};

	/**
	 * determines which function to use to cancel previous content
	 * @param regionInfo - information about region when current video belongs to
	 */
	protected cancelPreviousMedia = async (regionInfo: RegionAttributes) => {
		debug(
			'Cancelling media in region: %s with tag: %s',
			regionInfo.regionName,
			this.currentlyPlaying[regionInfo.regionName]?.media,
		);
		switch (this.currentlyPlaying[regionInfo.regionName]?.media) {
			case 'video':
				await this.cancelPreviousVideo(regionInfo);
				break;
			case 'html':
				await this.cancelPreviousHtmlElement(regionInfo);
				break;
			case 'ticker':
				await this.cancelPreviousTicker(regionInfo);
			default:
				debug('Element not supported for cancellation');
				break;
		}
	};

	/**
	 * sets element which played in current region before currently playing element invisible ( image, widget, video )
	 * @param regionInfo - information about region when current video belongs to
	 */
	private cancelPreviousHtmlElement = async (regionInfo: RegionAttributes) => {
		try {
			debug('previous html element playing: %O', this.currentlyPlaying[regionInfo.regionName]);
			if (isNil(this.currentlyPlaying[regionInfo.regionName])) {
				debug('html element was already cancelled');
				return;
			}
			const element = <HTMLImageElement>document.getElementById(this.currentlyPlaying[regionInfo.regionName].id);
			element.style.visibility = 'hidden';

			// previous widget was cancelled, remove src to improve playback performance
			if (element.id.indexOf('ref') > -1) {
				element.src = '';
			}

			this.currentlyPlaying[regionInfo.regionName].player = 'stop';
			this.currentlyPlaying[regionInfo.regionName].playing = false;
		} catch (err) {
			await this.cancelPreviousVideo(regionInfo);
		}
	};

	private cancelPreviousTicker = async (regionInfo: RegionAttributes) => {
		try {
			stopTickerAnimation(this.currentlyPlaying[regionInfo.regionName] as SMILTicker);
			this.currentlyPlaying[regionInfo.regionName].player = 'stop';
			this.currentlyPlaying[regionInfo.regionName].playing = false;
		} catch (err) {
			debug('error during ticker cancellation: %O', err);
		}
	};

	/**
	 * removes video from DOM which played in current region before currently playing element ( image, widget or video )
	 * @param regionInfo - information about region when current video belongs to
	 */
	private cancelPreviousVideo = async (regionInfo: RegionAttributes) => {
		try {
			debug('previous video playing: %O', this.currentlyPlaying[regionInfo.regionName]);
			if (isNil(this.currentlyPlaying[regionInfo.regionName])) {
				debug('video was already cancelled');
				return;
			}

			this.currentlyPlaying[regionInfo.regionName].player = 'stop';

			const video = <SMILVideo>this.currentlyPlaying[regionInfo.regionName];
			const sosVideoObject = isNil(video.isStream) ? this.sos.video : this.sos.stream;
			const videoElement = isNil(video.isStream) ? 'video' : 'stream';
			const elementUrl = isNil(video.isStream) ? video.localFilePath : video.src;

			let localRegionInfo = video.regionInfo;
			// cancelling trigger, have to find correct nested region
			if (localRegionInfo.regionName !== regionInfo.regionName) {
				localRegionInfo.region.forEach((nestedRegion: RegionAttributes) => {
					if (nestedRegion.regionName === regionInfo.regionName) {
						localRegionInfo = nestedRegion;
					}
				});
			}

			await sosVideoObject.stop(
				elementUrl,
				localRegionInfo.left,
				localRegionInfo.top,
				localRegionInfo.width,
				localRegionInfo.height,
			);
			video.playing = false;
			debug(`previous ${videoElement} stopped`);
		} catch (err) {
			debug('error during video cancellation: %O', err);
		}
	};
}
