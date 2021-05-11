import * as chai from 'chai';
import moment from 'moment';
import MockDate from 'mockdate';
import { checkConditionalExprSafe } from '../../../src/components/playlist/tools/conditionalTools';

const expect = chai.expect;

describe('Playlist tools checkConditionalExprSafe', () => {

	beforeEach(() => {
		MockDate.set(new Date('2021-04-22T12:00:00'));
	});

	afterEach(() => {
		MockDate.reset();
	});

	describe('Playlist tools component checkConditionalExprSafe playerId tests', () => {
		it('Should return correct response', () => {
			let testExpression = 'adapi-compare(\'f1835d9f-be8f-4054-9e6c-123456789012\', smil-playerId())';
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			testExpression = 'adapi-compare(\'testing\', smil-playerId())';
			expect(checkConditionalExprSafe(testExpression, '', 'testing')).to.be.equal(true);

			testExpression = 'adapi-compare(smil-playerId(), \'testing\')';
			expect(checkConditionalExprSafe(testExpression, '', 'testing')).to.be.equal(true);

			testExpression = 'adapi-compare(smil-playerId(), \'sdsdsds\')';
			expect(checkConditionalExprSafe(testExpression, '', 'ewrwerw')).to.be.equal(false);
		});
	});

	describe('Playlist tools component checkConditionalExprSafe playerName tests', () => {
		it('Should return correct response', () => {
			let testExpression = 'adapi-compare(\'f1835d9f-be8f-4054-9e6c-123456789012\', smil-playerName())';
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			testExpression = 'adapi-compare(\'testing\', smil-playerName())';
			expect(checkConditionalExprSafe(testExpression, 'testing', '')).to.be.equal(true);

			testExpression = 'adapi-compare(smil-playerName(), \'testing\')';
			expect(checkConditionalExprSafe(testExpression, 'testing', '')).to.be.equal(true);

			testExpression = 'adapi-compare(smil-playerName(), \'sdsdsds\')';
			expect(checkConditionalExprSafe(testExpression, 'ewrwerw', '')).to.be.equal(false);
		});
	});

	describe('Playlist tools component checkConditionalExprSafe adapi-date tests', () => {
		it('Should return correct response', () => {
			let testExpression = 'adapi-compare(adapi-date(),\'2010-01-01T00:00:00\')&lt;0';
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			testExpression = 'adapi-compare(adapi-date(),\'2030-01-01T00:00:00\')&lt;0';
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			testExpression = 'adapi-compare(\'2010-01-01T00:00:00\', adapi-date())&lt;0';
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			testExpression = 'adapi-compare(\'2030-01-01T00:00:00\', adapi-date())&lt;0';
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			const today = moment().format('YYYY-MM-DD');
			testExpression = `adapi-compare(adapi-date(),\'${today}\')=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			testExpression = `adapi-compare(adapi-date(),\'${today}\')&lt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			testExpression = `adapi-compare(adapi-date(),\'${today}\')&gt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			testExpression = 'adapi-compare(\'2010-01-01T00:00:00\', adapi-date())&gt;0';
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			testExpression = 'adapi-compare(\'2030-01-01T00:00:00\', adapi-date())&gt;0';
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			testExpression = 'adapi-compare(adapi-date(), \'2010-01-01T00:00:00\')&gt;0';
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			testExpression = 'adapi-compare(adapi-date(), \'2030-01-01T00:00:00\')&gt;0';
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			testExpression = 'adapi-compare(adapi-date(), \'2010-01-01T00:00:00\')&gt;=0';
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			testExpression = 'adapi-compare(adapi-date(), \'2030-01-01T00:00:00\')&gt;=0';
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);
		});
	});

	describe('Playlist tools component checkConditionalExprSafe adapi-weekday tests', () => {

		it('Should return correct response', () => {
			let dayOfWeek = (moment().isoWeekday() % 7);
			let testExpression = `adapi-weekday()=${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().isoWeekday() + 3) % 7;
			testExpression = `adapi-weekday()=${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			dayOfWeek = (moment().isoWeekday() % 7);
			testExpression = `adapi-weekday()&gt;${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			dayOfWeek = (moment().isoWeekday() % 7);
			testExpression = `adapi-weekday()&lt;${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			dayOfWeek = (moment().isoWeekday() % 7);
			testExpression = `adapi-weekday()&gt;=${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().isoWeekday() % 7);
			testExpression = `adapi-weekday()&lt;=${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().isoWeekday() + 1) % 7;
			testExpression = `adapi-weekday()&gt;=${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			testExpression = `adapi-compare('2013-05-01T00:00:00', adapi-date()) &lt;= 0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().subtract(1, 'day').isoWeekday()) % 7;
			testExpression = `adapi-weekday()&lt;=${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			dayOfWeek = (moment().isoWeekday() - 1) % 7;
			testExpression = `adapi-weekday()&gt;=${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().isoWeekday() + 1) % 7;
			testExpression = `adapi-weekday()&lt;=${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().isoWeekday() + 1) % 7;
			testExpression = `${dayOfWeek}&gt;=adapi-weekday()`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().isoWeekday() - 1) % 7;
			testExpression = `${dayOfWeek}&lt;=adapi-weekday()`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().isoWeekday() - 1) % 7;
			testExpression = `${dayOfWeek}&gt;=adapi-weekday()`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			dayOfWeek = (moment().isoWeekday() + 1) % 7;
			testExpression = `${dayOfWeek}&lt;=adapi-weekday()`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);
		});
	});

	describe('Playlist tools component checkConditionalExprSafe adapi-gmweekday tests', () => {

		it('Should return correct response', () => {
			let dayOfWeek = (moment().isoWeekday() % 7);
			let testExpression = `adapi-gmweekday()=${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().isoWeekday() + 3) % 7;
			testExpression = `adapi-gmweekday()=${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			dayOfWeek = (moment().isoWeekday() % 7);
			testExpression = `adapi-gmweekday()&gt;${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			dayOfWeek = (moment().isoWeekday() % 7);
			testExpression = `adapi-gmweekday()&lt;${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			dayOfWeek = (moment().isoWeekday() % 7);
			testExpression = `adapi-gmweekday()&gt;=${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().isoWeekday() % 7);
			testExpression = `adapi-gmweekday()&lt;=${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().isoWeekday() + 1) % 7;
			testExpression = `adapi-gmweekday()&gt;=${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			testExpression = `adapi-compare('2013-05-01T00:00:00', adapi-date()) &lt;= 0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().subtract(1, 'day').isoWeekday()) % 7;
			testExpression = `adapi-gmweekday()&lt;=${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			dayOfWeek = (moment().isoWeekday() - 1) % 7;
			testExpression = `adapi-gmweekday()&gt;=${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().isoWeekday() + 1) % 7;
			testExpression = `adapi-gmweekday()&lt;=${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().isoWeekday() + 1) % 7;
			testExpression = `${dayOfWeek}&gt;=adapi-gmweekday()`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().isoWeekday() - 1) % 7;
			testExpression = `${dayOfWeek}&lt;=adapi-gmweekday()`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().isoWeekday() - 1) % 7;
			testExpression = `${dayOfWeek}&gt;=adapi-gmweekday()`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			dayOfWeek = (moment().isoWeekday() + 1) % 7;
			testExpression = `${dayOfWeek}&lt;=adapi-gmweekday()`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);
		});
	});

	describe('Playlist tools component checkConditionalExprSafe time tests', () => {
		it('Should return correct response', () => {
			let dayTime = moment().subtract(1, 'hour').format('HH:mm:ss');
			let testExpression = `adapi-compare(\'${dayTime}\', time())&lt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			dayTime = moment().add(1, 'hour').format('HH:mm:ss');
			testExpression = `adapi-compare(\'${dayTime}\', time())&lt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			dayTime = moment().add(1, 'hour').format('HH:mm:ss');
			testExpression = `adapi-compare(time(), \'${dayTime}\')&lt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			dayTime = moment().add(1, 'hour').format('HH:mm:ss');
			testExpression = `adapi-compare(\'${dayTime}\', time()))&gt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			dayTime = moment().add(1, 'hour').format('HH:mm:ss');
			testExpression = `adapi-compare(time(), \'${dayTime}\')&gt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			dayTime = moment().subtract(1, 'hour').format('HH:mm:ss');
			testExpression = `adapi-compare(time(), \'${dayTime}\')&gt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			dayTime = moment().subtract(1, 'hour').format('HH:mm');
			testExpression = `adapi-compare(time(), \'${dayTime}\')&lt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			dayTime = moment().subtract(1, 'hour').format('HH:mm');
			testExpression = `adapi-compare(time(), \'${dayTime}\')&gt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			dayTime = moment().subtract(1, 'hour').format('HH:mm');
			testExpression = `adapi-compare(\'${dayTime}\', time())&gt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			dayTime = moment().subtract(1, 'hour').format('HH:mm');
			testExpression = `adapi-compare(\'${dayTime}\', time())&lt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);
		});
	});

	describe('Playlist tools component checkConditionalExprSafe gmtime tests', () => {
		it('Should return correct response', () => {
			let dayTime = moment().subtract(2, 'hour').format('HH:mm:ss');
			let testExpression = `adapi-compare(\'${dayTime}\', gmtime())&lt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			dayTime = moment().add(1, 'hour').format('HH:mm:ss');
			testExpression = `adapi-compare(\'${dayTime}\', gmtime())&lt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			dayTime = moment().add(2, 'hour').format('HH:mm:ss');
			testExpression = `adapi-compare(gmtime(), \'${dayTime}\')&lt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			dayTime = moment().add(2, 'hour').format('HH:mm:ss');
			testExpression = `adapi-compare(\'${dayTime}\', gmtime()))&gt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			dayTime = moment().add(1, 'hour').format('HH:mm:ss');
			testExpression = `adapi-compare(gmtime(), \'${dayTime}\')&gt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			dayTime = moment().subtract(2, 'hour').format('HH:mm:ss');
			testExpression = `adapi-compare(gmtime(), \'${dayTime}\')&gt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			dayTime = moment().subtract(2, 'hour').format('HH:mm');
			testExpression = `adapi-compare(gmtime(), \'${dayTime}\')&lt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			dayTime = moment().subtract(2, 'hour').format('HH:mm');
			testExpression = `adapi-compare(gmtime(), \'${dayTime}\')&gt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			dayTime = moment().subtract(2, 'hour').format('HH:mm');
			testExpression = `adapi-compare(\'${dayTime}\', gmtime())&gt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			dayTime = moment().subtract(2, 'hour').format('HH:mm');
			testExpression = `adapi-compare(\'${dayTime}\', gmtime())&lt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);
		});
	});

	describe('Playlist tools component checkConditionalExprSafe adapi-compare - substringAfter tests', () => {
		it('Should return correct response', () => {
			let dayTime = moment().subtract(1, 'hour').format('HH:mm:ss');
			let testExpression = `adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))&lt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			dayTime = moment().add(1, 'hour').format('HH:mm:ss');
			testExpression = `adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))&lt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			dayTime = moment().add(1, 'hour').format('HH:mm:ss');
			testExpression = `adapi-compare(substring-after(adapi-date(), \'T\'), \'${dayTime}\')&lt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			dayTime = moment().add(1, 'hour').format('HH:mm:ss');
			testExpression = `adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))&gt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			dayTime = moment().add(1, 'hour').format('HH:mm:ss');
			testExpression = `adapi-compare(substring-after(adapi-date(), \'T\'), \'${dayTime}\')&gt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			dayTime = moment().subtract(1, 'hour').format('HH:mm:ss');
			testExpression = `adapi-compare(substring-after(adapi-date(), \'T\'), \'${dayTime}\')&gt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);
		});
	});

	describe('Playlist tools component checkConditionalExprSafe ICS tests', () => {

		const icsExample1 = 'BEGIN:VCALENDAR\r\nCALSCALE:GREGORIAN\r\nPRODID:-//Adobe//AEM Screens//EN\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nDTSTART:20210421T120000\r\nRRULE:FREQ=DAILY;UNTIL=20210422T144100\r\nDTSTAMP:20210420T144143\r\nCREATED:20210420T144143\r\nUID:a0effdca-ab09-46e6-b4d7-4fbd1937ca47\r\nDESCRIPTION:\r\nSUMMARY:Daily Event\r\nDURATION:PT6H\r\nEND:VEVENT\r\nEND:VCALENDAR';

		it('Should return correct response', () => {
			let testExpression = `adapi-compare(adapi-ics(), '${icsExample1}')`;

			// event starting edge
			MockDate.set('2021-04-21T11:59:59');
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			MockDate.set('2021-04-21T12:00:00');
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			// event ending edge
			MockDate.set('2021-04-21T17:59:59');
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			MockDate.set('2021-04-21T18:00:00');
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			MockDate.set('2021-04-21T18:00:01');
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			// Still running event & even end date did not reached
			MockDate.set('2021-04-22T14:40:00');
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			// time is after endDate but event already started using recurrency rule
			MockDate.set('2021-04-22T14:41:00');
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			MockDate.set('2021-04-22T14:42:00');
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			// Next day recurrency is not valid
			MockDate.set('2021-04-23T11:59:59');
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			MockDate.set('2021-04-23T12:00:00');
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			MockDate.set('2021-04-23T17:59:59');
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			MockDate.set('2021-04-23T18:00:00');
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			MockDate.set('2021-04-23T18:00:01');
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

		});
	});

	describe('Playlist tools component checkConditionalExprSafe advanced expressions - AND', () => {
		it('Should return correct response', () => {
			let dayTime = moment().subtract(1, 'hour').format('HH:mm:ss');
			let testExpression = `adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))&lt;=0 and adapi-compare(substring-after(adapi-date(), \'T\'), \'${dayTime}\')&gt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			testExpression = `adapi-compare(adapi-date(), \'2010-01-01T00:00:00\')&gt;0 and adapi-compare(\'2030-01-01T00:00:00\', adapi-date())&gt;0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			testExpression = `adapi-compare(adapi-date(), \'2010-01-01T00:00:00\')&gt;0 and adapi-compare(\'2010-01-01T00:00:00\', adapi-date())&gt;0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			let dayOfWeek = (moment().isoWeekday() + 1) % 7;
			testExpression = `adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))&lt;=0 and ${dayOfWeek}&gt;=adapi-weekday()`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			testExpression = `adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))&lt;=0 and ${dayOfWeek}&lt;=adapi-weekday()`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			dayOfWeek = moment().isoWeekday();
			testExpression = `adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))&lt;=0 and ${dayOfWeek}=adapi-weekday() and ${dayOfWeek}&gt;=adapi-weekday()
			and adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))&lt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);
		});
	});

	describe('Playlist tools component checkConditionalExprSafe advanced expressions - OR', () => {
		it('Should return correct response', () => {
			let dayTime = moment().subtract(1, 'hour').format('HH:mm:ss');
			let testExpression = `adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))&lt;=0 or adapi-compare(substring-after(adapi-date(), \'T\'), \'${dayTime}\')&gt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			// tslint:disable-next-line:max-line-length
			testExpression = `adapi-compare(adapi-date(), \'2010-01-01T00:00:00\')&gt;0 or adapi-compare(\'2030-01-01T00:00:00\', adapi-date())&gt;0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			// tslint:disable-next-line:max-line-length
			testExpression = `adapi-compare(adapi-date(), \'2010-01-01T00:00:00\')&gt;0 or adapi-compare(\'2010-01-01T00:00:00\', adapi-date())&gt;0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			let dayOfWeek = (moment().isoWeekday() + 1) % 7;
			testExpression = `adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))&lt;=0 or ${dayOfWeek}&gt;=adapi-weekday()`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			testExpression = `adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))&lt;=0 or ${dayOfWeek}&lt;=adapi-weekday()`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			dayOfWeek = moment().isoWeekday();
			testExpression = `adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))&gt;=0 or ${dayOfWeek}&lt;adapi-weekday() or ${dayOfWeek}&gt;adapi-weekday()`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			testExpression = `adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))&gt;=0 or ${dayOfWeek}=adapi-weekday() or ${dayOfWeek}&gt;adapi-weekday()`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);
		});
	});

	describe('Playlist tools component checkConditionalExprSafe advanced expressions - AND with < and >', () => {
		it('Should return correct response', () => {
			let dayTime = moment().subtract(1, 'hour').format('HH:mm:ss');
			let testExpression = `adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))<=0 and adapi-compare(substring-after(adapi-date(), \'T\'), \'${dayTime}\')>=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			testExpression = `adapi-compare(adapi-date(), \'2010-01-01T00:00:00\')>0 and adapi-compare(\'2030-01-01T00:00:00\', adapi-date())>0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			testExpression = `adapi-compare(adapi-date(), \'2010-01-01T00:00:00\')>0 and adapi-compare(\'2010-01-01T00:00:00\', adapi-date())>0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			let dayOfWeek = (moment().isoWeekday() + 1) % 7;
			testExpression = `adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))<=0 and ${dayOfWeek}>=adapi-weekday()`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			testExpression = `adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))<=0 and ${dayOfWeek}<=adapi-weekday()`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			dayOfWeek = moment().isoWeekday();
			testExpression = `adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))<=0 and ${dayOfWeek}=adapi-weekday() and ${dayOfWeek}>=adapi-weekday()
			and adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))<=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);
		});
	});

	describe('Playlist tools component checkConditionalExprSafe not supported expression', () => {
		it('Should return correct response', () => {
			let dayTime = moment().subtract(1, 'hour').format('HH:mm:ss');
			let testExpression = 'adapi-compare(\'f1835d9f-be8f-4054-9e6c-123456789012\', smil-playerIdd())';
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			testExpression = 'adapi-compare(\'testing\', smil-playerrrNameeee())';
			expect(checkConditionalExprSafe(testExpression, 'testing', '')).to.be.equal(false);

			testExpression = 'adapi-compare(smil-playerIdd(), \'f1835d9f-be8f-4054-9e6c-123456789012\')';
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			testExpression = 'adapi-compare(smil-playerNameeee(), \'testing\')';
			expect(checkConditionalExprSafe(testExpression, 'testing', '')).to.be.equal(false);

			testExpression = `adapi-commmmpare(adapi-date(), \'2010-01-01T00:00:00\')>0 and adapi-compare(\'2050-01-01T00:00:00\', adapi-date())>0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			testExpression = `adapi-commmmpare(adapi-date(), \'2010-01-01T00:00:00\')>0 and adapi-compare(\'2050-01-01T00:00:00\', adapi-daaaaate())>0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			let dayOfWeek = moment().isoWeekday();
			testExpression = `adapi-compare(\'${dayTime}\', substrrrrrring-after(adapi-date(), \'T\'))<=0 and ${dayOfWeek}=adapi-weekday() and ${dayOfWeek}>=adapi-weekday()
			and adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))<=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			testExpression = `adapi-compare(\'${dayTime}\', substrrrrrring-after(adapi-date(), \'T\'))<=0 or ${dayOfWeek}=adapi-weekday() or ${dayOfWeek}>=adapi-weekday()
			or adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))<=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);
		});
	});
});
