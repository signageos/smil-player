import * as chai from 'chai';
import Debug from 'debug';
import * as util from 'util';
import { ConsoleLogger } from '../../../src/loggers/consoleLogger';
import { LogEntry } from '../../../src/logger/types';

const expect = chai.expect;

function entry(partial: Partial<LogEntry> = {}): LogEntry {
	return {
		level: 'debug',
		namespace: '@signageos/smil-player:test',
		message: 'hello %s',
		args: ['world'],
		timestamp: Date.UTC(2026, 9, 11, 10, 33, 32, 345),
		...partial,
	};
}

describe('ConsoleLogger', () => {
	let lines: string[];
	const originalDebugLog = Debug.log;
	const originalWarn = console.warn;

	beforeEach(() => {
		lines = [];
		Debug.log = (...args: unknown[]) => {
			lines.push(util.format(...args));
		};
		console.warn = (...args: unknown[]) => {
			lines.push(util.format(...args));
		};
	});

	afterEach(() => {
		Debug.log = originalDebugLog;
		console.warn = originalWarn;
	});

	it('writes nothing when the predicate is false', () => {
		new ConsoleLogger(() => false).write(entry());
		expect(lines).to.deep.equal([]);
	});

	it('re-evaluates the predicate on every write (false then true)', () => {
		let on = false;
		const logger = new ConsoleLogger(() => on);
		logger.write(entry());
		on = true;
		logger.write(entry());
		expect(lines).to.have.length(1);
	});

	it('routes debug level through the debug package with namespace, ISO timestamp and formatted message', () => {
		new ConsoleLogger(() => true).write(entry());
		expect(lines).to.have.length(1);
		expect(lines[0]).to.contain('@signageos/smil-player:test');
		expect(lines[0]).to.contain('[2026-10-11T10:33:32.345Z]');
		expect(lines[0]).to.contain('hello world');
	});

	it('routes warn level to console.warn with namespace prefix and timestamp', () => {
		new ConsoleLogger(() => true).write(entry({ level: 'warn', message: 'careful %d', args: [7] }));
		expect(lines).to.have.length(1);
		expect(lines[0]).to.equal('@signageos/smil-player:test [2026-10-11T10:33:32.345Z] careful 7');
	});

	it('writes nothing and does not throw when the predicate throws', () => {
		const logger = new ConsoleLogger(() => {
			throw new Error('config not ready');
		});
		expect(() => logger.write(entry())).not.to.throw();
		expect(lines).to.deep.equal([]);
	});

	it('does not touch localStorage.debug', () => {
		const g = global as any;
		const store: Record<string, string> = {};
		g.localStorage = {
			getItem: (k: string) => store[k] ?? null,
			setItem: (k: string, v: string) => {
				store[k] = v;
			},
			removeItem: (k: string) => {
				delete store[k];
			},
		};
		try {
			new ConsoleLogger(() => true).write(entry());
			expect(store).to.deep.equal({});
		} finally {
			delete g.localStorage;
		}
	});
});
