import { expect } from 'chai';
import { createLogger, LoggerFactory } from '../loggers';
import { LogEntry, Logger } from '../index';
import { LoggerHost } from '../loggers';

const entry = (message: string): LogEntry => ({ level: 'debug', namespace: 'ns', message, args: [], timestamp: 1 });

function recorder(): { logger: Logger; seen: string[] } {
	const seen: string[] = [];
	return {
		logger: {
			write: (e) => {
				seen.push(e.message);
			},
		},
		seen,
	};
}

describe('createLogger', () => {
	let config: Record<string, string | number | boolean>;
	let sos: LoggerHost;
	let a: ReturnType<typeof recorder>;
	let b: ReturnType<typeof recorder>;
	let constructed: string[];
	let factories: Record<string, LoggerFactory>;

	beforeEach(() => {
		config = {};
		sos = { config } as unknown as LoggerHost;
		a = recorder();
		b = recorder();
		constructed = [];
		factories = {
			console: () => {
				constructed.push('console');
				return a.logger;
			},
			other: () => {
				constructed.push('other');
				return b.logger;
			},
		};
	});

	it('uses console when sos.config.logger is unset', () => {
		createLogger(sos, factories).write(entry('x'));
		expect(a.seen).to.deep.equal(['x']);
		expect(b.seen).to.deep.equal([]);
	});

	it('selects the logger named in config', () => {
		config.logger = 'other';
		createLogger(sos, factories).write(entry('x'));
		expect(b.seen).to.deep.equal(['x']);
	});

	it('falls back to console for an unknown name', () => {
		config.logger = 'nope';
		createLogger(sos, factories).write(entry('x'));
		expect(a.seen).to.deep.equal(['x']);
	});

	it('follows a config change made after construction without rebuilding an unchanged selection', () => {
		const logger = createLogger(sos, factories);
		logger.write(entry('1'));
		logger.write(entry('2'));
		config.logger = 'other';
		logger.write(entry('3'));
		expect(a.seen).to.deep.equal(['1', '2']);
		expect(b.seen).to.deep.equal(['3']);
		expect(constructed).to.deep.equal(['console', 'other']);
	});

	it('rebuilds the selected logger when loggerUrl changes under the same name', () => {
		config.logger = 'other';
		const logger = createLogger(sos, factories);
		logger.write(entry('1'));
		config.loggerUrl = 'http://a.example/';
		logger.write(entry('2'));
		config.loggerUrl = 'http://b.example/';
		logger.write(entry('3'));
		logger.write(entry('4'));
		expect(constructed).to.deep.equal(['other', 'other', 'other']);
		expect(b.seen).to.deep.equal(['1', '2', '3', '4']);
	});

	it('fans out to every logger in a comma-separated list, building each once', () => {
		config.logger = 'console, other';
		const logger = createLogger(sos, factories);
		logger.write(entry('1'));
		logger.write(entry('2'));
		expect(a.seen).to.deep.equal(['1', '2']);
		expect(b.seen).to.deep.equal(['1', '2']);
		expect(constructed).to.deep.equal(['console', 'other']);
	});

	it('accepts an array, drops unknown and duplicate names, falls back to console when none is known', () => {
		(config as Record<string, unknown>).logger = ['other', 'nope', 'other'];
		createLogger(sos, factories).write(entry('x'));
		expect(b.seen).to.deep.equal(['x']);
		expect(constructed).to.deep.equal(['other']);
		config.logger = 'nope,,';
		createLogger(sos, factories).write(entry('y'));
		expect(a.seen).to.deep.equal(['y']);
	});

	it('substitutes console once for a factory that returns undefined, never printing twice', () => {
		factories.incomplete = () => undefined;
		config.logger = 'console,incomplete';
		createLogger(sos, factories).write(entry('x'));
		expect(a.seen).to.deep.equal(['x']);
		expect(constructed).to.deep.equal(['console']);
		config.logger = 'incomplete,other';
		createLogger(sos, factories).write(entry('y'));
		expect(a.seen).to.deep.equal(['x', 'y']);
		expect(b.seen).to.deep.equal(['y']);
	});

	it('keeps writing to the other loggers when one throws', () => {
		factories.boom = () => ({
			write: () => {
				throw new Error('boom');
			},
		});
		config.logger = 'boom,other';
		createLogger(sos, factories).write(entry('x'));
		expect(b.seen).to.deep.equal(['x']);
	});

	it('stops replaced loggers when the selection changes', () => {
		const stopped: string[] = [];
		factories.other = () => ({ write: b.logger.write, stop: () => stopped.push('other') });
		config.logger = 'other';
		const logger = createLogger(sos, factories);
		logger.write(entry('1'));
		logger.write(entry('2'));
		expect(stopped).to.deep.equal([]);
		config.logger = 'console';
		logger.write(entry('3'));
		expect(stopped).to.deep.equal(['other']);
		expect(a.seen).to.deep.equal(['3']);
	});

	it('does not construct any logger until the first write', () => {
		createLogger(sos, factories);
		expect(constructed).to.deep.equal([]);
	});
});
