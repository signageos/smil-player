import * as chai from 'chai';
import { LogEntry } from '../../../src/logger/types';
import { RemoteLogger } from '../../../src/loggers/remoteLogger';

const expect = chai.expect;

// tslint:disable-next-line:no-var-requires
const { JSDOM } = require('jsdom');
if (typeof (global as any).window === 'undefined') {
	const dom = new JSDOM('<!doctype html><html><body></body></html>');
	(global as any).window = dom.window;
}

interface SentRequest {
	method: string;
	url: string;
	headers: Record<string, string>;
	body: string;
}

const sent: SentRequest[] = [];
let xhrBehaviour: 'ok' | 'throwOnOpen' | 'throwOnSend' = 'ok';

class FakeXhr {
	private method: string = '';
	private url: string = '';
	private headers: Record<string, string> = {};
	public open(method: string, url: string): void {
		if (xhrBehaviour === 'throwOnOpen') {
			throw new Error('blocked');
		}
		this.method = method;
		this.url = url;
	}
	public setRequestHeader(name: string, value: string): void {
		this.headers[name] = value;
	}
	public send(body: string): void {
		if (xhrBehaviour === 'throwOnSend') {
			throw new Error('network down');
		}
		sent.push({ method: this.method, url: this.url, headers: this.headers, body });
	}
}

function entry(partial: Partial<LogEntry> = {}): LogEntry {
	return {
		level: 'debug',
		namespace: '@signageos/smil-player:test',
		message: 'hello %s',
		args: ['world'],
		timestamp: 1760300000000,
		...partial,
	};
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('RemoteLogger', () => {
	const originalXhr = (global as any).XMLHttpRequest;
	let enabled: boolean;
	let loggers: RemoteLogger[];

	const make = (opts: { flushMs?: number; maxEntries?: number; deviceId?: () => Promise<string> } = {}) => {
		const logger = new RemoteLogger(
			'http://logs.example/in',
			() => enabled,
			opts.deviceId || (() => Promise.resolve('SN-123')),
			{ flushMs: opts.flushMs === undefined ? 0 : opts.flushMs, maxEntries: opts.maxEntries },
		);
		loggers.push(logger);
		return logger;
	};

	beforeEach(() => {
		(global as any).XMLHttpRequest = FakeXhr;
		sent.length = 0;
		xhrBehaviour = 'ok';
		enabled = true;
		loggers = [];
	});

	afterEach(() => {
		loggers.forEach((l) => l.stop());
		(global as any).XMLHttpRequest = originalXhr;
	});

	it('writes nothing and sends nothing while the predicate is false', () => {
		enabled = false;
		const logger = make();
		logger.write(entry());
		logger.flush();
		expect(sent).to.deep.equal([]);
	});

	it('treats a throwing predicate as disabled', () => {
		const logger = new RemoteLogger(
			'http://logs.example/in',
			() => {
				throw new Error('boom');
			},
			() => Promise.resolve('SN'),
			{ flushMs: 0 },
		);
		loggers.push(logger);
		expect(() => logger.write(entry())).to.not.throw();
		logger.flush();
		expect(sent).to.deep.equal([]);
	});

	it('flush is a no-op when the buffer is empty', () => {
		make().flush();
		expect(sent).to.deep.equal([]);
	});

	it('POSTs rendered entries as JSON with text/plain content type and the resolved deviceId', async () => {
		const logger = make();
		await tick(); // let getDeviceId resolve
		logger.write(entry());
		logger.write(entry({ level: 'error', message: 'failed: %O', args: [{ code: 7 }], timestamp: 1760300000001 }));
		logger.flush();
		expect(sent).to.have.length(1);
		expect(sent[0].method).to.equal('POST');
		expect(sent[0].url).to.equal('http://logs.example/in');
		expect(sent[0].headers['Content-Type']).to.equal('text/plain');
		expect(JSON.parse(sent[0].body)).to.deep.equal({
			deviceId: 'SN-123',
			entries: [
				{ timestamp: 1760300000000, level: 'debug', namespace: '@signageos/smil-player:test', text: 'hello world' },
				{ timestamp: 1760300000001, level: 'error', namespace: '@signageos/smil-player:test', text: 'failed: {"code":7}' },
			],
		});
	});

	it('reports deviceId unknown before the serial resolves', () => {
		const logger = make({ deviceId: () => new Promise<string>(() => undefined) });
		logger.write(entry());
		logger.flush();
		expect(JSON.parse(sent[0].body).deviceId).to.equal('unknown');
	});

	it('keeps deviceId unknown when the serial lookup fails', async () => {
		const logger = make({ deviceId: () => Promise.reject(new Error('no management api')) });
		await tick();
		logger.write(entry());
		logger.flush();
		expect(JSON.parse(sent[0].body).deviceId).to.equal('unknown');
	});

	it('empties the buffer after a flush so entries are sent once', () => {
		const logger = make();
		logger.write(entry());
		logger.flush();
		logger.flush();
		logger.write(entry({ message: 'second', args: [] }));
		logger.flush();
		expect(sent).to.have.length(2);
		expect(JSON.parse(sent[1].body).entries.map((e: { text: string }) => e.text)).to.deep.equal(['second']);
	});

	it('drops the oldest entries past maxEntries', () => {
		const logger = make({ maxEntries: 3 });
		['a', 'b', 'c', 'd', 'e'].forEach((m) => logger.write(entry({ message: m, args: [] })));
		logger.flush();
		expect(JSON.parse(sent[0].body).entries.map((e: { text: string }) => e.text)).to.deep.equal(['c', 'd', 'e']);
	});

	it('keeps already-buffered entries when disabled before flush', () => {
		const logger = make();
		logger.write(entry({ message: 'kept', args: [] }));
		enabled = false;
		logger.write(entry({ message: 'dropped', args: [] }));
		logger.flush();
		expect(JSON.parse(sent[0].body).entries.map((e: { text: string }) => e.text)).to.deep.equal(['kept']);
	});

	it('swallows XHR exceptions and drops the batch', () => {
		const logger = make();
		xhrBehaviour = 'throwOnSend';
		logger.write(entry());
		expect(() => logger.flush()).to.not.throw();
		xhrBehaviour = 'throwOnOpen';
		logger.write(entry());
		expect(() => logger.flush()).to.not.throw();
		xhrBehaviour = 'ok';
		logger.flush();
		expect(sent).to.deep.equal([]);
	});

	it('flushes on the interval', async () => {
		const logger = make({ flushMs: 10 });
		logger.write(entry());
		await new Promise<void>((resolve) => setTimeout(resolve, 40));
		expect(sent).to.have.length(1);
	});

	it('flushes on pagehide', () => {
		const logger = make();
		logger.write(entry());
		(global as any).window.dispatchEvent(new (global as any).window.Event('pagehide'));
		expect(sent).to.have.length(1);
	});

	it('stop() removes the interval and the pagehide listener', async () => {
		const logger = make({ flushMs: 10 });
		logger.stop();
		logger.write(entry());
		await new Promise<void>((resolve) => setTimeout(resolve, 40));
		(global as any).window.dispatchEvent(new (global as any).window.Event('pagehide'));
		expect(sent).to.deep.equal([]);
	});
});
