import * as chai from 'chai';
import { mockSMILFileParsed234 } from '../../mocks/playlistMock/mock234';
import { mockSMILFileTriggers } from '../../mocks/playlistMock/mockTriggers';
import { mockSMILFileTriggersNoTopLeft } from '../../mocks/playlistMock/mockTriggersNoTopLeft';
import {
	mockParsedNestedRegion,
	mockParsed234Layout,
	mockParsed234Region,
	mockParsedNestedRegionNoTopLeft,
} from '../../mocks/playlistMock/mockRegions';
import { SMILScheduleEnum } from '../../../src/enums/scheduleEnums';
import {
	checkSlowDevice,
	computeSyncIndex,
	extractAdditionalInfo,
	generateBackupImagePlaylist,
	generateElementId,
	generateParentId,
	getConfigBoolean,
	getConfigString,
	getDefaultVideoParams,
	getIndexOfPlayingMedia,
	getLastArrayItem,
	getNextElementToPlay,
	getRegionInfo,
	getStringToIntDefault,
	orderJsonObject,
	processRandomPlayMode,
	removeDigits,
	removeLastArrayItem,
	removeNestedProperties,
	removeWhitespace,
	sleep,
} from '../../../src/components/playlist/tools/generalTools';
import { extractDayInfo } from '../../../src/components/playlist/tools/wallclockTools';
import {
	areAllWallclocksPermanentlyExpired,
	setDefaultAwait,
	setElementDuration,
	findDuration,
} from '../../../src/components/playlist/tools/scheduleTools';
import { PlaylistElement } from '../../../src/models/playlistModels';
import { CurrentlyPlayingRegion } from '../../../src/models/playlistModels';
import { RegionsObject } from '../../../src/models/xmlJsonModels';

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
			let response = getIndexOfPlayingMedia(currentlyPlaying as unknown as CurrentlyPlayingRegion[]);
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
			response = getIndexOfPlayingMedia(currentlyPlaying as unknown as CurrentlyPlayingRegion[]);
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
			response = getIndexOfPlayingMedia(currentlyPlaying as unknown as CurrentlyPlayingRegion[]);
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
			response = getIndexOfPlayingMedia(currentlyPlaying as unknown as CurrentlyPlayingRegion[]);
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
			response = getIndexOfPlayingMedia(currentlyPlayingEmpty as unknown as CurrentlyPlayingRegion[]);
			expect(response).to.be.equal(-1);
		});
	});

	describe('Playlist tools component generateParentId tests', () => {
		const testTagNames = ['seq', 'par', 'priorityClass', 'excl', 'Something'];

		const testObjects = [{ test: 13 }, { testing: 13 }, { test: 15 }, { test: 'asdadww' }, { test: true }];

		const parentIds = [
			'seq-50af0f3e4b3e765352ec6cba149db5f7',
			'par-7e12fe876abb29990a9195aeeeb846c6',
			'priorityClass-102bbcdc5b67ed8dc19af2bb0bb7b9ce',
			'excl-0b3510264759cb397ccca49b226355f8',
			'Something-2dc079c76f9e9d96e381878e30045dfd',
		];

		testTagNames.forEach((tagName, i) => {
			it(`should return '${parentIds[i]}' for tag '${tagName}'`, () => {
				let response = generateParentId(tagName, testObjects[i] as PlaylistElement);
				expect(response).to.be.equal(parentIds[i]);
			});
		});
	});

	describe('Playlist tools component getLastArrayItem tests', () => {
		const testArrays = [[1, 2, 3, 4], [5], [1, 'testing'], [1, true]];

		const lastElements = [4, 5, 'testing', true];

		testArrays.forEach((arr, i) => {
			it(`should return '${lastElements[i]}' for [${arr}]`, () => {
				let response = getLastArrayItem(arr);
				expect(response).to.be.equal(lastElements[i]);
			});
		});
	});

	describe('Playlist tools component getRegionInfo tests', () => {
		it('Should return default region for non-existing region name', () => {
			const response = getRegionInfo(mockSMILFileParsed234 as unknown as RegionsObject, 'InvalidRegionName');
			expect(response).to.eql(mockParsed234Layout);
		});

		it('Should return correct region for existing region name', () => {
			const response = getRegionInfo(mockSMILFileParsed234 as unknown as RegionsObject, 'video');
			expect(response).to.eql(mockParsed234Region);
		});

		it('Should return correct region values for nested regions', () => {
			const response = getRegionInfo(mockSMILFileTriggers as unknown as RegionsObject, 'video');
			expect(response).to.eql(mockParsedNestedRegion);
		});

		it('Should return correct region values for nested regions without top and left specified', () => {
			const response = getRegionInfo(mockSMILFileTriggersNoTopLeft as unknown as RegionsObject, 'video');
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
		const testStrings = ['aaaa', '', '14', '99999', '50s', 'NaN'];

		const intValues = [0, 0, 14, 99999, 50, 0];

		testStrings.forEach((str, i) => {
			it(`should return ${intValues[i]} for '${str}'`, () => {
				const response = getStringToIntDefault(str);
				expect(response).to.be.equal(intValues[i]);
			});
		});
	});

	describe('Playlist tools component setDefaultAwait tests', () => {
		const testSchedules = [
			[
				{
					begin: 'wallclock(2030-01-01T09:00)',
					end: 'wallclock(2030-12-01T12:00)',
					repeatCount: '1',
					video: [],
				},
				{
					begin: 'wallclock(2020-07-16T12:00)',
					end: 'wallclock(2020-07-17T19:00)',
					repeatCount: '1',
					img: [],
				},
			],
			[
				{
					begin: 'wallclock(2020-01-01T09:00)',
					end: 'wallclock(2020-12-01T12:00)',
					repeatCount: '1',
					video: [],
				},
				{
					begin: 'wallclock(2020-07-16T12:00)',
					end: 'wallclock(2025-07-17T19:00)',
					repeatCount: '1',
					img: [],
				},
			],
			[
				{
					begin: 'wallclock(2030-01-01T09:00)',
					end: 'wallclock(2030-12-01T12:00)',
					repeatCount: '1',
					video: [],
				},
				{
					begin: 'wallclock(2030-07-16T12:00)',
					end: 'wallclock(2030-07-17T19:00)',
					repeatCount: '1',
					img: [],
				},
			],
			[
				{
					begin: 'wallclock(2022-01-01T09:00)',
					end: 'wallclock(2022-12-01T12:00)',
					repeatCount: '1',
					video: [],
				},
				{
					begin: 'wallclock(2020-07-16T12:00)',
					end: 'wallclock(2035-12-17T19:00)',
					repeatCount: '1',
					img: [],
				},
			],
		];

		const awaitTimes = [SMILScheduleEnum.defaultAwait, SMILScheduleEnum.defaultAwait, SMILScheduleEnum.defaultAwait, 0];

		testSchedules.forEach((schedule, i) => {
			it(`should return ${awaitTimes[i]} for schedule set ${i}`, () => {
				const response = setDefaultAwait(schedule);
				expect(response).to.be.equal(awaitTimes[i]);
			});
		});

		it('should return playImmediately for element with no begin and no expr', () => {
			const elements = [
				{ dur: '5s', video: [] },
			];
			expect(setDefaultAwait(elements as PlaylistElement[])).to.be.equal(SMILScheduleEnum.playImmediately);
		});

		it('should return playImmediately when bare element follows expired wallclock', () => {
			const elements = [
				{
					begin: 'wallclock(2020-01-01T09:00)',
					end: 'wallclock(2020-06-01T12:00)',
					repeatCount: '1',
					video: [],
				},
				{ dur: '5s', img: [] },
			];
			expect(setDefaultAwait(elements as PlaylistElement[])).to.be.equal(SMILScheduleEnum.playImmediately);
		});

		it('should return playImmediately for active wallclock with active conditional expr', () => {
			const elements = [
				{
					begin: 'wallclock(2020-01-01T09:00)',
					end: 'wallclock(2035-12-01T12:00)',
					expr: "adapi-compare(adapi-date(),'2030-01-01T00:00:00')<0",
					video: [],
				},
			];
			expect(setDefaultAwait(elements as PlaylistElement[])).to.be.equal(SMILScheduleEnum.playImmediately);
		});

		it('should return defaultAwait for active wallclock with expired conditional expr', () => {
			const elements = [
				{
					begin: 'wallclock(2020-01-01T09:00)',
					end: 'wallclock(2035-12-01T12:00)',
					expr: "adapi-compare(adapi-date(),'2010-01-01T00:00:00')<0",
					video: [],
				},
			];
			expect(setDefaultAwait(elements as PlaylistElement[])).to.be.equal(SMILScheduleEnum.defaultAwait);
		});

		it('should return playImmediately for expr-only element (no wallclock) with active expr', () => {
			const elements = [
				{
					expr: "adapi-compare(adapi-date(),'2030-01-01T00:00:00')<0",
					video: [],
				},
			];
			expect(setDefaultAwait(elements as PlaylistElement[])).to.be.equal(SMILScheduleEnum.playImmediately);
		});

		it('should return defaultAwait for expr-only element (no wallclock) with expired expr', () => {
			const elements = [
				{
					expr: "adapi-compare(adapi-date(),'2010-01-01T00:00:00')<0",
					video: [],
				},
			];
			expect(setDefaultAwait(elements as PlaylistElement[])).to.be.equal(SMILScheduleEnum.defaultAwait);
		});

		it('should return defaultAwait for single element with all-expired wallclock', () => {
			const elements = [
				{
					begin: 'wallclock(2020-01-01T09:00)',
					end: 'wallclock(2020-06-01T12:00)',
					repeatCount: '1',
					video: [],
				},
			];
			expect(setDefaultAwait(elements as PlaylistElement[])).to.be.equal(SMILScheduleEnum.defaultAwait);
		});
	});

	describe('Playlist tools component setDuration', () => {
		const durationStrings = [`999`, `indefinite`, 'asdmaskd', 'Nan', '200', undefined];
		const duration = [999000, Number.MAX_SAFE_INTEGER, 5000, 5000, 200000, 5000];

		durationStrings.forEach((str, i) => {
			it(`should return ${duration[i]} for '${str}'`, () => {
				const response = setElementDuration(<string>str);
				expect(response).to.be.equal(duration[i]);
			});
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
				regionInfo: {
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

			expect(testImage.regionInfo).to.have.property('fit');
		});
	});

	describe('Playlist tools component extractDayInfo', () => {
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

		testingStrings.forEach((str, i) => {
			it(`should parse '${str}' correctly`, () => {
				const { timeRecord, dayInfo } = extractDayInfo(str);
				expect(timeRecord).to.be.equal(responses[i].timeRecord);
				expect(dayInfo).to.be.equal(responses[i].dayInfo);
			});
		});
	});

	describe('Playlist tools component findDuration', () => {
		const testingObjects = [
			{
				seq: {
					begin: 'trigger3',
					dur: 'duration',
					video6: {
						src: 'https://demo.signageos.io/smil/zones/files/video_3.mp4',
						id: 'annons1',
						fit: 'hidden',
						region: 'video',
						param: { name: 'cacheControl', value: 'auto' },
					},
				},
			},
			{
				par: {
					begin: 'trigger3',
					dur: '11s',
					video6: {
						src: 'https://demo.signageos.io/smil/zones/files/video_3.mp4',
						id: 'annons1',
						fit: 'hidden',
						region: 'video',
						param: { name: 'cacheControl', value: 'auto' },
					},
				},
			},
			{
				excl: {
					priorityClass: {
						seq: {
							begin: 'trigger3',
							dur: '888',
							video6: {
								src: 'https://demo.signageos.io/smil/zones/files/video_3.mp4',
								id: 'annons1',
								fit: 'hidden',
								region: 'video',
								param: { name: 'cacheControl', value: 'auto' },
							},
						},
					},
				},
			},
			{
				excl: {
					priorityClass: {
						peer: 'none',
						par: {
							begin: 'trigger3',
							video6: {
								src: 'https://demo.signageos.io/smil/zones/files/video_3.mp4',
								id: 'annons1',
								fit: 'hidden',
								region: 'video',
								param: { name: 'cacheControl', value: 'auto' },
							},
						},
					},
				},
			},
		];

		const expectedDurations = ['duration', '11s', '888', undefined];

		testingObjects.forEach((obj, i) => {
			it(`should return '${expectedDurations[i]}' for test object ${i}`, () => {
				const duration = findDuration(obj);
				expect(duration).to.be.equal(expectedDurations[i]);
			});
		});
	});

	describe('removeLastArrayItem', () => {
		it('should remove last item from array', () => {
			expect(removeLastArrayItem([1, 2, 3])).to.eql([1, 2]);
		});

		it('should return empty array for single-element array', () => {
			expect(removeLastArrayItem([1])).to.eql([]);
		});

		it('should return empty array for empty array', () => {
			expect(removeLastArrayItem([])).to.eql([]);
		});
	});

	describe('removeDigits', () => {
		it('should remove digits from string', () => {
			expect(removeDigits('img123')).to.be.equal('img');
		});

		it('should return same string without digits', () => {
			expect(removeDigits('video')).to.be.equal('video');
		});

		it('should return empty string for all-digit string', () => {
			expect(removeDigits('12345')).to.be.equal('');
		});
	});

	describe('removeWhitespace', () => {
		it('should remove spaces from string', () => {
			expect(removeWhitespace('hello world')).to.be.equal('helloworld');
		});

		it('should remove tabs and newlines', () => {
			expect(removeWhitespace('hello\t\nworld')).to.be.equal('helloworld');
		});

		it('should return same string without whitespace', () => {
			expect(removeWhitespace('helloworld')).to.be.equal('helloworld');
		});
	});

	describe('generateElementId', () => {
		it('should generate element id from filepath, region, and key', () => {
			const result = generateElementId('https://example.com/video.mp4', 'main', 'video');
			expect(result).to.include('main');
			expect(result).to.include('video');
		});

		it('should generate different ids for different regions', () => {
			const id1 = generateElementId('https://example.com/video.mp4', 'main', 'video');
			const id2 = generateElementId('https://example.com/video.mp4', 'sidebar', 'video');
			expect(id1).to.not.be.equal(id2);
		});
	});

	describe('checkSlowDevice', () => {
		it('should return true for Raspberry device', () => {
			expect(checkSlowDevice('RaspberryPi4')).to.be.equal(true);
		});

		it('should return true for LGE-55SM5C-BF-1 device', () => {
			expect(checkSlowDevice('LGE-55SM5C-BF-1-extra')).to.be.equal(true);
		});

		it('should return false for unknown device', () => {
			expect(checkSlowDevice('Samsung-Display')).to.be.equal(false);
		});

		it('should return false for empty string', () => {
			expect(checkSlowDevice('')).to.be.equal(false);
		});
	});

	describe('computeSyncIndex', () => {
		it('should initialize and increment sync index for new region', () => {
			const result = computeSyncIndex({}, 'main');
			expect(result['main']).to.be.equal(1);
		});

		it('should increment existing sync index', () => {
			const syncIndex = { main: 3 };
			const result = computeSyncIndex(syncIndex, 'main');
			expect(result['main']).to.be.equal(4);
		});

		it('should track independent indexes for different regions', () => {
			const syncIndex: { [key: string]: number } = {};
			computeSyncIndex(syncIndex, 'main');
			computeSyncIndex(syncIndex, 'main');
			computeSyncIndex(syncIndex, 'sidebar');
			expect(syncIndex['main']).to.be.equal(2);
			expect(syncIndex['sidebar']).to.be.equal(1);
		});
	});

	describe('generateBackupImagePlaylist', () => {
		it('should generate correct backup playlist structure', () => {
			const result = generateBackupImagePlaylist('https://example.com/backup.jpg', '5');
			expect(result.seq.repeatCount).to.be.equal('5');
			expect(result.seq.img.src).to.be.equal('https://example.com/backup.jpg');
			expect(result.seq.img.dur).to.be.equal('10');
			expect(result.seq.img.localFilePath).to.be.equal('');
		});
	});

	describe('getDefaultVideoParams', () => {
		it('should return correct default video params', () => {
			const result = getDefaultVideoParams();
			expect(result).to.eql(['', 0, 0, 0, 0, 'RTP']);
		});
	});

	describe('orderJsonObject', () => {
		it('should sort object keys alphabetically', () => {
			const result = orderJsonObject({ c: 3, a: 1, b: 2 });
			expect(Object.keys(result)).to.eql(['a', 'b', 'c']);
		});

		it('should preserve values', () => {
			const result = orderJsonObject({ z: 'last', a: 'first' });
			expect(result.a).to.be.equal('first');
			expect(result.z).to.be.equal('last');
		});
	});

	describe('removeNestedProperties', () => {
		it('should remove specified properties from object', () => {
			const obj = { keep: 'yes', remove: 'no', also: 'keep' } as unknown as PlaylistElement;
			removeNestedProperties(obj, ['remove']);
			expect(obj).to.not.have.property('remove');
			expect(obj).to.have.property('keep');
		});

		it('should remove nested properties', () => {
			const obj = {
				seq: {
					keep: 'yes',
					player: 'remove',
				},
			} as unknown as PlaylistElement;
			removeNestedProperties(obj, ['player']);
			expect((obj as any).seq).to.not.have.property('player');
			expect((obj as any).seq).to.have.property('keep');
		});
	});

	describe('getConfigString', () => {
		it('should return string value from config', () => {
			expect(getConfigString({ key: 'value' }, 'key')).to.be.equal('value');
		});

		it('should return undefined for non-string value', () => {
			expect(getConfigString({ key: 123 }, 'key')).to.be.equal(undefined);
		});

		it('should return undefined for missing key', () => {
			expect(getConfigString({ other: 'value' }, 'key')).to.be.equal(undefined);
		});

		it('should return undefined for undefined config', () => {
			expect(getConfigString(undefined, 'key')).to.be.equal(undefined);
		});
	});

	describe('getConfigBoolean', () => {
		it('should return boolean true from config', () => {
			expect(getConfigBoolean({ key: true }, 'key')).to.be.equal(true);
		});

		it('should return boolean false from config', () => {
			expect(getConfigBoolean({ key: false }, 'key')).to.be.equal(false);
		});

		it('should parse string "true"', () => {
			expect(getConfigBoolean({ key: 'true' }, 'key')).to.be.equal(true);
		});

		it('should parse string "TRUE"', () => {
			expect(getConfigBoolean({ key: 'TRUE' }, 'key')).to.be.equal(true);
		});

		it('should parse string "false"', () => {
			expect(getConfigBoolean({ key: 'false' }, 'key')).to.be.equal(false);
		});

		it('should return default for missing key', () => {
			expect(getConfigBoolean({ other: true }, 'key')).to.be.equal(false);
		});

		it('should return custom default for missing key', () => {
			expect(getConfigBoolean({ other: true }, 'key', true)).to.be.equal(true);
		});

		it('should return default for undefined config', () => {
			expect(getConfigBoolean(undefined, 'key')).to.be.equal(false);
		});

		it('should return default for numeric value', () => {
			expect(getConfigBoolean({ key: 1 }, 'key')).to.be.equal(false);
		});
	});

	describe('getNextElementToPlay', () => {
		it('should pick first playable element on first call', () => {
			const playlist = {
				playMode: 'one',
				img: { src: 'image1.jpg' },
				video: { src: 'video1.mp4' },
			};
			const randomPlaylistInfo = {};
			const result = getNextElementToPlay(playlist, randomPlaylistInfo, 'parent1');
			const keys = Object.keys(result).filter((k) => k !== 'playMode');
			expect(keys.length).to.be.equal(1);
		});

		it('should cycle through elements on subsequent calls', () => {
			const playlist = {
				playMode: 'one',
				img: { src: 'image1.jpg' },
				video: { src: 'video1.mp4' },
			};
			const randomPlaylistInfo = {};
			const result1 = getNextElementToPlay(playlist, randomPlaylistInfo, 'parent1');
			const result2 = getNextElementToPlay(playlist, randomPlaylistInfo, 'parent1');
			const keys1 = Object.keys(result1).filter((k) => k !== 'playMode');
			const keys2 = Object.keys(result2).filter((k) => k !== 'playMode');
			expect(keys1[0]).to.not.be.equal(keys2[0]);
		});

		it('should initialize randomPlaylistInfo for new parent', () => {
			const randomPlaylistInfo = {};
			getNextElementToPlay({ img: { src: 'a.jpg' } }, randomPlaylistInfo, 'newParent');
			expect(randomPlaylistInfo).to.have.property('newParent');
		});
	});

	describe('processRandomPlayMode', () => {
		it('should return shuffled object for random mode', () => {
			const playlist = { playMode: 'random', img: { src: 'a.jpg' }, video: { src: 'b.mp4' } };
			const result = processRandomPlayMode(playlist as any, {}, 'parent1');
			expect(result).to.have.property('img');
			expect(result).to.have.property('video');
		});

		it('should return single element for random_one mode', () => {
			const playlist = { playMode: 'random_one', img: { src: 'a.jpg' }, video: { src: 'b.mp4' } };
			const result = processRandomPlayMode(playlist as any, {}, 'parent1');
			const playableKeys = Object.keys(result).filter((k) => k !== 'playMode');
			expect(playableKeys.length).to.be.equal(1);
		});

		it('should return single element for one mode', () => {
			const playlist = { playMode: 'one', img: { src: 'a.jpg' }, video: { src: 'b.mp4' } };
			const result = processRandomPlayMode(playlist as any, {}, 'parent1');
			const playableKeys = Object.keys(result).filter((k) => k !== 'playMode');
			expect(playableKeys.length).to.be.equal(1);
		});

		it('should return original playlist for unsupported playMode', () => {
			const playlist = { playMode: 'unknown', img: { src: 'a.jpg' } };
			const result = processRandomPlayMode(playlist as any, {}, 'parent1');
			expect(result).to.eql(playlist);
		});

		it('should be case-insensitive for playMode', () => {
			const playlist = { playMode: 'RANDOM', img: { src: 'a.jpg' }, video: { src: 'b.mp4' } };
			const result = processRandomPlayMode(playlist as any, {}, 'parent1');
			expect(result).to.have.property('img');
			expect(result).to.have.property('video');
		});
	});

	describe('areAllWallclocksPermanentlyExpired', () => {
		it('should return true when all elements have expired one-time wallclocks', () => {
			const elements = [
				{
					begin: 'wallclock(2020-01-01T09:00)',
					end: 'wallclock(2020-06-01T12:00)',
				},
				{
					begin: 'wallclock(2021-03-01T08:00)',
					end: 'wallclock(2021-12-01T18:00)',
				},
			];
			expect(areAllWallclocksPermanentlyExpired(elements as PlaylistElement[])).to.be.equal(true);
		});

		it('should return false when mix of expired and future wallclocks', () => {
			const elements = [
				{
					begin: 'wallclock(2020-01-01T09:00)',
					end: 'wallclock(2020-06-01T12:00)',
				},
				{
					begin: 'wallclock(2030-01-01T09:00)',
					end: 'wallclock(2030-12-01T18:00)',
				},
			];
			expect(areAllWallclocksPermanentlyExpired(elements as PlaylistElement[])).to.be.equal(false);
		});

		it('should return false when element has no wallclock begin', () => {
			const elements = [
				{
					dur: '5s',
					img: { src: 'test.jpg' },
				},
			];
			expect(areAllWallclocksPermanentlyExpired(elements as PlaylistElement[])).to.be.equal(false);
		});

		it('should return false for empty array', () => {
			expect(areAllWallclocksPermanentlyExpired([])).to.be.equal(false);
		});

		it('should return false for recurring wallclock (P1D)', () => {
			const elements = [
				{
					begin: 'wallclock(R/2020-01-01T09:00/P1D)',
					end: 'wallclock(R/2020-01-01T18:00/P1D)',
				},
			];
			expect(areAllWallclocksPermanentlyExpired(elements as PlaylistElement[])).to.be.equal(false);
		});

		it('should return true for single expired one-time wallclock', () => {
			const elements = [
				{
					begin: 'wallclock(2020-01-01T09:00)',
					end: 'wallclock(2020-06-01T12:00)',
				},
			];
			expect(areAllWallclocksPermanentlyExpired(elements as PlaylistElement[])).to.be.equal(true);
		});

		it('should return false for mix of expired one-time and recurring wallclocks', () => {
			const elements = [
				{
					begin: 'wallclock(2020-01-01T09:00)',
					end: 'wallclock(2020-06-01T12:00)',
				},
				{
					begin: 'wallclock(R/2020-01-01T09:00/P1D)',
					end: 'wallclock(R/2020-01-01T18:00/P1D)',
				},
			];
			expect(areAllWallclocksPermanentlyExpired(elements as PlaylistElement[])).to.be.equal(false);
		});

		it('should return false when one element lacks wallclock begin among expired ones', () => {
			const elements = [
				{
					begin: 'wallclock(2020-01-01T09:00)',
					end: 'wallclock(2020-06-01T12:00)',
				},
				{
					dur: '5s',
					img: { src: 'test.jpg' },
				},
			];
			expect(areAllWallclocksPermanentlyExpired(elements as PlaylistElement[])).to.be.equal(false);
		});
	});
});
