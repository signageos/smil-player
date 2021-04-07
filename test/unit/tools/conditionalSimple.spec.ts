import * as chai from 'chai';
import moment from 'moment';
import { checkConditionalExp } from '../../../src/components/playlist/tools/conditionalTools';

const expect = chai.expect;

describe('Playlist tools checkConditionalExp', () => {
	describe('Playlist tools component checkConditionalExp playerId tests', () => {
		it('Should return correct response', () => {
			let testExpression = 'adapi-compare(\'f1835d9f-be8f-4054-9e6c-123456789012\', smil-playerId())';
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			testExpression = 'adapi-compare(\'testing\', smil-playerId())';
			expect(checkConditionalExp(testExpression, '', 'testing')).to.be.equal(true);

			testExpression = 'adapi-compare(smil-playerId(), \'testing\')';
			expect(checkConditionalExp(testExpression, '', 'testing')).to.be.equal(true);

			testExpression = 'adapi-compare(smil-playerId(), \'sdsdsds\')';
			expect(checkConditionalExp(testExpression, '', 'ewrwerw')).to.be.equal(false);
		});
	});

	describe('Playlist tools component checkConditionalExp playerName tests', () => {
		it('Should return correct response', () => {
			let testExpression = 'adapi-compare(\'f1835d9f-be8f-4054-9e6c-123456789012\', smil-playerName())';
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			testExpression = 'adapi-compare(\'testing\', smil-playerName())';
			expect(checkConditionalExp(testExpression, 'testing', '')).to.be.equal(true);

			testExpression = 'adapi-compare(smil-playerName(), \'testing\')';
			expect(checkConditionalExp(testExpression, 'testing', '')).to.be.equal(true);

			testExpression = 'adapi-compare(smil-playerName(), \'sdsdsds\')';
			expect(checkConditionalExp(testExpression, 'ewrwerw', '')).to.be.equal(false);
		});
	});

	describe('Playlist tools component checkConditionalExp adapi-date tests', () => {
		it('Should return correct response', () => {
			let testExpression = 'adapi-compare(adapi-date(),\'2010-01-01T00:00:00\')&lt;0';
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			testExpression = 'adapi-compare(adapi-date(),\'2030-01-01T00:00:00\')&lt;0';
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			testExpression = 'adapi-compare(\'2010-01-01T00:00:00\', adapi-date())&lt;0';
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			testExpression = 'adapi-compare(\'2030-01-01T00:00:00\', adapi-date())&lt;0';
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			const today = moment().format('YYYY-MM-DD');
			testExpression = `adapi-compare(adapi-date(),\'${today}\')=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			testExpression = `adapi-compare(adapi-date(),\'${today}\')&lt;=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			testExpression = `adapi-compare(adapi-date(),\'${today}\')&gt;=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			testExpression = 'adapi-compare(\'2010-01-01T00:00:00\', adapi-date())&gt;0';
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			testExpression = 'adapi-compare(\'2030-01-01T00:00:00\', adapi-date())&gt;0';
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			testExpression = 'adapi-compare(adapi-date(), \'2010-01-01T00:00:00\')&gt;0';
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			testExpression = 'adapi-compare(adapi-date(), \'2030-01-01T00:00:00\')&gt;0';
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			testExpression = 'adapi-compare(adapi-date(), \'2010-01-01T00:00:00\')&gt;=0';
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			testExpression = 'adapi-compare(adapi-date(), \'2030-01-01T00:00:00\')&gt;=0';
			expect(checkConditionalExp(testExpression)).to.be.equal(false);
		});
	});

	describe('Playlist tools component checkConditionalExp adapi-weekday tests', () => {
		it('Should return correct response', () => {
			let dayOfWeek = (moment().isoWeekday() % 7);
			let testExpression = `adapi-weekday()=${dayOfWeek}`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().isoWeekday() + 3) % 7;
			testExpression = `adapi-weekday()=${dayOfWeek}`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			dayOfWeek = (moment().isoWeekday() % 7);
			testExpression = `adapi-weekday()&gt;${dayOfWeek}`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			dayOfWeek = (moment().isoWeekday() % 7);
			testExpression = `adapi-weekday()&lt;${dayOfWeek}`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			dayOfWeek = (moment().isoWeekday() % 7);
			testExpression = `adapi-weekday()&gt;=${dayOfWeek}`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().isoWeekday() % 7);
			testExpression = `adapi-weekday()&lt;=${dayOfWeek}`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().isoWeekday() + 1) % 7;
			testExpression = `adapi-weekday()&gt;=${dayOfWeek}`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			testExpression = `adapi-compare('2013-05-01T00:00:00', adapi-date()) &lt;= 0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().subtract(1, 'day').isoWeekday()) % 7;
			testExpression = `adapi-weekday()&lt;=${dayOfWeek}`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			dayOfWeek = (moment().isoWeekday() - 1) % 7;
			testExpression = `adapi-weekday()&gt;=${dayOfWeek}`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().isoWeekday() + 1) % 7;
			testExpression = `adapi-weekday()&lt;=${dayOfWeek}`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().isoWeekday() + 1) % 7;
			testExpression = `${dayOfWeek}&gt;=adapi-weekday()`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().isoWeekday() - 1) % 7;
			testExpression = `${dayOfWeek}&lt;=adapi-weekday()`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().isoWeekday() - 1) % 7;
			testExpression = `${dayOfWeek}&gt;=adapi-weekday()`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			dayOfWeek = (moment().isoWeekday() + 1) % 7;
			testExpression = `${dayOfWeek}&lt;=adapi-weekday()`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);
		});
	});

	describe('Playlist tools component checkConditionalExp adapi-gmweekday tests', () => {
		it('Should return correct response', () => {
			let dayOfWeek = (moment().isoWeekday() % 7);
			let testExpression = `adapi-gmweekday()=${dayOfWeek}`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().isoWeekday() + 3) % 7;
			testExpression = `adapi-gmweekday()=${dayOfWeek}`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			dayOfWeek = (moment().isoWeekday() % 7);
			testExpression = `adapi-gmweekday()&gt;${dayOfWeek}`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			dayOfWeek = (moment().isoWeekday() % 7);
			testExpression = `adapi-gmweekday()&lt;${dayOfWeek}`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			dayOfWeek = (moment().isoWeekday() % 7);
			testExpression = `adapi-gmweekday()&gt;=${dayOfWeek}`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().isoWeekday() % 7);
			testExpression = `adapi-gmweekday()&lt;=${dayOfWeek}`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().isoWeekday() + 1) % 7;
			testExpression = `adapi-gmweekday()&gt;=${dayOfWeek}`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			testExpression = `adapi-compare('2013-05-01T00:00:00', adapi-date()) &lt;= 0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().subtract(1, 'day').isoWeekday()) % 7;
			testExpression = `adapi-gmweekday()&lt;=${dayOfWeek}`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			dayOfWeek = (moment().isoWeekday() - 1) % 7;
			testExpression = `adapi-gmweekday()&gt;=${dayOfWeek}`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().isoWeekday() + 1) % 7;
			testExpression = `adapi-gmweekday()&lt;=${dayOfWeek}`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().isoWeekday() + 1) % 7;
			testExpression = `${dayOfWeek}&gt;=adapi-gmweekday()`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().isoWeekday() - 1) % 7;
			testExpression = `${dayOfWeek}&lt;=adapi-gmweekday()`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			dayOfWeek = (moment().isoWeekday() - 1) % 7;
			testExpression = `${dayOfWeek}&gt;=adapi-gmweekday()`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			dayOfWeek = (moment().isoWeekday() + 1) % 7;
			testExpression = `${dayOfWeek}&lt;=adapi-gmweekday()`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);
		});
	});

	describe('Playlist tools component checkConditionalExp time tests', () => {
		it('Should return correct response', () => {
			let dayTime = moment().subtract(1, 'hour').format('HH:mm:ss');
			let testExpression = `adapi-compare(\'${dayTime}\', time())&lt;=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			dayTime = moment().add(1, 'hour').format('HH:mm:ss');
			testExpression = `adapi-compare(\''${dayTime}\', time())&lt;=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			dayTime = moment().add(1, 'hour').format('HH:mm:ss');
			testExpression = `adapi-compare(time(), \''${dayTime}\')&lt;=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			dayTime = moment().add(1, 'hour').format('HH:mm:ss');
			testExpression = `adapi-compare(\''${dayTime}\', time()))&gt;=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			dayTime = moment().add(1, 'hour').format('HH:mm:ss');
			testExpression = `adapi-compare(time(), \''${dayTime}\')&gt;=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			dayTime = moment().subtract(1, 'hour').format('HH:mm:ss');
			testExpression = `adapi-compare(time(), \''${dayTime}\')&gt;=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			dayTime = moment().subtract(1, 'hour').format('HH:mm');
			testExpression = `adapi-compare(time(), \''${dayTime}\')&lt;=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			dayTime = moment().subtract(1, 'hour').format('HH:mm');
			testExpression = `adapi-compare(time(), \''${dayTime}\')&gt;=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			dayTime = moment().subtract(1, 'hour').format('HH:mm');
			testExpression = `adapi-compare(\''${dayTime}\', time())&gt;=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			dayTime = moment().subtract(1, 'hour').format('HH:mm');
			testExpression = `adapi-compare(\''${dayTime}\', time())&lt;=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);
		});
	});

	describe('Playlist tools component checkConditionalExp gmtime tests', () => {
		it('Should return correct response', () => {
			let dayTime = moment().subtract(2, 'hour').format('HH:mm:ss');
			let testExpression = `adapi-compare(\'${dayTime}\', gmtime())&lt;=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			dayTime = moment().add(1, 'hour').format('HH:mm:ss');
			testExpression = `adapi-compare(\''${dayTime}\', gmtime())&lt;=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			dayTime = moment().add(2, 'hour').format('HH:mm:ss');
			testExpression = `adapi-compare(gmtime(), \''${dayTime}\')&lt;=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			dayTime = moment().add(2, 'hour').format('HH:mm:ss');
			testExpression = `adapi-compare(\''${dayTime}\', gmtime()))&gt;=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			dayTime = moment().add(1, 'hour').format('HH:mm:ss');
			testExpression = `adapi-compare(gmtime(), \''${dayTime}\')&gt;=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			dayTime = moment().subtract(2, 'hour').format('HH:mm:ss');
			testExpression = `adapi-compare(gmtime(), \''${dayTime}\')&gt;=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			dayTime = moment().subtract(2, 'hour').format('HH:mm');
			testExpression = `adapi-compare(gmtime(), \''${dayTime}\')&lt;=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			dayTime = moment().subtract(2, 'hour').format('HH:mm');
			testExpression = `adapi-compare(gmtime(), \''${dayTime}\')&gt;=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			dayTime = moment().subtract(2, 'hour').format('HH:mm');
			testExpression = `adapi-compare(\''${dayTime}\', gmtime())&gt;=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			dayTime = moment().subtract(2, 'hour').format('HH:mm');
			testExpression = `adapi-compare(\''${dayTime}\', gmtime())&lt;=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);
		});
	});

	describe('Playlist tools component checkConditionalExp adapi-compare - substringAfter tests', () => {
		it('Should return correct response', () => {
			let dayTime = moment().subtract(1, 'hour').format('HH:mm:ss');
			let testExpression = `adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))&lt;=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			dayTime = moment().add(1, 'hour').format('HH:mm:ss');
			testExpression = `adapi-compare(\''${dayTime}\', substring-after(adapi-date(), \'T\'))&lt;=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			dayTime = moment().add(1, 'hour').format('HH:mm:ss');
			testExpression = `adapi-compare(substring-after(adapi-date(), \'T\'), \''${dayTime}\')&lt;=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			dayTime = moment().add(1, 'hour').format('HH:mm:ss');
			testExpression = `adapi-compare(\''${dayTime}\', substring-after(adapi-date(), \'T\'))&gt;=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			dayTime = moment().add(1, 'hour').format('HH:mm:ss');
			testExpression = `adapi-compare(substring-after(adapi-date(), \'T\'), \''${dayTime}\')&gt;=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			dayTime = moment().subtract(1, 'hour').format('HH:mm:ss');
			testExpression = `adapi-compare(substring-after(adapi-date(), \'T\'), \''${dayTime}\')&gt;=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);
		});
	});

	describe('Playlist tools component checkConditionalExp advanced expressions - AND', () => {
		it('Should return correct response', () => {
			let dayTime = moment().subtract(1, 'hour').format('HH:mm:ss');
			let testExpression = `adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))&lt;=0 and adapi-compare(substring-after(adapi-date(), \'T\'), \''${dayTime}\')&gt;=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			testExpression = `adapi-compare(adapi-date(), \'2010-01-01T00:00:00\')&gt;0 and adapi-compare(\'2030-01-01T00:00:00\', adapi-date())&gt;0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			testExpression = `adapi-compare(adapi-date(), \'2010-01-01T00:00:00\')&gt;0 and adapi-compare(\'2010-01-01T00:00:00\', adapi-date())&gt;0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			let dayOfWeek = (moment().isoWeekday() + 1) % 7;
			testExpression = `adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))&lt;=0 and ${dayOfWeek}&gt;=adapi-weekday()`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			testExpression = `adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))&lt;=0 and ${dayOfWeek}&lt;=adapi-weekday()`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			dayOfWeek = moment().isoWeekday();
			testExpression = `adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))&lt;=0 and ${dayOfWeek}=adapi-weekday() and ${dayOfWeek}&gt;=adapi-weekday()
			and adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))&lt;=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);
		});
	});

	describe('Playlist tools component checkConditionalExp advanced expressions - OR', () => {
		it('Should return correct response', () => {
			let dayTime = moment().subtract(1, 'hour').format('HH:mm:ss');
			let testExpression = `adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))&lt;=0 or adapi-compare(substring-after(adapi-date(), \'T\'), \''${dayTime}\')&gt;=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			// tslint:disable-next-line:max-line-length
			testExpression = `adapi-compare(adapi-date(), \'2010-01-01T00:00:00\')&gt;0 or adapi-compare(\'2030-01-01T00:00:00\', adapi-date())&gt;0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			// tslint:disable-next-line:max-line-length
			testExpression = `adapi-compare(adapi-date(), \'2010-01-01T00:00:00\')&gt;0 or adapi-compare(\'2010-01-01T00:00:00\', adapi-date())&gt;0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			let dayOfWeek = (moment().isoWeekday() + 1) % 7;
			testExpression = `adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))&lt;=0 or ${dayOfWeek}&gt;=adapi-weekday()`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			testExpression = `adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))&lt;=0 or ${dayOfWeek}&lt;=adapi-weekday()`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			dayOfWeek = moment().isoWeekday();
			testExpression = `adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))&gt;=0 or ${dayOfWeek}&lt;adapi-weekday() or ${dayOfWeek}&gt;adapi-weekday()`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			testExpression = `adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))&gt;=0 or ${dayOfWeek}=adapi-weekday() or ${dayOfWeek}&gt;adapi-weekday()`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);
		});
	});

	describe('Playlist tools component checkConditionalExp advanced expressions - AND with < and >', () => {
		it('Should return correct response', () => {
			let dayTime = moment().subtract(1, 'hour').format('HH:mm:ss');
			let testExpression = `adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))<=0 and adapi-compare(substring-after(adapi-date(), \'T\'), \''${dayTime}\')>=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			testExpression = `adapi-compare(adapi-date(), \'2010-01-01T00:00:00\')>0 and adapi-compare(\'2030-01-01T00:00:00\', adapi-date())>0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			testExpression = `adapi-compare(adapi-date(), \'2010-01-01T00:00:00\')>0 and adapi-compare(\'2010-01-01T00:00:00\', adapi-date())>0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			let dayOfWeek = (moment().isoWeekday() + 1) % 7;
			testExpression = `adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))<=0 and ${dayOfWeek}>=adapi-weekday()`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);

			testExpression = `adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))<=0 and ${dayOfWeek}<=adapi-weekday()`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			dayOfWeek = moment().isoWeekday();
			testExpression = `adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))<=0 and ${dayOfWeek}=adapi-weekday() and ${dayOfWeek}>=adapi-weekday()
			and adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))<=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);
		});
	});

	describe('Playlist tools component checkConditionalExp not supported expression', () => {
		it('Should return correct response', () => {
			let dayTime = moment().subtract(1, 'hour').format('HH:mm:ss');
			let testExpression = 'adapi-compare(\'f1835d9f-be8f-4054-9e6c-123456789012\', smil-playerIdd())';
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			testExpression = 'adapi-compare(\'testing\', smil-playerrrNameeee())';
			expect(checkConditionalExp(testExpression, 'testing', '')).to.be.equal(false);

			testExpression = 'adapi-compare(smil-playerIdd(), \'f1835d9f-be8f-4054-9e6c-123456789012\')';
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			testExpression = 'adapi-compare(smil-playerNameeee(), \'testing\')';
			expect(checkConditionalExp(testExpression, 'testing', '')).to.be.equal(false);

			testExpression = `adapi-commmmpare(adapi-date(), \'2010-01-01T00:00:00\')>0 and adapi-compare(\'2050-01-01T00:00:00\', adapi-date())>0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			testExpression = `adapi-commmmpare(adapi-date(), \'2010-01-01T00:00:00\')>0 and adapi-compare(\'2050-01-01T00:00:00\', adapi-daaaaate())>0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			let dayOfWeek = moment().isoWeekday();
			testExpression = `adapi-compare(\'${dayTime}\', substrrrrrring-after(adapi-date(), \'T\'))<=0 and ${dayOfWeek}=adapi-weekday() and ${dayOfWeek}>=adapi-weekday()
			and adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))<=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(false);

			testExpression = `adapi-compare(\'${dayTime}\', substrrrrrring-after(adapi-date(), \'T\'))<=0 or ${dayOfWeek}=adapi-weekday() or ${dayOfWeek}>=adapi-weekday()
			or adapi-compare(\'${dayTime}\', substring-after(adapi-date(), \'T\'))<=0`;
			expect(checkConditionalExp(testExpression)).to.be.equal(true);
		});
	});
});
