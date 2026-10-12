import { expect } from 'chai';
import { createLogger, LoggerFactory } from '../../../src/loggers';
import { LogEntry, Logger } from '../../../src/logger';
import { ISos } from '../../../src/models/sosModels';

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
	let sos: ISos;
	let a: ReturnType<typeof recorder>;
	let b: ReturnType<typeof recorder>;
	let constructed: string[];
	let factories: Record<string, LoggerFactory>;

	beforeEach(() => {
		config = {};
		sos = { config } as unknown as ISos;
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

	it('does not construct any logger until the first write', () => {
		createLogger(sos, factories);
		expect(constructed).to.deep.equal([]);
	});
});
