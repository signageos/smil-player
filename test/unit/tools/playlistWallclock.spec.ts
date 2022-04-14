import * as chai from 'chai';
import moment from 'moment';
import { formatDate, formatWeekDate, computeWaitInterval } from '../../testTools/testTools';
import { parseSmilSchedule } from '../../../src/components/playlist/tools/wallclockTools';
import { SMILScheduleEnum } from '../../../src/enums/scheduleEnums';

const expect = chai.expect;

// TODO: vyresit posun casu
describe('Playlist tools component parseSmilSchedule tests', () => {
	it('Should return correct times for how long to wait and how long to play', async () => {
		let testStartString = moment().format('YYYY-MM-DD');
		let testEndString = moment().add(1, 'days').format('YYYY-MM-DD');
		let responseTimeObject = parseSmilSchedule(testStartString, testEndString);

		expect(responseTimeObject.timeToStart).to.eql(0);
		expect(responseTimeObject.timeToEnd).to.eql(
			moment(`${testEndString}T${SMILScheduleEnum.defaultTime}`).valueOf(),
		);

		// convert date to ISO format, remove milliseconds => format to this string wallclock(R/2011-01-01T07:00:00/P1D)
		testStartString = `wallclock(R/${formatDate(moment())}/P1D)`;
		testEndString = `wallclock(R/${formatDate(moment().add(4, 'hours'))}/P1D)`;
		responseTimeObject = parseSmilSchedule(testStartString, testEndString);
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
		expect(
			Math.abs(responseTimeObject.timeToEnd - moment().add(1, 'day').subtract(4, 'hours').valueOf()),
		).to.be.lessThan(1000);

		testStartString = `wallclock(R/${formatDate(moment().subtract(15, 'days').add(7, 'hours'))}/P1D)`;
		testEndString = `wallclock(R/${formatDate(moment().subtract(15, 'days').add(12, 'hours'))}/P1D)`;
		responseTimeObject = parseSmilSchedule(testStartString, testEndString);
		// schedule start in 7 hours
		expect(Math.abs(25200000 - responseTimeObject.timeToStart)).to.be.lessThan(1000);
		expect(Math.abs(responseTimeObject.timeToEnd - moment().add(12, 'hours').valueOf())).to.be.lessThan(1000);

		// no endTime specified tomorrow start
		testStartString = `wallclock(R/${formatDate(moment().subtract(7, 'hours'))}/P1D)`;
		responseTimeObject = parseSmilSchedule(testStartString);
		// play immediately
		expect(Math.abs(responseTimeObject.timeToStart)).to.be.lessThan(1000);
		expect(responseTimeObject.timeToEnd).to.eql(moment(`${moment().format('YYYY-MM-DD')}T23:59:59`).valueOf());

		// no endTime specified in the future start startN
		testStartString = `wallclock(R/${formatDate(moment().add(7, 'days'))}/P1D)`;
		responseTimeObject = parseSmilSchedule(testStartString);
		// schedule start in 7 days from now
		expect(Math.abs(604800000 - responseTimeObject.timeToStart)).to.be.lessThan(1000);
		expect(responseTimeObject.timeToEnd).to.eql(
			moment(`${moment().add(7, 'days').format('YYYY-MM-DD')}T23:59:59`).valueOf(),
		);

		// no endTime specified tomorrow start
		testStartString = `wallclock(${formatDate(moment().subtract(7, 'hours'))})`;
		responseTimeObject = parseSmilSchedule(testStartString);
		// play immediately
		expect(Math.abs(responseTimeObject.timeToStart)).to.be.lessThan(1000);
		expect(responseTimeObject.timeToEnd).to.eql(moment('2100-01-01T23:59:59').valueOf());

		// no endTime specified in the future start startN
		testStartString = `wallclock(${formatDate(moment().add(7, 'days'))})`;
		responseTimeObject = parseSmilSchedule(testStartString);
		// schedule start in 7 days from now
		expect(Math.abs(604800000 - responseTimeObject.timeToStart)).to.be.lessThan(1000);
		expect(responseTimeObject.timeToEnd).to.eql(moment('2100-01-01T23:59:59').valueOf());

		testStartString = `wallclock(2020-07-16T12:00)`;
		testEndString = `wallclock(2020-07-17T19:00)`;
		responseTimeObject = parseSmilSchedule(testStartString, testEndString);
		// should be never played
		expect(Math.abs(responseTimeObject.timeToStart)).to.be.lessThan(1000);
		// timeToEnd = -3600000, value of 1970-01-01T00:00:00 in millis
		expect(responseTimeObject.timeToEnd.valueOf()).to.be.lessThan(0);

		testStartString = `wallclock(2020-01-01T09:00)`;
		testEndString = `wallclock(2020-12-01T12:00)`;
		responseTimeObject = parseSmilSchedule(testStartString, testEndString);
		expect(Math.abs(responseTimeObject.timeToStart)).to.be.lessThan(1000);
		// timeToEnd = value of 2020-12-01T12:00:00 should return -3600000 ( default value for playlists in the past )
		expect(responseTimeObject.timeToEnd).to.eql(-3600000);

		testStartString = `wallclock(2020-01-01T09:00)`;
		testEndString = `wallclock(${formatDate(moment().add(7, 'minutes'))})`;
		responseTimeObject = parseSmilSchedule(testStartString, testEndString);
		expect(Math.abs(responseTimeObject.timeToStart)).to.be.lessThan(1000);
		// timeToEnd value should be 7 minutes from now
		expect(Math.abs(responseTimeObject.timeToEnd - moment().add(7, 'minutes').valueOf())).to.be.lessThan(1000);
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
		expect(Math.abs(259199003 - responseTimeObject.timeToStart)).to.be.lessThan(1000);
		expect(
			Math.abs(moment().add(3, 'days').add(mediaDuration, 'hours').valueOf() - responseTimeObject.timeToEnd),
		).to.be.lessThan(1000);

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
		expect(Math.abs(518400000 - responseTimeObject.timeToStart)).to.be.lessThan(1000);
		expect(
			Math.abs(moment().add(6, 'days').add(mediaDuration, 'hours').valueOf() - responseTimeObject.timeToEnd),
		).to.be.lessThan(1000);

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
		expect(Math.abs(responseTimeObject.timeToStart)).to.be.lessThan(1000);
		expect(Math.abs(moment().add(mediaDuration, 'hours').valueOf() - responseTimeObject.timeToEnd)).to.be.lessThan(
			1000,
		);

		mediaDuration = 3;
		dayOfWeek = Math.abs(moment().isoWeekday() - 5);
		let waitMilis = computeWaitInterval(moment().isoWeekday(), dayOfWeek);
		let waitDays = waitMilis / 86400000;
		// convert date to ISO format, remove milliseconds => format to this string wallclock(R/2011-01-01+w3T07:00:00/P1D)
		testStartString = formatWeekDate(`wallclock(R/${formatDate(moment())}/P1D)`, `+w${dayOfWeek}`);
		testEndString = formatWeekDate(
			`wallclock(R/${formatDate(moment().add(mediaDuration, 'hours'))}/P1D)`,
			`+w${dayOfWeek}`,
		);
		responseTimeObject = parseSmilSchedule(testStartString, testEndString);
		expect(Math.abs(waitMilis - responseTimeObject.timeToStart)).to.be.lessThan(1000);
		expect(
			Math.abs(
				moment().add(waitDays, 'day').add(mediaDuration, 'hours').valueOf() - responseTimeObject.timeToEnd,
			),
		).to.be.lessThan(1000);

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
		expect(Math.abs(432000000 - responseTimeObject.timeToStart)).to.be.lessThan(1000);
		expect(
			Math.abs(moment().add(5, 'days').add(mediaDuration, 'hours').valueOf() - responseTimeObject.timeToEnd),
		).to.be.lessThan(1000);

		dayOfWeek = moment().isoWeekday();
		mediaDuration = 50;
		// convert date to ISO format, remove milliseconds => format to this string wallclock(R/2011-01-01+w3T07:00:00/P1D)
		testStartString = formatWeekDate(`wallclock(R/${formatDate(moment())}/P1D)`, `+w${dayOfWeek}`);
		testEndString = formatWeekDate(
			`wallclock(R/${formatDate(moment().add('500', 'years').add(mediaDuration, 'minutes'))}/P1D)`,
			`+w${dayOfWeek}`,
		);
		responseTimeObject = parseSmilSchedule(testStartString, testEndString);
		expect(Math.abs(responseTimeObject.timeToStart)).to.be.lessThan(1000);
		expect(
			Math.abs(moment().add(mediaDuration, 'minutes').valueOf() - responseTimeObject.timeToEnd),
		).to.be.lessThan(1000);

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
		expect(Math.abs(responseTimeObject.timeToStart)).to.be.lessThan(1000);
		expect(
			Math.abs(moment().add(mediaDuration, 'minutes').valueOf() - responseTimeObject.timeToEnd),
		).to.be.lessThan(1000);

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
		expect(Math.abs(600000 - responseTimeObject.timeToStart)).to.be.lessThan(1000);
		expect(
			Math.abs(moment().add(mediaDuration, 'minutes').valueOf() - responseTimeObject.timeToEnd),
		).to.be.lessThan(1000);
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
		expect(responseTimeObject.timeToStart <= 0).to.be.eql(true);
		expect(Math.abs(moment().add(mediaDuration, 'hours').valueOf() - responseTimeObject.timeToEnd)).to.be.lessThan(
			1000,
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
		expect(Math.abs(172800000 - responseTimeObject.timeToStart)).to.be.lessThan(1000);
		expect(Math.abs(172800000 - responseTimeObject.timeToStart)).to.be.lessThan(1000);
		expect(
			Math.abs(moment().add(2, 'days').add(mediaDuration, 'hours').valueOf() - responseTimeObject.timeToEnd),
		).to.be.lessThan(1000);

		mediaDuration = 2;
		dayOfWeek = Math.abs(moment().isoWeekday() - 5);
		let waitMilis = computeWaitInterval(moment().isoWeekday(), dayOfWeek);
		let waitDays = waitMilis / 86400000;
		// convert date to ISO format, remove milliseconds => format to this string wallclock(R/2011-01-01-w3T07:00:00/P1D)
		testStartString = formatWeekDate(`wallclock(R/${formatDate(moment().add(28, 'days'))}/P1D)`, `-w${dayOfWeek}`);
		testEndString = formatWeekDate(
			`wallclock(R/${formatDate(moment().add(28, 'days').add(mediaDuration, 'hours'))}/P1D)`,
			`-w${dayOfWeek}`,
		);
		responseTimeObject = parseSmilSchedule(testStartString, testEndString);
		expect(Math.abs(waitMilis - responseTimeObject.timeToStart)).to.be.lessThan(1000);
		expect(
			Math.abs(
				moment().add(waitDays, 'days').add(mediaDuration, 'hours').valueOf() - responseTimeObject.timeToEnd,
			),
		).to.be.lessThan(1000);

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
		expect(Math.abs(432000000 - responseTimeObject.timeToStart)).to.be.lessThan(1000);
		expect(
			Math.abs(moment().add(5, 'days').add(mediaDuration, 'hours').valueOf() - responseTimeObject.timeToEnd),
		).to.be.lessThan(1000);
	});
});
