import * as chai from 'chai';
import moment from 'moment';
import MockDate from 'mockdate';
import { checkConditionalExprSafe, isConditionalExpExpired } from '../../../src/components/playlist/tools/conditionalTools';
import { setDefaultAwaitConditional } from '../../../src/components/playlist/tools/scheduleTools';
import { SMILScheduleEnum } from '../../../src/enums/scheduleEnums';
import { ExprTag } from '../../../src/enums/conditionalEnums';

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
			let testExpression = "adapi-compare('f1835d9f-be8f-4054-9e6c-123456789012', smil-playerId())";
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			testExpression = "adapi-compare('testing', smil-playerId())";
			expect(checkConditionalExprSafe(testExpression, '', 'testing')).to.be.equal(true);

			testExpression = "adapi-compare(smil-playerId(), 'testing')";
			expect(checkConditionalExprSafe(testExpression, '', 'testing')).to.be.equal(true);

			testExpression = "adapi-compare(smil-playerId(), 'sdsdsds')";
			expect(checkConditionalExprSafe(testExpression, '', 'ewrwerw')).to.be.equal(false);
		});
	});

	describe('Playlist tools component checkConditionalExprSafe playerName tests', () => {
		it('Should return correct response', () => {
			let testExpression = "adapi-compare('f1835d9f-be8f-4054-9e6c-123456789012', smil-playerName())";
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			testExpression = "adapi-compare('testing', smil-playerName())";
			expect(checkConditionalExprSafe(testExpression, 'testing', '')).to.be.equal(true);

			testExpression = "adapi-compare(smil-playerName(), 'testing')";
			expect(checkConditionalExprSafe(testExpression, 'testing', '')).to.be.equal(true);

			testExpression = "adapi-compare(smil-playerName(), 'sdsdsds')";
			expect(checkConditionalExprSafe(testExpression, 'ewrwerw', '')).to.be.equal(false);
		});
	});

	describe('Playlist tools component checkConditionalExprSafe adapi-date tests', () => {
		it('Should return correct response', () => {
			let testExpression = "adapi-compare(adapi-date(),'2010-01-01T00:00:00')&lt;0";
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			testExpression = "adapi-compare(adapi-date(),'2030-01-01T00:00:00')&lt;0";
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			testExpression = "adapi-compare('2010-01-01T00:00:00', adapi-date())&lt;0";
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			testExpression = "adapi-compare('2030-01-01T00:00:00', adapi-date())&lt;0";
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			const today = moment().format('YYYY-MM-DDTHH:mm:ss');
			testExpression = `adapi-compare(adapi-date(),\'${today}\')=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			testExpression = `adapi-compare(adapi-date(),\'${today}\')&lt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			testExpression = `adapi-compare(adapi-date(),\'${today}\')&gt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			testExpression = "adapi-compare('2010-01-01T00:00:00', adapi-date())&gt;0";
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			testExpression = "adapi-compare('2030-01-01T00:00:00', adapi-date())&gt;0";
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			testExpression = "adapi-compare(adapi-date(), '2010-01-01T00:00:00')&gt;0";
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			testExpression = "adapi-compare(adapi-date(), '2030-01-01T00:00:00')&gt;0";
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			testExpression = "adapi-compare(adapi-date(), '2010-01-01T00:00:00')&gt;=0";
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

			testExpression = "adapi-compare(adapi-date(), '2030-01-01T00:00:00')&gt;=0";
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);
		});
	});

	function testWeekdayFunction(funcName: string) {
		it('Should match current weekday', () => {
			let dayOfWeek = moment().isoWeekday() % 7;
			let testExpression = `${funcName}()=${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);
		});

		it('Should not match different weekday', () => {
			let dayOfWeek = (moment().isoWeekday() + 3) % 7;
			let testExpression = `${funcName}()=${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);
		});

		it('Should handle greater than current weekday', () => {
			let dayOfWeek = moment().isoWeekday() % 7;
			let testExpression = `${funcName}()&gt;${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);
		});

		it('Should handle less than current weekday', () => {
			let dayOfWeek = moment().isoWeekday() % 7;
			let testExpression = `${funcName}()&lt;${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);
		});

		it('Should handle greater than or equal current weekday', () => {
			let dayOfWeek = moment().isoWeekday() % 7;
			let testExpression = `${funcName}()&gt;=${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);
		});

		it('Should handle less than or equal current weekday', () => {
			let dayOfWeek = moment().isoWeekday() % 7;
			let testExpression = `${funcName}()&lt;=${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);
		});

		it('Should not match >= next weekday', () => {
			let dayOfWeek = (moment().isoWeekday() + 1) % 7;
			let testExpression = `${funcName}()&gt;=${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);
		});

		it('Should handle adapi-compare date expression', () => {
			let testExpression = `adapi-compare('2013-05-01T00:00:00', adapi-date()) &lt;= 0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);
		});

		it('Should not match <= yesterday weekday', () => {
			let dayOfWeek = moment().subtract(1, 'day').isoWeekday() % 7;
			let testExpression = `${funcName}()&lt;=${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);
		});

		it('Should match >= previous weekday', () => {
			let dayOfWeek = (moment().isoWeekday() - 1) % 7;
			let testExpression = `${funcName}()&gt;=${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);
		});

		it('Should match <= next weekday', () => {
			let dayOfWeek = (moment().isoWeekday() + 1) % 7;
			let testExpression = `${funcName}()&lt;=${dayOfWeek}`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);
		});

		it('Should match reversed >= with next weekday', () => {
			let dayOfWeek = (moment().isoWeekday() + 1) % 7;
			let testExpression = `${dayOfWeek}&gt;=${funcName}()`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);
		});

		it('Should match reversed <= with previous weekday', () => {
			let dayOfWeek = (moment().isoWeekday() - 1) % 7;
			let testExpression = `${dayOfWeek}&lt;=${funcName}()`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);
		});

		it('Should not match reversed >= with previous weekday', () => {
			let dayOfWeek = (moment().isoWeekday() - 1) % 7;
			let testExpression = `${dayOfWeek}&gt;=${funcName}()`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);
		});

		it('Should not match reversed <= with next weekday', () => {
			let dayOfWeek = (moment().isoWeekday() + 1) % 7;
			let testExpression = `${dayOfWeek}&lt;=${funcName}()`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);
		});
	}

	describe('Playlist tools component checkConditionalExprSafe adapi-weekday tests', () => {
		testWeekdayFunction('adapi-weekday');
	});

	describe('Playlist tools component checkConditionalExprSafe adapi-gmweekday tests', () => {
		testWeekdayFunction('adapi-gmweekday');
	});

	function testTimeFunction(funcName: string, hourOffset: number) {
		it('Should match past time <= comparison', () => {
			let dayTime = moment().subtract(hourOffset, 'hour').format('HH:mm:ss');
			let testExpression = `adapi-compare(\'${dayTime}\', ${funcName}())&lt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);
		});

		it('Should not match future time <= comparison', () => {
			let dayTime = moment().add(1, 'hour').format('HH:mm:ss');
			let testExpression = `adapi-compare(\'${dayTime}\', ${funcName}())&lt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);
		});

		it('Should match future time reversed <= comparison', () => {
			let dayTime = moment().add(1, 'hour').format('HH:mm:ss');
			let testExpression = `adapi-compare(${funcName}(), \'${dayTime}\')&lt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);
		});

		it('Should match future time >= comparison', () => {
			let dayTime = moment().add(1, 'hour').format('HH:mm:ss');
			let testExpression = `adapi-compare(\'${dayTime}\', ${funcName}()))&gt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);
		});

		it('Should not match future time reversed >= comparison', () => {
			let dayTime = moment().add(1, 'hour').format('HH:mm:ss');
			let testExpression = `adapi-compare(${funcName}(), \'${dayTime}\')&gt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);
		});

		it('Should match past time reversed >= comparison', () => {
			let dayTime = moment().subtract(hourOffset, 'hour').format('HH:mm:ss');
			let testExpression = `adapi-compare(${funcName}(), \'${dayTime}\')&gt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);
		});

		it('Should not match past time reversed <= with HH:mm format', () => {
			let dayTime = moment().subtract(hourOffset, 'hour').format('HH:mm');
			let testExpression = `adapi-compare(${funcName}(), \'${dayTime}\')&lt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);
		});

		it('Should match past time reversed >= with HH:mm format', () => {
			let dayTime = moment().subtract(hourOffset, 'hour').format('HH:mm');
			let testExpression = `adapi-compare(${funcName}(), \'${dayTime}\')&gt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);
		});

		it('Should not match past time >= with HH:mm format', () => {
			let dayTime = moment().subtract(hourOffset, 'hour').format('HH:mm');
			let testExpression = `adapi-compare(\'${dayTime}\', ${funcName}())&gt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);
		});

		it('Should match past time <= with HH:mm format', () => {
			let dayTime = moment().subtract(hourOffset, 'hour').format('HH:mm');
			let testExpression = `adapi-compare(\'${dayTime}\', ${funcName}())&lt;=0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);
		});
	}

	describe('Playlist tools component checkConditionalExprSafe time tests', () => {
		testTimeFunction('time', 1);
	});

	describe('Playlist tools component checkConditionalExprSafe gmtime tests', () => {
		testTimeFunction('gmtime', 2);
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
		const icsExample1 =
			'BEGIN:VCALENDAR\r\nCALSCALE:GREGORIAN\r\nPRODID:-//Adobe//AEM Screens//EN\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nDTSTART:20210421T120000\r\nRRULE:FREQ=DAILY;UNTIL=20210422T144100\r\nDTSTAMP:20210420T144143\r\nCREATED:20210420T144143\r\nUID:a0effdca-ab09-46e6-b4d7-4fbd1937ca47\r\nDESCRIPTION:\r\nSUMMARY:Daily Event\r\nDURATION:PT6H\r\nEND:VEVENT\r\nEND:VCALENDAR';

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

			testExpression = `adapi-compare(adapi-date(), \'2010-01-01T00:00:00\')&gt;0 or adapi-compare(\'2030-01-01T00:00:00\', adapi-date())&gt;0`;
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(true);

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
			let testExpression = "adapi-compare('f1835d9f-be8f-4054-9e6c-123456789012', smil-playerIdd())";
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			testExpression = "adapi-compare('testing', smil-playerrrNameeee())";
			expect(checkConditionalExprSafe(testExpression, 'testing', '')).to.be.equal(false);

			testExpression = "adapi-compare(smil-playerIdd(), 'f1835d9f-be8f-4054-9e6c-123456789012')";
			expect(checkConditionalExprSafe(testExpression)).to.be.equal(false);

			testExpression = "adapi-compare(smil-playerNameeee(), 'testing')";
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

	describe('isConditionalExpExpired', () => {
		it('should return false for element without expr tag', () => {
			const element = { src: 'video.mp4' } as any;
			expect(isConditionalExpExpired(element)).to.be.equal(false);
		});

		it('should return false for element with valid (active) expr', () => {
			const element = {
				[ExprTag]: "adapi-compare(adapi-date(),'2030-01-01T00:00:00')<0",
			} as any;
			expect(isConditionalExpExpired(element)).to.be.equal(false);
		});

		it('should return true for element with expired expr', () => {
			const element = {
				[ExprTag]: "adapi-compare(adapi-date(),'2010-01-01T00:00:00')<0",
			} as any;
			expect(isConditionalExpExpired(element)).to.be.equal(true);
		});

		it('should handle playerName matching', () => {
			const element = {
				[ExprTag]: "adapi-compare(smil-playerName(), 'TestPlayer')",
			} as any;
			expect(isConditionalExpExpired(element, 'TestPlayer')).to.be.equal(false);
			expect(isConditionalExpExpired(element, 'OtherPlayer')).to.be.equal(true);
		});

		it('should handle array input (delegates to setDefaultAwait)', () => {
			// Array with element that has no begin and no expr → playImmediately → not expired
			const elements = [{ repeatCount: '1', video: [] }] as any[];
			expect(isConditionalExpExpired(elements)).to.be.equal(false);
		});

		it('should return true for array where all elements have future wallclock', () => {
			const elements = [
				{
					begin: 'wallclock(2030-01-01T09:00)',
					end: 'wallclock(2030-12-01T12:00)',
					repeatCount: '1',
					video: [],
				},
			] as any[];
			expect(isConditionalExpExpired(elements)).to.be.equal(true);
		});
	});

	describe('setDefaultAwaitConditional', () => {
		it('should return playImmediately for element with active expr', () => {
			const element = {
				[ExprTag]: "adapi-compare(adapi-date(),'2030-01-01T00:00:00')<0",
			} as any;
			expect(setDefaultAwaitConditional(element, '', '')).to.be.equal(SMILScheduleEnum.playImmediately);
		});

		it('should return defaultAwait for element with expired expr', () => {
			const element = {
				[ExprTag]: "adapi-compare(adapi-date(),'2010-01-01T00:00:00')<0",
			} as any;
			expect(setDefaultAwaitConditional(element, '', '')).to.be.equal(SMILScheduleEnum.defaultAwait);
		});

		it('should return playImmediately for matching playerName', () => {
			const element = {
				[ExprTag]: "adapi-compare(smil-playerName(), 'TestPlayer')",
			} as any;
			expect(setDefaultAwaitConditional(element, 'TestPlayer', '')).to.be.equal(SMILScheduleEnum.playImmediately);
		});

		it('should return defaultAwait for non-matching playerName', () => {
			const element = {
				[ExprTag]: "adapi-compare(smil-playerName(), 'TestPlayer')",
			} as any;
			expect(setDefaultAwaitConditional(element, 'OtherPlayer', '')).to.be.equal(SMILScheduleEnum.defaultAwait);
		});
	});
});
