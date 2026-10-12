import * as chai from 'chai';
import { Log, noopLog, noopLogger } from '../../../src/logger/log';
import { LogEntry, Logger } from '../../../src/logger/types';

const expect = chai.expect;

function capture(): { logger: Logger; entries: LogEntry[] } {
	const entries: LogEntry[] = [];
	return {
		logger: {
			write: (e) => {
				entries.push(e);
			},
		},
		entries,
	};
}

describe('Log', () => {
	it('writes an entry with level, namespace, message, args by identity and a numeric timestamp', () => {
		const { logger, entries } = capture();
		const args = [1, { a: 2 }];
		new Log(logger, 'ns').debug('m=%s', ...args);
		expect(entries).to.have.length(1);
		expect(entries[0].level).to.equal('debug');
		expect(entries[0].namespace).to.equal('ns');
		expect(entries[0].message).to.equal('m=%s');
		expect(entries[0].args[1]).to.equal(args[1]); // same reference, not a copy
		expect(entries[0].timestamp).to.be.a('number');
	});

	it('maps info/warn/error to their levels', () => {
		const { logger, entries } = capture();
		const log = new Log(logger, 'ns');
		log.info('i');
		log.warn('w');
		log.error('e');
		expect(entries.map((e) => e.level)).to.deep.equal(['info', 'warn', 'error']);
	});

	it('child() concatenates the namespace with ":" and shares the logger', () => {
		const { logger, entries } = capture();
		const child = new Log(logger, '@signageos/smil-player').child('filesManager');
		expect(child.namespace).to.equal('@signageos/smil-player:filesManager');
		child.debug('x');
		expect(entries[0].namespace).to.equal('@signageos/smil-player:filesManager');
	});

	it('swallows exceptions thrown by the logger', () => {
		const log = new Log(
			{
				write: () => {
					throw new Error('broken sink');
				},
			},
			'ns',
		);
		expect(() => log.debug('x')).not.to.throw();
	});

	it('noopLogger and noopLog do nothing and do not throw', () => {
		expect(() =>
			noopLogger.write({ level: 'debug', namespace: 'n', message: 'm', args: [], timestamp: 0 }),
		).not.to.throw();
		expect(() => noopLog.debug('x')).not.to.throw();
	});
});
