import * as chai from 'chai';
import moment from 'moment';
import isNil = require('lodash/isNil');
import { getRegionInfo, sleep, runEndlessLoop, disableLoop, parseSmilSchedule, extractDayInfo } from '../../../src/components/playlist/tools';
import { formatDate, formatWeekDate, computeWaitInteral } from '../../testTools/testTools';
import { mockSMILFileParsed234 } from '../../../src/components/playlist/mock/mock234';

const expect = chai.expect;

describe('Playlist tools component', () => {

	describe('Playlist tools component getRegionInfo tests', () => {
		it('Should return default region for non-existing region name', () => {

			let expectedRegion: any = mockSMILFileParsed234.rootLayout;
			expectedRegion = {
				...expectedRegion,
				...(!isNil(expectedRegion.top) && { top: parseInt(expectedRegion.top)}),
				...(!isNil(expectedRegion.left) && { left: parseInt(expectedRegion.left)}),
				width: parseInt(expectedRegion.width),
				height: parseInt(expectedRegion.height),
			};

			const response = getRegionInfo(mockSMILFileParsed234, 'InvalidRegionName');
			expect(response).to.eql(expectedRegion);
		});

		it('Should return correct region for existing region name', () => {

			let expectedRegion: any = mockSMILFileParsed234.region.video;
			expectedRegion = {
				...expectedRegion,
				...(!isNil(expectedRegion.top) && { top: parseInt(expectedRegion.top)}),
				...(!isNil(expectedRegion.left) && { left: parseInt(expectedRegion.left)}),
				width: parseInt(expectedRegion.width),
				height: parseInt(expectedRegion.height),
			};

			const response = getRegionInfo(mockSMILFileParsed234, 'video');
			expect(response).to.eql(expectedRegion);
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

	describe('Playlist tools component runEndlessLoop, disableLoop tests', () => {
		it('Should stop endless loop after given amount of time', async () => {
			const interval = 1000;
			const start = Date.now();
			await runEndlessLoop( async () => {
				await sleep(interval);
				disableLoop(true);
			});
			const end = Date.now();
			const timeWaited = end - start;
			expect(Math.abs(interval - timeWaited)).to.be.lessThan(50);
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
				const { timeRecord, dayInfo } = extractDayInfo(testingStrings[i]);
				expect(timeRecord).to.be.equal(responses[i].timeRecord);
				expect(dayInfo).to.be.equal(responses[i].dayInfo);
			}
		});
	});

	describe('Playlist tools component parseSmilSchedule tests', () => {
		it('Should return correct times for how long to wait and how long to play', async () => {
			// convert date to ISO format, remove milliseconds => format to this string wallclock(R/2011-01-01T07:00:00/P1D)
			let testStartString = `wallclock(R/${formatDate(moment())}/P1D)`;
			let testEndString = `wallclock(R/${formatDate(moment().add(4, 'hours'))}/P1D)`;
			let responseTimeObject = parseSmilSchedule(testStartString, testEndString);
			expect(Math.abs(responseTimeObject.timeToStart)).to.be.lessThan(1000);
			// parse 2011-01-01T07:00:00 from wallclock(R/2011-01-01T07:00:00/P1D)
			expect(responseTimeObject.timeToEnd).to.eql(moment(testEndString.split('/')[1]).valueOf());

			testStartString = `wallclock(R/${formatDate(moment().subtract(2, 'hours'))}/P1D)`;
			testEndString = `wallclock(R/${formatDate(moment().add(4, 'hours'))}/P1D)`;
			responseTimeObject = parseSmilSchedule(testStartString, testEndString);
			expect(Math.abs(responseTimeObject.timeToStart)).to.be.lessThan(1000);
			expect(responseTimeObject.timeToEnd).to.eql(moment(testEndString.split('/')[1]).valueOf());

			testStartString = `wallclock(R/${formatDate(moment().add(1, 'hours'))}/P1D)`;
			testEndString = `wallclock(R/${formatDate(moment().add(6, 'hours'))}/P1D)`;
			responseTimeObject = parseSmilSchedule(testStartString, testEndString);
			expect(Math.abs(3600000 - responseTimeObject.timeToStart)).to.be.lessThan(1000);
			expect(responseTimeObject.timeToEnd).to.eql(moment(testEndString.split('/')[1]).valueOf());

			testStartString = `wallclock(R/${formatDate(moment().add(1, 'day'))}/P1D)`;
			testEndString = `wallclock(R/${formatDate(moment().add(1, 'day').add(6, 'hours'))}/P1D)`;
			responseTimeObject = parseSmilSchedule(testStartString, testEndString);
			// schedule start for tommorow 24hours
			expect(Math.abs(86400000 - responseTimeObject.timeToStart)).to.be.lessThan(1000);
			expect(responseTimeObject.timeToEnd).to.eql(moment(testEndString.split('/')[1]).valueOf());

			testStartString = `wallclock(R/${formatDate(moment().subtract(7, 'hours'))}/P1D)`;
			testEndString = `wallclock(R/${formatDate(moment().subtract(4, 'hours'))}/P1D)`;
			responseTimeObject = parseSmilSchedule(testStartString, testEndString);
			// schedule start for tommorow 17hours
			expect(Math.abs(61200000 - responseTimeObject.timeToStart)).to.be.lessThan(1000);
			expect(responseTimeObject.timeToEnd).to.eql(moment(testEndString.split('/')[1]).add(1, 'day').valueOf());

			testStartString = `wallclock(R/${formatDate(moment().subtract(15, 'days').subtract(7, 'hours'))}/P1D)`;
			testEndString = `wallclock(R/${formatDate(moment().subtract(15, 'days').subtract(4, 'hours'))}/P1D)`;
			responseTimeObject = parseSmilSchedule(testStartString, testEndString);
			// schedule start for tommorow 17hours
			expect(Math.abs(61200000 - responseTimeObject.timeToStart)).to.be.lessThan(1000);
			expect(Math.abs(responseTimeObject.timeToEnd - moment().add(1, 'day').subtract(4, 'hours').valueOf())).to.be.lessThan(1000);

			testStartString = `wallclock(R/${formatDate(moment().subtract(15, 'days').add(7, 'hours'))}/P1D)`;
			testEndString = `wallclock(R/${formatDate(moment().subtract(15, 'days').add(12, 'hours'))}/P1D)`;
			responseTimeObject = parseSmilSchedule(testStartString, testEndString);
			// schedule start in 7 hours
			expect(Math.abs(25200000 - responseTimeObject.timeToStart)).to.be.lessThan(1000);
			expect(Math.abs(responseTimeObject.timeToEnd - moment().add(12, 'hours').valueOf())).to.be.lessThan(1000);

			// no endTime specified tomorrow start
			testStartString = `wallclock(R/${formatDate(moment().subtract(7, 'hours'))}/P1D)`;
			responseTimeObject = parseSmilSchedule(testStartString);
			// schedule start for tommorow 17hours
			expect(Math.abs(61200000 - responseTimeObject.timeToStart)).to.be.lessThan(1000);
			expect(responseTimeObject.timeToEnd).to.eql(moment('2100-01-01T00:00:00').valueOf());

			// no endTime specified in the future start start
			testStartString = `wallclock(R/${formatDate(moment().add(7, 'days'))}/P1D)`;
			responseTimeObject = parseSmilSchedule(testStartString);
			// schedule start in 7 days from now
			expect(Math.abs(604800000 - responseTimeObject.timeToStart)).to.be.lessThan(1000);
			expect(responseTimeObject.timeToEnd).to.eql(moment('2100-01-01T00:00:00').valueOf());

		});
		it('Should return correct times for how long to wait and how long to play - weekdays specified after', async () => {
			let mediaDuration = 4;
			let dayOfWeek = moment().isoWeekday() + 3;
			// convert date to ISO format, remove milliseconds => format to this string wallclock(R/2011-01-01+w3T07:00:00/P1D)
			let testStartString = formatWeekDate(`wallclock(R/${formatDate(moment())}/P1D)`, `+w${dayOfWeek}`);
			let testEndString = formatWeekDate(`wallclock(R/${formatDate(moment().add(mediaDuration, 'hours'))}/P1D)`, `+w${dayOfWeek}`);
			let responseTimeObject = parseSmilSchedule(testStartString, testEndString);
			// scheduled in 3 days
			expect(Math.abs(259199003 - responseTimeObject.timeToStart)).to.be.lessThan(1000);
			expect(Math.abs(moment().add(3, 'days').add(mediaDuration, 'hours').valueOf() - responseTimeObject.timeToEnd)).to.be.lessThan(1000);

			mediaDuration = 8;
			dayOfWeek = moment().isoWeekday() - 1;
			// convert date to ISO format, remove milliseconds => format to this string wallclock(R/2011-01-01+w3T07:00:00/P1D)
			testStartString = formatWeekDate(`wallclock(R/${formatDate(moment())}/P1D)`, `+w${dayOfWeek}`);
			testEndString = formatWeekDate(`wallclock(R/${formatDate(moment().add(mediaDuration, 'hours'))}/P1D)`, `+w${dayOfWeek}`);
			responseTimeObject = parseSmilSchedule(testStartString, testEndString);
			// scheduled in  days 6
			expect(Math.abs(518400000 - responseTimeObject.timeToStart)).to.be.lessThan(1000);
			expect(Math.abs(moment().add(6, 'days').add(mediaDuration, 'hours').valueOf() - responseTimeObject.timeToEnd)).to.be.lessThan(1000);

			mediaDuration = 8;
			dayOfWeek = moment().isoWeekday();
			// convert date to ISO format, remove milliseconds => format to this string wallclock(R/2011-01-01+w3T07:00:00/P1D)
			testStartString = formatWeekDate(`wallclock(R/${formatDate(moment())}/P1D)`, `+w${dayOfWeek}`);
			testEndString = formatWeekDate(`wallclock(R/${formatDate(moment().add(mediaDuration, 'hours'))}/P1D)`, `+w${dayOfWeek}`);
			responseTimeObject = parseSmilSchedule(testStartString, testEndString);
			// scheduled immediately
			expect(Math.abs(responseTimeObject.timeToStart)).to.be.eql(0);
			expect(Math.abs(moment().add(mediaDuration, 'hours').valueOf() - responseTimeObject.timeToEnd)).to.be.lessThan(1000);

			mediaDuration = 8;
			dayOfWeek = Math.abs(moment().isoWeekday() - 5);
			let waitMilis = computeWaitInteral(moment().isoWeekday(), dayOfWeek);
			let waitDays = waitMilis / 86400000;
			// convert date to ISO format, remove milliseconds => format to this string wallclock(R/2011-01-01+w3T07:00:00/P1D)
			testStartString = formatWeekDate(`wallclock(R/${formatDate(moment())}/P1D)`, `+w${dayOfWeek}`);
			testEndString = formatWeekDate(`wallclock(R/${formatDate(moment().add(mediaDuration, 'hours'))}/P1D)`, `+w${dayOfWeek}`);
			responseTimeObject = parseSmilSchedule(testStartString, testEndString);
			expect(Math.abs(waitMilis - responseTimeObject.timeToStart)).to.be.lessThan(1000);
			expect(Math.abs(moment().add(waitDays, 'day').add(mediaDuration, 'hours').valueOf() - responseTimeObject.timeToEnd))
				.to.be.lessThan(1000);

			mediaDuration = 3;
			dayOfWeek = Math.abs(moment().isoWeekday() + 5);
			// convert date to ISO format, remove milliseconds => format to this string wallclock(R/2011-01-01+w3T07:00:00/P1D)
			testStartString = formatWeekDate(`wallclock(R/${formatDate(moment())}/P1D)`, `+w${dayOfWeek}`);
			testEndString = formatWeekDate(`wallclock(R/${formatDate(moment().add(mediaDuration, 'hours'))}/P1D)`, `+w${dayOfWeek}`);
			responseTimeObject = parseSmilSchedule(testStartString, testEndString);
			// scheduled in  days 5
			expect(Math.abs(432000000 - responseTimeObject.timeToStart)).to.be.lessThan(1000);
			expect(Math.abs(moment().add(5, 'days').add(mediaDuration, 'hours').valueOf() - responseTimeObject.timeToEnd)).to.be.lessThan(1000);

		});

		it('Should return correct times for how long to wait and how long to play - weekdays specified before', async () => {
			let mediaDuration = 4;
			let dayOfWeek = moment().isoWeekday();
			// convert date to ISO format, remove milliseconds => format to this string wallclock(R/2011-01-01-w3T07:00:00/P1D)
			let testStartString = formatWeekDate(`wallclock(R/${formatDate(moment().add(28, 'days'))}/P1D)`, `-w${dayOfWeek}`);
			let testEndString = formatWeekDate(`wallclock(R/${formatDate(moment().add(28, 'days').add(mediaDuration, 'hours'))}/P1D)`, `-w${dayOfWeek}`);
			let responseTimeObject = parseSmilSchedule(testStartString, testEndString);
			// should play immediately
			expect(responseTimeObject.timeToStart <= 0).to.be.eql(true);
			expect(Math.abs(moment().add(mediaDuration, 'hours').valueOf() - responseTimeObject.timeToEnd)).to.be.lessThan(1000);

			mediaDuration = 6;
			dayOfWeek = moment().isoWeekday() + 2;
			// convert date to ISO format, remove milliseconds => format to this string wallclock(R/2011-01-01-w3T07:00:00/P1D)
			testStartString = formatWeekDate(`wallclock(R/${formatDate(moment().add(28, 'days'))}/P1D)`, `-w${dayOfWeek}`);
			testEndString = formatWeekDate(`wallclock(R/${formatDate(moment().add(28, 'days').add(mediaDuration, 'hours'))}/P1D)`, `-w${dayOfWeek}`);
			responseTimeObject = parseSmilSchedule(testStartString, testEndString);
			// should play in 2 days
			expect(Math.abs(172800000 - responseTimeObject.timeToStart)).to.be.lessThan(1000);
			expect(Math.abs(moment().add(2, 'days').add(mediaDuration, 'hours').valueOf() - responseTimeObject.timeToEnd)).to.be.lessThan(1000);

			mediaDuration = 7;
			dayOfWeek = Math.abs(moment().isoWeekday() - 5);
			let waitMilis = computeWaitInteral(moment().isoWeekday(), dayOfWeek);
			let waitDays = waitMilis / 86400000;
			// convert date to ISO format, remove milliseconds => format to this string wallclock(R/2011-01-01-w3T07:00:00/P1D)
			testStartString = formatWeekDate(`wallclock(R/${formatDate(moment().add(28, 'days'))}/P1D)`, `-w${dayOfWeek}`);
			testEndString = formatWeekDate(`wallclock(R/${formatDate(moment().add(28, 'days').add(mediaDuration, 'hours'))}/P1D)`, `-w${dayOfWeek}`);
			responseTimeObject = parseSmilSchedule(testStartString, testEndString);
			expect(Math.abs(waitMilis - responseTimeObject.timeToStart)).to.be.lessThan(1000);
			expect(Math.abs(moment().add(waitDays, 'days').add(mediaDuration, 'hours').valueOf() - responseTimeObject.timeToEnd))
				.to.be.lessThan(1000);

			mediaDuration = 7;
			dayOfWeek = Math.abs(moment().isoWeekday() + 5);
			// convert date to ISO format, remove milliseconds => format to this string wallclock(R/2011-01-01-w3T07:00:00/P1D)
			testStartString = formatWeekDate(`wallclock(R/${formatDate(moment().add(28, 'days'))}/P1D)`, `-w${dayOfWeek}`);
			testEndString = formatWeekDate(`wallclock(R/${formatDate(moment().add(28, 'days').add(mediaDuration, 'hours'))}/P1D)`, `-w${dayOfWeek}`);
			responseTimeObject = parseSmilSchedule(testStartString, testEndString);
			// should play in 5 days
			expect(Math.abs(432000000 - responseTimeObject.timeToStart)).to.be.lessThan(1000);
			expect(Math.abs(moment().add(5, 'days').add(mediaDuration, 'hours').valueOf() - responseTimeObject.timeToEnd)).to.be.lessThan(1000);

		});
	});

});
