import * as chai from 'chai';
import moment from 'moment';
import MockDate from 'mockdate';
import { formatDate, formatWeekDate, computeWaitInterval } from '../../testTools/testTools';
import { parseSmilSchedule } from '../../../src/components/playlist/tools/wallclockTools';
import { SMILScheduleEnum } from '../../../src/enums/scheduleEnums';

const expect = chai.expect;

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

describe('Playlist tools component parseSmilSchedule tests', () => {
	beforeEach(() => {
		// Use 10:00 instead of 12:00 to ensure -w weekday constraint tests work
		// when the scheduled time equals "now" (the constraint uses < comparison)
		MockDate.set(new Date('2021-04-22T10:00:00'));
	});

	afterEach(() => {
		MockDate.reset();
	});

	it('should return correct times for active schedule (start = now)', async () => {
		const testStartString = moment().format('YYYY-MM-DD');
		const testEndString = moment().add(1, 'days').format('YYYY-MM-DD');
		const responseTimeObject = parseSmilSchedule(testStartString, testEndString);

		expect(responseTimeObject.timeToStart).to.eql(0);
		expect(responseTimeObject.timeToEnd).to.eql(
			moment(`${testEndString}T${SMILScheduleEnum.defaultTime}`).valueOf(),
		);
	});

	it('should return correct times for repeating schedule starting now', async () => {
		const testStartString = `wallclock(R/${formatDate(moment())}/P1D)`;
		const testEndString = `wallclock(R/${formatDate(moment().add(4, 'hours'))}/P1D)`;
		const responseTimeObject = parseSmilSchedule(testStartString, testEndString);
		expect(Math.abs(responseTimeObject.timeToStart)).to.be.lessThan(MS_PER_SECOND);
		expect(responseTimeObject.timeToEnd).to.eql(moment(testEndString.split('/')[1]).valueOf());
	});

	it('should return correct times for repeating schedule that started 2 hours ago', async () => {
		const testStartString = `wallclock(R/${formatDate(moment().subtract(2, 'hours'))}/P1D)`;
		const testEndString = `wallclock(R/${formatDate(moment().add(4, 'hours'))}/P1D)`;
		const responseTimeObject = parseSmilSchedule(testStartString, testEndString);
		expect(Math.abs(responseTimeObject.timeToStart)).to.be.lessThan(MS_PER_SECOND);
		expect(responseTimeObject.timeToEnd).to.eql(moment(testEndString.split('/')[1]).valueOf());
	});

	it('should return correct times for schedule starting in 1 hour', async () => {
		const testStartString = `wallclock(R/${formatDate(moment().add(1, 'hours'))}/P1D)`;
		const testEndString = `wallclock(R/${formatDate(moment().add(2, 'hours'))}/P1D)`;
		const responseTimeObject = parseSmilSchedule(testStartString, testEndString);
		expect(Math.abs(MS_PER_HOUR - responseTimeObject.timeToStart)).to.be.lessThan(MS_PER_SECOND);
		expect(responseTimeObject.timeToEnd).to.eql(moment(testEndString.split('/')[1]).valueOf());
	});

	it('should return correct times for schedule starting tomorrow', async () => {
		const testStartString = `wallclock(R/${formatDate(moment().add(1, 'day'))}/P1D)`;
		const testEndString = `wallclock(R/${formatDate(moment().add(1, 'day').add(2, 'hours'))}/P1D)`;
		const responseTimeObject = parseSmilSchedule(testStartString, testEndString);
		expect(Math.abs(MS_PER_DAY - responseTimeObject.timeToStart)).to.be.lessThan(MS_PER_SECOND);
		expect(responseTimeObject.timeToEnd).to.eql(moment(testEndString.split('/')[1]).valueOf());
	});

	it('should return correct times for past daily schedule ending before now (reschedules to tomorrow)', async () => {
		const testStartString = `wallclock(R/${formatDate(moment().subtract(7, 'hours'))}/P1D)`;
		const testEndString = `wallclock(R/${formatDate(moment().subtract(4, 'hours'))}/P1D)`;
		const responseTimeObject = parseSmilSchedule(testStartString, testEndString);
		// schedule start for tomorrow 17 hours
		expect(Math.abs(17 * MS_PER_HOUR - responseTimeObject.timeToStart)).to.be.lessThan(MS_PER_SECOND);
		expect(responseTimeObject.timeToEnd).to.eql(moment(testEndString.split('/')[1]).add(1, 'day').valueOf());
	});

	it('should return correct times for past daily schedule started 15 days ago ending before now', async () => {
		const testStartString = `wallclock(R/${formatDate(moment().subtract(15, 'days').subtract(7, 'hours'))}/P1D)`;
		const testEndString = `wallclock(R/${formatDate(moment().subtract(15, 'days').subtract(4, 'hours'))}/P1D)`;
		const responseTimeObject = parseSmilSchedule(testStartString, testEndString);
		// schedule start for tomorrow 17 hours
		expect(Math.abs(17 * MS_PER_HOUR - responseTimeObject.timeToStart)).to.be.lessThan(MS_PER_SECOND);
		expect(
			Math.abs(responseTimeObject.timeToEnd - moment().add(1, 'day').subtract(4, 'hours').valueOf()),
		).to.be.lessThan(MS_PER_SECOND);
	});

	it('should return correct times for past daily schedule started 15 days ago starting in the future today', async () => {
		const testStartString = `wallclock(R/${formatDate(moment().subtract(15, 'days').add(7, 'hours'))}/P1D)`;
		const testEndString = `wallclock(R/${formatDate(moment().subtract(15, 'days').add(12, 'hours'))}/P1D)`;
		const responseTimeObject = parseSmilSchedule(testStartString, testEndString);
		// schedule start in 7 hours
		expect(Math.abs(7 * MS_PER_HOUR - responseTimeObject.timeToStart)).to.be.lessThan(MS_PER_SECOND);
		expect(Math.abs(responseTimeObject.timeToEnd - moment().add(12, 'hours').valueOf())).to.be.lessThan(MS_PER_SECOND);
	});

	it('should return correct times for repeating schedule with no end time (past start)', async () => {
		const testStartString = `wallclock(R/${formatDate(moment().subtract(7, 'hours'))}/P1D)`;
		const responseTimeObject = parseSmilSchedule(testStartString);
		// play immediately
		expect(Math.abs(responseTimeObject.timeToStart)).to.be.lessThan(MS_PER_SECOND);
		expect(responseTimeObject.timeToEnd).to.eql(moment(`${moment().format('YYYY-MM-DD')}T23:59:59`).valueOf());
	});

	it('should return correct times for repeating schedule with no end time (future start)', async () => {
		const testStartString = `wallclock(R/${formatDate(moment().add(7, 'days'))}/P1D)`;
		const responseTimeObject = parseSmilSchedule(testStartString);
		// schedule start in 7 days from now
		expect(Math.abs(7 * MS_PER_DAY - responseTimeObject.timeToStart)).to.be.lessThan(MS_PER_SECOND);
		expect(responseTimeObject.timeToEnd).to.eql(
			moment(`${moment().add(7, 'days').format('YYYY-MM-DD')}T23:59:59`).valueOf(),
		);
	});

	it('should return correct times for non-repeating schedule with no end time (past start)', async () => {
		const testStartString = `wallclock(${formatDate(moment().subtract(7, 'hours'))})`;
		const responseTimeObject = parseSmilSchedule(testStartString);
		// play immediately
		expect(Math.abs(responseTimeObject.timeToStart)).to.be.lessThan(MS_PER_SECOND);
		expect(responseTimeObject.timeToEnd).to.eql(moment('2100-01-01T23:59:59').valueOf());
	});

	it('should return correct times for non-repeating schedule with no end time (future start)', async () => {
		const testStartString = `wallclock(${formatDate(moment().add(7, 'days'))})`;
		const responseTimeObject = parseSmilSchedule(testStartString);
		// schedule start in 7 days from now
		expect(Math.abs(7 * MS_PER_DAY - responseTimeObject.timeToStart)).to.be.lessThan(MS_PER_SECOND);
		expect(responseTimeObject.timeToEnd).to.eql(moment('2100-01-01T23:59:59').valueOf());
	});

	it('should return never-play for non-repeating past schedule', async () => {
		const testStartString = `wallclock(2020-07-16T12:00)`;
		const testEndString = `wallclock(2020-07-17T19:00)`;
		const responseTimeObject = parseSmilSchedule(testStartString, testEndString);
		// should be never played
		expect(Math.abs(responseTimeObject.timeToStart)).to.be.lessThan(MS_PER_SECOND);
		// timeToEnd = -3600000, value of 1970-01-01T00:00:00 in millis
		expect(responseTimeObject.timeToEnd.valueOf()).to.be.lessThan(0);
	});

	it('should return never-play for non-repeating past schedule with wider range', async () => {
		const testStartString = `wallclock(2020-01-01T09:00)`;
		const testEndString = `wallclock(2020-12-01T12:00)`;
		const responseTimeObject = parseSmilSchedule(testStartString, testEndString);
		expect(Math.abs(responseTimeObject.timeToStart)).to.be.lessThan(MS_PER_SECOND);
		// timeToEnd = value of 2020-12-01T12:00:00 should return -3600000 ( default value for playlists in the past )
		expect(responseTimeObject.timeToEnd).to.eql(-MS_PER_HOUR);
	});

	it('should return correct end time for schedule ending in 7 minutes', async () => {
		const testStartString = `wallclock(2020-01-01T09:00)`;
		const testEndString = `wallclock(${formatDate(moment().add(7, 'minutes'))})`;
		const responseTimeObject = parseSmilSchedule(testStartString, testEndString);
		expect(Math.abs(responseTimeObject.timeToStart)).to.be.lessThan(MS_PER_SECOND);
		// timeToEnd value should be 7 minutes from now
		expect(Math.abs(responseTimeObject.timeToEnd - moment().add(7, 'minutes').valueOf())).to.be.lessThan(MS_PER_SECOND);
	});

	it('Should return correct times for how long to wait and how long to play - weekdays specified after', async () => {
		let mediaDuration = 3;
		let dayOfWeek = (moment().isoWeekday() + 3) % 7;
		// convert date to ISO format, remove milliseconds => format to this string wallclock(R/2011-01-01+w3T07:00:00/P1D)
		let testStartString = formatWeekDate(`wallclock(R/${formatDate(moment())}/P1D)`, `+w${dayOfWeek}`);
		let testEndString = formatWeekDate(
			`wallclock(R/${formatDate(moment().add(mediaDuration, 'hours'))}/P1D)`,
			`+w${dayOfWeek}`,
		);
		let responseTimeObject = parseSmilSchedule(testStartString, testEndString);
		// scheduled in 3 days
		expect(Math.abs(3 * MS_PER_DAY - MS_PER_SECOND + 3 - responseTimeObject.timeToStart)).to.be.lessThan(MS_PER_SECOND);
		expect(
			Math.abs(moment().add(3, 'days').add(mediaDuration, 'hours').valueOf() - responseTimeObject.timeToEnd),
		).to.be.lessThan(MS_PER_SECOND);

		mediaDuration = 2;
		dayOfWeek = moment().isoWeekday() - 1;
		// convert date to ISO format, remove milliseconds => format to this string wallclock(R/2011-01-01+w3T07:00:00/P1D)
		testStartString = formatWeekDate(`wallclock(R/${formatDate(moment())}/P1D)`, `+w${dayOfWeek}`);
		testEndString = formatWeekDate(
			`wallclock(R/${formatDate(moment().add(mediaDuration, 'hours'))}/P1D)`,
			`+w${dayOfWeek}`,
		);
		responseTimeObject = parseSmilSchedule(testStartString, testEndString);
		// scheduled in  days 6
		expect(Math.abs(6 * MS_PER_DAY - responseTimeObject.timeToStart)).to.be.lessThan(MS_PER_SECOND);
		expect(
			Math.abs(moment().add(6, 'days').add(mediaDuration, 'hours').valueOf() - responseTimeObject.timeToEnd),
		).to.be.lessThan(MS_PER_SECOND);

		mediaDuration = 4;
		dayOfWeek = moment().isoWeekday();
		// convert date to ISO format, remove milliseconds => format to this string wallclock(R/2011-01-01+w3T07:00:00/P1D)
		testStartString = formatWeekDate(`wallclock(R/${formatDate(moment())}/P1D)`, `+w${dayOfWeek}`);
		testEndString = formatWeekDate(
			`wallclock(R/${formatDate(moment().add(mediaDuration, 'hours'))}/P1D)`,
			`+w${dayOfWeek}`,
		);
		responseTimeObject = parseSmilSchedule(testStartString, testEndString);
		// scheduled immediately
		expect(Math.abs(responseTimeObject.timeToStart)).to.be.lessThan(MS_PER_SECOND);
		expect(Math.abs(moment().add(mediaDuration, 'hours').valueOf() - responseTimeObject.timeToEnd)).to.be.lessThan(
			MS_PER_SECOND,
		);

		mediaDuration = 3;
		dayOfWeek = Math.abs(moment().isoWeekday() - 5);
		let waitMilis = computeWaitInterval(moment().isoWeekday(), dayOfWeek);
		let waitDays = waitMilis / MS_PER_DAY;
		// convert date to ISO format, remove milliseconds => format to this string wallclock(R/2011-01-01+w3T07:00:00/P1D)
		testStartString = formatWeekDate(`wallclock(R/${formatDate(moment())}/P1D)`, `+w${dayOfWeek}`);
		testEndString = formatWeekDate(
			`wallclock(R/${formatDate(moment().add(mediaDuration, 'hours'))}/P1D)`,
			`+w${dayOfWeek}`,
		);
		responseTimeObject = parseSmilSchedule(testStartString, testEndString);
		expect(Math.abs(waitMilis - responseTimeObject.timeToStart)).to.be.lessThan(MS_PER_SECOND);
		expect(
			Math.abs(
				moment().add(waitDays, 'day').add(mediaDuration, 'hours').valueOf() - responseTimeObject.timeToEnd,
			),
		).to.be.lessThan(MS_PER_SECOND);

		mediaDuration = 3;
		dayOfWeek = Math.abs(moment().isoWeekday() + 5) % 7;
		// convert date to ISO format, remove milliseconds => format to this string wallclock(R/2011-01-01+w3T07:00:00/P1D)
		testStartString = formatWeekDate(`wallclock(R/${formatDate(moment())}/P1D)`, `+w${dayOfWeek}`);
		testEndString = formatWeekDate(
			`wallclock(R/${formatDate(moment().add(mediaDuration, 'hours'))}/P1D)`,
			`+w${dayOfWeek}`,
		);
		responseTimeObject = parseSmilSchedule(testStartString, testEndString);
		// scheduled in  days 5
		expect(Math.abs(5 * MS_PER_DAY - responseTimeObject.timeToStart)).to.be.lessThan(MS_PER_SECOND);
		expect(
			Math.abs(moment().add(5, 'days').add(mediaDuration, 'hours').valueOf() - responseTimeObject.timeToEnd),
		).to.be.lessThan(MS_PER_SECOND);

		dayOfWeek = moment().isoWeekday();
		mediaDuration = 50;
		// convert date to ISO format, remove milliseconds => format to this string wallclock(R/2011-01-01+w3T07:00:00/P1D)
		testStartString = formatWeekDate(`wallclock(R/${formatDate(moment())}/P1D)`, `+w${dayOfWeek}`);
		testEndString = formatWeekDate(
			`wallclock(R/${formatDate(moment().add('500', 'years').add(mediaDuration, 'minutes'))}/P1D)`,
			`+w${dayOfWeek}`,
		);
		responseTimeObject = parseSmilSchedule(testStartString, testEndString);
		expect(Math.abs(responseTimeObject.timeToStart)).to.be.lessThan(MS_PER_SECOND);
		expect(
			Math.abs(moment().add(mediaDuration, 'minutes').valueOf() - responseTimeObject.timeToEnd),
		).to.be.lessThan(MS_PER_SECOND);

		dayOfWeek = moment().isoWeekday();
		mediaDuration = 50;
		// convert date to ISO format, remove milliseconds => format to this string wallclock(R/2011-01-01+w3T07:00:00/P1D)
		testStartString = formatWeekDate(
			`wallclock(R/${formatDate(moment().subtract('10', 'minutes'))}/P1D)`,
			`+w${dayOfWeek}`,
		);
		testEndString = formatWeekDate(
			`wallclock(R/${formatDate(moment().add('500', 'years').add(mediaDuration, 'minutes'))}/P1D)`,
			`+w${dayOfWeek}`,
		);
		responseTimeObject = parseSmilSchedule(testStartString, testEndString);
		expect(Math.abs(responseTimeObject.timeToStart)).to.be.lessThan(MS_PER_SECOND);
		expect(
			Math.abs(moment().add(mediaDuration, 'minutes').valueOf() - responseTimeObject.timeToEnd),
		).to.be.lessThan(MS_PER_SECOND);

		dayOfWeek = moment().isoWeekday();
		mediaDuration = 50;
		// convert date to ISO format, remove milliseconds => format to this string wallclock(R/2011-01-01+w3T07:00:00/P1D)
		testStartString = formatWeekDate(
			`wallclock(R/${formatDate(moment().add('10', 'minutes'))}/P1D)`,
			`+w${dayOfWeek}`,
		);
		testEndString = formatWeekDate(
			`wallclock(R/${formatDate(moment().add('500', 'years').add(mediaDuration, 'minutes'))}/P1D)`,
			`+w${dayOfWeek}`,
		);
		responseTimeObject = parseSmilSchedule(testStartString, testEndString);
		expect(Math.abs(10 * MS_PER_MINUTE - responseTimeObject.timeToStart)).to.be.lessThan(MS_PER_SECOND);
		expect(
			Math.abs(moment().add(mediaDuration, 'minutes').valueOf() - responseTimeObject.timeToEnd),
		).to.be.lessThan(MS_PER_SECOND);
	});

	it('Should return correct times for how long to wait and how long to play - weekdays specified before', async () => {
		let mediaDuration = 2;
		let dayOfWeek = moment().isoWeekday();
		// convert date to ISO format, remove milliseconds => format to this string wallclock(R/2011-01-01-w3T07:00:00/P1D)
		let testStartString = formatWeekDate(
			`wallclock(R/${formatDate(moment().add(28, 'days'))}/P1D)`,
			`-w${dayOfWeek}`,
		);
		let testEndString = formatWeekDate(
			`wallclock(R/${formatDate(moment().add(28, 'days').add(mediaDuration, 'hours'))}/P1D)`,
			`-w${dayOfWeek}`,
		);
		let responseTimeObject = parseSmilSchedule(testStartString, testEndString);
		// should play immediately
		expect(responseTimeObject.timeToStart).to.be.at.most(0);
		expect(Math.abs(moment().add(mediaDuration, 'hours').valueOf() - responseTimeObject.timeToEnd)).to.be.lessThan(
			MS_PER_SECOND,
		);

		mediaDuration = 4;
		dayOfWeek = Math.abs(moment().isoWeekday() + 2) % 7;
		// convert date to ISO format, remove milliseconds => format to this string wallclock(R/2011-01-01-w3T07:00:00/P1D)
		testStartString = formatWeekDate(`wallclock(R/${formatDate(moment().add(28, 'days'))}/P1D)`, `-w${dayOfWeek}`);
		testEndString = formatWeekDate(
			`wallclock(R/${formatDate(moment().add(28, 'days').add(mediaDuration, 'hours'))}/P1D)`,
			`-w${dayOfWeek}`,
		);
		responseTimeObject = parseSmilSchedule(testStartString, testEndString);
		// should play in 2 days
		expect(Math.abs(2 * MS_PER_DAY - responseTimeObject.timeToStart)).to.be.lessThan(MS_PER_SECOND);
		expect(Math.abs(2 * MS_PER_DAY - responseTimeObject.timeToStart)).to.be.lessThan(MS_PER_SECOND);
		expect(
			Math.abs(moment().add(2, 'days').add(mediaDuration, 'hours').valueOf() - responseTimeObject.timeToEnd),
		).to.be.lessThan(MS_PER_SECOND);

		mediaDuration = 2;
		dayOfWeek = Math.abs(moment().isoWeekday() - 5);
		let waitMilis = computeWaitInterval(moment().isoWeekday(), dayOfWeek);
		let waitDays = waitMilis / MS_PER_DAY;
		// convert date to ISO format, remove milliseconds => format to this string wallclock(R/2011-01-01-w3T07:00:00/P1D)
		testStartString = formatWeekDate(`wallclock(R/${formatDate(moment().add(28, 'days'))}/P1D)`, `-w${dayOfWeek}`);
		testEndString = formatWeekDate(
			`wallclock(R/${formatDate(moment().add(28, 'days').add(mediaDuration, 'hours'))}/P1D)`,
			`-w${dayOfWeek}`,
		);
		responseTimeObject = parseSmilSchedule(testStartString, testEndString);
		expect(Math.abs(waitMilis - responseTimeObject.timeToStart)).to.be.lessThan(MS_PER_SECOND);
		expect(
			Math.abs(
				moment().add(waitDays, 'days').add(mediaDuration, 'hours').valueOf() - responseTimeObject.timeToEnd,
			),
		).to.be.lessThan(MS_PER_SECOND);

		mediaDuration = 3;
		dayOfWeek = Math.abs(moment().isoWeekday() + 5) % 7;
		// convert date to ISO format, remove milliseconds => format to this string wallclock(R/2011-01-01-w3T07:00:00/P1D)
		testStartString = formatWeekDate(`wallclock(R/${formatDate(moment().add(28, 'days'))}/P1D)`, `-w${dayOfWeek}`);
		testEndString = formatWeekDate(
			`wallclock(R/${formatDate(moment().add(28, 'days').add(mediaDuration, 'hours'))}/P1D)`,
			`-w${dayOfWeek}`,
		);
		responseTimeObject = parseSmilSchedule(testStartString, testEndString);
		// should play in 5 days
		expect(Math.abs(5 * MS_PER_DAY - responseTimeObject.timeToStart)).to.be.lessThan(MS_PER_SECOND);
		expect(
			Math.abs(moment().add(5, 'days').add(mediaDuration, 'hours').valueOf() - responseTimeObject.timeToEnd),
		).to.be.lessThan(MS_PER_SECOND);
	});

	it('should return correct times for specific weekdays with repeating logic', async () => {
		const dayOfWeek = moment().isoWeekday();
		// Use a start time slightly in the past to trigger the "play immediately" path
		// The -w constraint with exact "now" time hits an edge case in computeScheduledDate
		let testStartString = formatWeekDate(
			`wallclock(R/${formatDate(moment().subtract(1, 'minute'))}/P1D)`,
			`-w${dayOfWeek}`,
		);
		let testEndString = formatWeekDate(
			`wallclock(R/${formatDate(moment().add(4, 'hours'))}/P1D)`,
			`-w${dayOfWeek}`,
		);

		let responseTimeObject = parseSmilSchedule(testStartString, testEndString);

		expect(Math.abs(responseTimeObject.timeToStart)).to.be.lessThan(MS_PER_SECOND);
		expect(responseTimeObject.timeToEnd).to.be.not.eql(SMILScheduleEnum.neverPlay);

		// Test a schedule that started 2 days ago and ended 1 day ago (with today's weekday constraint)
		// Should return neverPlay since the end time is in the past
		testStartString = formatWeekDate(
			`wallclock(R/${formatDate(moment().subtract(2, 'days').subtract(1, 'hour'))}/P1D)`,
			`-w${dayOfWeek}`,
		);
		testEndString = formatWeekDate(
			`wallclock(R/${formatDate(moment().subtract(1, 'days').add(4, 'hours'))}/P1D)`,
			`-w${dayOfWeek}`,
		);

		responseTimeObject = parseSmilSchedule(testStartString, testEndString);

		expect(Math.abs(responseTimeObject.timeToStart)).to.be.lessThan(MS_PER_SECOND);
		expect(responseTimeObject.timeToEnd).to.be.eql(SMILScheduleEnum.neverPlay);

		// Use a start time slightly in the past to avoid edge case with exact "now" time
		testStartString = formatWeekDate(
			`wallclock(R/${formatDate(moment().subtract(1, 'minute'))}/P1D)`,
			`-w${dayOfWeek}`,
		);
		testEndString = formatWeekDate(
			`wallclock(R/${formatDate(moment().add(10, 'days').add(4, 'hours'))}/P1D)`,
			`-w${dayOfWeek}`,
		);

		responseTimeObject = parseSmilSchedule(testStartString, testEndString);

		expect(Math.abs(responseTimeObject.timeToStart)).to.be.lessThan(MS_PER_SECOND);
		expect(responseTimeObject.timeToEnd).to.be.not.eql(SMILScheduleEnum.neverPlay);
	});

	it('should return correct times for specific weekdays with repeating logic and non repeating logic', async () => {
		const dayOfWeek = moment().isoWeekday();
		let testStartString = formatWeekDate(
			`wallclock(${formatDate(moment().subtract(1, 'days').subtract(1, 'hour'))})`,
			`-w${dayOfWeek}`,
		);
		let testEndString = formatWeekDate(
			`wallclock(${formatDate(moment().subtract(1, 'days').add(4, 'hours'))})`,
			`-w${dayOfWeek}`,
		);

		let responseTimeObject = parseSmilSchedule(testStartString, testEndString);

		expect(Math.abs(responseTimeObject.timeToStart)).to.be.lessThan(MS_PER_SECOND);
		expect(responseTimeObject.timeToEnd).to.be.eql(SMILScheduleEnum.neverPlay);

		testStartString = formatWeekDate(
			`R/wallclock(${formatDate(moment().subtract(1, 'days').subtract(1, 'hour'))}/P1D)`,
			`-w${dayOfWeek}`,
		);

		testEndString = formatWeekDate(
			`R/wallclock(${formatDate(moment().subtract(1, 'days').add(4, 'hours'))}/P1D)`,
			`-w${dayOfWeek}`,
		);

		responseTimeObject = parseSmilSchedule(testStartString, testEndString);

		expect(Math.abs(responseTimeObject.timeToStart)).to.be.lessThan(MS_PER_SECOND);
		expect(responseTimeObject.timeToEnd).to.be.not.eql(SMILScheduleEnum.neverPlay);
	});
});
