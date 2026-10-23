import * as chai from 'chai';
import { ConsoleLogger, loggerFactories } from '../../../src/loggers';
import { RemoteLogger } from '../../../src/loggers/remoteLogger';
import { ISos } from '../../../src/models/sosModels';

const expect = chai.expect;

// tslint:disable-next-line:no-var-requires
const { JSDOM } = require('jsdom');
if (typeof (global as any).window === 'undefined') {
	const dom = new JSDOM('<!doctype html><html><body></body></html>');
	(global as any).window = dom.window;
}

function fakeSos(config: Record<string, string | number | boolean>): ISos {
	return {
		config,
		management: { getSerialNumber: () => Promise.resolve('SN-1') },
	} as unknown as ISos;
}

describe('loggerFactories.remote', () => {
	const created: RemoteLogger[] = [];
	afterEach(() => {
		created.splice(0).forEach((l) => l.stop());
	});

	it('returns a RemoteLogger when loggerUrl is set', () => {
		const logger = loggerFactories.remote(fakeSos({ loggerUrl: 'http://logs.example/in' }));
		expect(logger).to.be.instanceOf(RemoteLogger);
		created.push(logger as RemoteLogger);
	});

	it('stringifies a non-string loggerUrl rather than failing', () => {
		const logger = loggerFactories.remote(fakeSos({ loggerUrl: 12345 }));
		expect(logger).to.be.instanceOf(RemoteLogger);
		created.push(logger as RemoteLogger);
	});

	it('falls back to the console logger when loggerUrl is missing', () => {
		expect(loggerFactories.remote(fakeSos({}))).to.be.instanceOf(ConsoleLogger);
	});

	it('falls back to the console logger when loggerUrl is empty', () => {
		expect(loggerFactories.remote(fakeSos({ loggerUrl: '' }))).to.be.instanceOf(ConsoleLogger);
	});
});
