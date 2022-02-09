import * as chai from 'chai';
import { mockSMILFileParsed234 } from '../../../src/components/playlist/mock/mock234';
import { mockSMILFileTriggers } from '../../../src/components/playlist/mock/mockTriggers';
import { mockSMILFileTriggersNoTopLeft } from '../../../src/components/playlist/mock/mockTriggersNoTopLeft';
import { mockParsedNestedRegion, mockParsed234Layout, mockParsed234Region, mockParsedNestedRegionNoTopLeft } from '../../../src/components/playlist/mock/mockRegions';
// import { Playlist } from '../../../src/components/playlist/playlist';
// import { Files } from '../../../src/components/files/files';
import { SMILScheduleEnum } from '../../../src/enums/scheduleEnums';
import {
	extractAdditionalInfo,
	generateParentId,
	getIndexOfPlayingMedia,
	getLastArrayItem, getRegionInfo, getStringToIntDefault, isNotPrefetchLoop, sleep,
} from '../../../src/components/playlist/tools/generalTools';
import { extractDayInfo } from '../../../src/components/playlist/tools/wallclockTools';
import { setDefaultAwait, setElementDuration, findDuration } from '../../../src/components/playlist/tools/scheduleTools';

const expect = chai.expect;

describe('Playlist tools component', () => {

	describe('Playlist tools component getIndexOfPlayingMedia tests', () => {
		it('Should return correct index', () => {

			let currentlyPlaying = [
				{
					player: {
						playing: true,
					},
				},
				{
					player: {
						playing: false,
					},
				},
				{
					player: {
						playing: false,
					},
				},
			];
			// @ts-ignore
			let response = getIndexOfPlayingMedia(currentlyPlaying);
			expect(response).to.be.equal(0);

			currentlyPlaying = [
				{
					player: {
						playing: false,
					},
				},
				{
					player: {
						playing: false,
					},
				},
				{
					player: {
						playing: true,
					},
				},
			];
			// @ts-ignore
			response = getIndexOfPlayingMedia(currentlyPlaying);
			expect(response).to.be.equal(2);

			currentlyPlaying = [
				{
					player: {
						playing: false,
					},
				},
				{
					player: {
						playing: false,
					},
				},
				{
					player: {
						playing: true,
					},
				},
			];
			// @ts-ignore
			response = getIndexOfPlayingMedia(currentlyPlaying);
			expect(response).to.be.equal(2);

			currentlyPlaying = [
				{
					player: {
						playing: false,
					},
				},
				{
					player: {
						playing: false,
					},
				},
				{
					player: {
						playing: false,
					},
				},
			];
			// @ts-ignore
			response = getIndexOfPlayingMedia(currentlyPlaying);
			expect(response).to.be.equal(-1);

			let currentlyPlayingEmpty = [
				{
					player: {
						playing: false,
					},
				},
				{
					player: {
						playing: false,
					},
				},
				{},
			];
			// @ts-ignore
			response = getIndexOfPlayingMedia(currentlyPlayingEmpty);
			expect(response).to.be.equal(-1);
		});
	});

	describe('Playlist tools component generateParentId tests', () => {
		it('Should return correct parentId', () => {
			const testTagNames = [
				'seq',
				'par',
				'priorityClass',
				'excl',
				'Something',
			];

			const testObjects = [
				{test: 13},
				{testing: 13},
				{test: 15},
				{test: 'asdadww'},
				{test: true},
			];

			const parentIds = [
				'seq-50af0f3e4b3e765352ec6cba149db5f7',
				'par-7e12fe876abb29990a9195aeeeb846c6',
				'priorityClass-102bbcdc5b67ed8dc19af2bb0bb7b9ce',
				'excl-0b3510264759cb397ccca49b226355f8',
				'Something-2dc079c76f9e9d96e381878e30045dfd',
			];
			for (let i = 0; i < testTagNames.length; i += 1) {
				let response = generateParentId(testTagNames[i], testObjects[i]);
				expect(response).to.be.equal(parentIds[i]);
			}
		});
	});

	describe('Playlist tools component getLastArrayItem tests', () => {
		it('Should return correct array element', () => {
			const testArrays = [
				[1, 2, 3, 4],
				[5],
				[1, 'testing'],
				[1, true],
			];

			const lastElements = [
				4,
				5,
				'testing',
				true,
			];

			for (let i = 0; i < testArrays.length; i += 1) {
				let response = getLastArrayItem(testArrays[i]);
				expect(response).to.be.equal(lastElements[i]);
			}
		});
	});

	describe('Playlist tools component getRegionInfo tests', () => {
		it('Should return default region for non-existing region name', () => {
			// @ts-ignore
			const response = getRegionInfo(mockSMILFileParsed234, 'InvalidRegionName');
			expect(response).to.eql(mockParsed234Layout);
		});

		it('Should return correct region for existing region name', () => {
			// @ts-ignore
			const response = getRegionInfo(mockSMILFileParsed234, 'video');
			expect(response).to.eql(mockParsed234Region);
		});

		it('Should return correct region values for nested regions', () => {
			// @ts-ignore
			const response = getRegionInfo(mockSMILFileTriggers, 'video');
			expect(response).to.eql(mockParsedNestedRegion);
		});

		it('Should return correct region values for nested regions without top and left specified', () => {
			// @ts-ignore
			const response = getRegionInfo(mockSMILFileTriggersNoTopLeft, 'video');
			expect(response).to.eql(mockParsedNestedRegionNoTopLeft);
		});
	});

	describe('Playlist tools component sleep tests', () => {
		it('Should return wait specified amount of time', async () => {
			const interval = 1000;
			const start = Date.now();
			await sleep(interval);
			const end = Date.now();
			const timeWaited = end - start;
			expect(Math.abs(interval - timeWaited)).to.be.lessThan(50);
		});
	});

	describe('Playlist tools component getStringToInt tests', () => {
		it('Should return correct values for tested strings', async () => {
			const testString = [
				'aaaa',
				'',
				'14',
				'99999',
				'50s',
				'NaN',
			];

			const intValues = [
				0,
				0,
				14,
				99999,
				50,
				0,
				0,
			];

			for (let i = 0; i < testString.length; i += 1) {
				const response = getStringToIntDefault(testString[i]);
				expect(response).to.be.equal(intValues[i]);
			}
		});
	});

	describe('Playlist tools component setDefaultAwait tests', () => {
		it('Should return correct value to await', async () => {
			const testSchedules = [[{
				'begin': 'wallclock(2030-01-01T09:00)',
				'end': 'wallclock(2030-12-01T12:00)',
				'repeatCount': '1',
				'video': [],
			}, {
				'begin': 'wallclock(2020-07-16T12:00)',
				'end': 'wallclock(2020-07-17T19:00)',
				'repeatCount': '1',
				'img': [],
			}], [{
				'begin': 'wallclock(2020-01-01T09:00)',
				'end': 'wallclock(2020-12-01T12:00)',
				'repeatCount': '1',
				'video': [],
			}, {
				'begin': 'wallclock(2020-07-16T12:00)',
				'end': 'wallclock(2025-07-17T19:00)',
				'repeatCount': '1',
				'img': [],
			}], [{
				'begin': 'wallclock(2030-01-01T09:00)',
				'end': 'wallclock(2030-12-01T12:00)',
				'repeatCount': '1',
				'video': [],
			}, {
				'begin': 'wallclock(2030-07-16T12:00)',
				'end': 'wallclock(2030-07-17T19:00)',
				'repeatCount': '1',
				'img': [],
			}], [{
				'begin': 'wallclock(2022-01-01T09:00)',
				'end': 'wallclock(2022-12-01T12:00)',
				'repeatCount': '1',
				'video': [],
			}, {
				'begin': 'wallclock(2020-07-16T12:00)',
				'end': 'wallclock(2025-12-17T19:00)',
				'repeatCount': '1',
				'img': [],
			}]];

			const awaitTimes = [
				SMILScheduleEnum.defaultAwait,
				0,
				SMILScheduleEnum.defaultAwait,
				0,
			];

			for (let i = 0; i < testSchedules.length; i += 1) {
				const response = setDefaultAwait(testSchedules[i]);
				expect(response).to.be.equal(awaitTimes[i]);
			}
		});
	});

	// describe('Playlist tools component runEndlessLoop, disableLoop tests', () => {
	// 	it('Should stop endless loop after given amount of time', async () => {
	// 		const sos: any = {
	// 			fileSystem: 'notSet',
	// 			video: 'notSet',
	// 			management: 'notSet',
	// 			hardware: 'notSet',
	// 		};
	// 		const files = new Files(sos);
	// 		const playlist = new Playlist(sos, files);
	// 		const interval = 1000;
	// 		const start = Date.now();
	// 		await playlist.runEndlessLoop(async () => {
	// 			await sleep(interval);
	// 			playlist.disableLoop(true);
	// 		});
	// 		const end = Date.now();
	// 		const timeWaited = end - start;
	// 		expect(Math.abs(interval - timeWaited)).to.be.lessThan(50);
	// 	});
	// });

	describe('Playlist tools component setDuration', () => {
		it('Should return correct duration for various inputs', async () => {
			const durationStrings = [
				`999`,
				`indefinite`,
				'asdmaskd',
				'Nan',
				'200',
				undefined,
			];
			const duration = [
				999000,
				999999,
				5000,
				5000,
				200000,
				5000,
			];

			for (let i = 0; i < durationStrings.length; i += 1) {
				const response = setElementDuration(<string> durationStrings[i]);
				expect(response).to.be.equal(duration[i]);
			}
		});
	});

	describe('Playlist tools component extractAdditionalInfo', () => {
		it('Should return correct values for additional parameters', async () => {
			let testImage: any = {
				src: 'http://butikstv.centrumkanalen.com/play/media/filmer/likabehandlingsdag2020.mp4',
				region: 'video',
				dur: '20',
				localFilePath: 'localFilePath',
				playing: false,
				fit: 'fill',
				regionInfo : {
					regionName: 'video',
					left: 0,
					top: 0,
					width: 0,
					height: 0,
					'z-index': 1,
					fit: 'fill',
				},
			};

			testImage = extractAdditionalInfo(testImage);

			expect(testImage.regionInfo.hasOwnProperty('fit')).to.be.equal(true);
		});
	});

	describe('Playlist tools component isNotPrefetchLoop', () => {
		it('Should detect infinite loops correctly', async () => {
			let testObject: any = {
				seq: [{
					dur: '60s',
				}, {
					prefetch: [{
						src: 'http://butikstv.centrumkanalen.com/play/render/widgets/ebbapettersson/top/top.wgt',
					}, {
						src: 'http://butikstv.centrumkanalen.com/play/render/widgets/ebbapettersson/vasttrafik/vasttrafik_news.wgt',
					}, {
						src: 'http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbalunch.png',
					}, {
						src: 'http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbaical.png',
					}],
				}],
			};

			let response = isNotPrefetchLoop(testObject);
			expect(response).to.be.equal(false);

			testObject = {
				par: [{
					dur: '60s',
				}, {
					prefetch: [{
						src: 'http://butikstv.centrumkanalen.com/play/render/widgets/ebbapettersson/top/top.wgt',
					}, {
						src: 'http://butikstv.centrumkanalen.com/play/render/widgets/ebbapettersson/vasttrafik/vasttrafik_news.wgt',
					}, {
						src: 'http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbalunch.png',
					}, {
						src: 'http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbaical.png',
					}],
				}],
			};

			response = isNotPrefetchLoop(testObject);
			expect(response).to.be.equal(false);

			testObject = {
				seq: {
					begin: '0',
					dur: 'indefinite',
					ref: {
						dur: 'indefinite',
						src: 'adapi:blankScreen',
					},
				},
			};

			response = isNotPrefetchLoop(testObject);
			expect(response).to.be.equal(false);

			testObject = {
				seq: {
					repeatCount: 'indefinite',
					img: {
						src: 'http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbaical.png',
						region: 'widget14',
						dur: '60s',
						param: {
							name: 'cacheControl',
							value: 'onlyIfCached',
						},
					},
				},
			};

			response = isNotPrefetchLoop(testObject);
			expect(response).to.be.equal(true);

		});
	});

	describe('Playlist tools component extractDayInfo', () => {
		it('Should parse time string correctly', async () => {
			const testingStrings = [
				'2011-01-01T07:00:00',
				'2011-01-01+w3T07:00:00',
				'2011-01-01-w4T07:00:00',
				'2022-01-01T22:00:00',
			];

			const responses = [
				{
					timeRecord: '2011-01-01T07:00:00',
					dayInfo: '',
				},
				{
					timeRecord: '2011-01-01T07:00:00',
					dayInfo: '+w3',
				},
				{
					timeRecord: '2011-01-01T07:00:00',
					dayInfo: '-w4',
				},
				{
					timeRecord: '2022-01-01T22:00:00',
					dayInfo: '',
				},
			];

			for (let i = 0; i < testingStrings.length; i += 1) {
				const {timeRecord, dayInfo} = extractDayInfo(testingStrings[i]);
				expect(timeRecord).to.be.equal(responses[i].timeRecord);
				expect(dayInfo).to.be.equal(responses[i].dayInfo);
			}
		});
	});

	describe('Playlist tools component findDuration', () => {
		it('Should find duration in nested object', async () => {
			const testingObjects = [
				{
					seq: {
						begin: "trigger3",
						dur: "duration",
						video6: {
							src: "https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/zones/files/video_3.mp4",
							id: "annons1",
							fit: "hidden",
							region: "video",
							param: {name: "cacheControl", value: "auto"},
						},
					},
				},
				{
					par: {
						begin: "trigger3",
						dur: "11s",
						video6: {
							src: "https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/zones/files/video_3.mp4",
							id: "annons1",
							fit: "hidden",
							region: "video",
							param: {name: "cacheControl", value: "auto"},
						},
					},
				},
				{
					excl: {
						priorityClass: {
							seq: {
								begin: "trigger3",
								dur: "888",
								video6: {
									src: "https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/zones/files/video_3.mp4",
									id: "annons1",
									fit: "hidden",
									region: "video",
									param: {name: "cacheControl", value: "auto"},
								},
							},
						},
					},
				},
				{
					excl: {
						priorityClass: {
							peer: "none",
							par: {
								begin: "trigger3",
								video6: {
									src: "https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/zones/files/video_3.mp4",
									id: "annons1",
									fit: "hidden",
									region: "video",
									param: {name: "cacheControl", value: "auto"},
								},
							},
						},
					},
				},
			];

			const responses = [
				'duration',
				'11s',
				'888',
				undefined,
			];

			for (let i = 0; i < testingObjects.length; i += 1) {
				const duration = findDuration(testingObjects[i]);
				expect(duration).to.be.equal(responses[i]);
			}
		});
	});
});
