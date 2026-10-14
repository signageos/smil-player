import { expect } from 'chai';
import { Log, LogEntry, Logger } from '../../../src/logger';
import { TimedDebugger } from '../../../src/components/playlist/playlistProcessor/TimedDebugger';

describe('TimedDebugger', () => {
	const capture = () => {
		const entries: LogEntry[] = [];
		const logger: Logger = { write: (e) => entries.push(e) };
		return { entries, log: new Log(logger, 'test') };
	};

	it('prefixes every level with the step timing and forwards the level', () => {
		const { entries, log } = capture();
		const timed = new TimedDebugger('playElement_0', log);
		timed.debug('step %s', 'a');
		timed.warn('degraded %s', 'b');
		timed.error('broken %s', 'c');
		expect(entries.map((e) => e.level)).to.deep.equal(['debug', 'warn', 'error']);
		for (const e of entries) {
			expect(e.message).to.match(/^\[playElement_0_\d+ \+\d+ms total:\d+ms\] /);
		}
		expect(entries[1].message).to.match(/degraded %s$/);
		expect(entries[1].args).to.deep.equal(['b']);
	});
});
