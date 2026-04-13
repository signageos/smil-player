import * as chai from 'chai';
import { extractSyncIndex } from '../../../test-runner/sync/syncAssertions';

const expect = chai.expect;

describe('extractSyncIndex', () => {
	// Representative log lines captured verbatim from a passing sync-diagnostic run.
	// If the player's log format changes, these strings must be updated in lockstep
	// with SYNC_INDEX_PATTERNS or the sync e2e suite will silently stop observing
	// syncIndex and every Group D/E assertion will time out.
	const fixtures: Array<{ text: string; expected: number }> = [
		{ text: '[sync] main-7-ack-prepared delivered', expected: 7 },
		{ text: 'Master received all main-12-ack-playing ACKs for region', expected: 12 },
		{ text: 'Broadcasted sync message: cmd-prepare main 3 [1-5] color1 color2', expected: 3 },
		{ text: '[timedDebug] main syncIndex=42 waiting for cmd-play', expected: 42 },
	];

	fixtures.forEach(({ text, expected }) => {
		it(`extracts ${expected} from "${text.slice(0, 50)}..."`, () => {
			expect(extractSyncIndex(text)).to.equal(expected);
		});
	});

	it('returns null for lines with no syncIndex marker', () => {
		expect(extractSyncIndex('Master elected for group foo')).to.be.null;
		expect(extractSyncIndex('')).to.be.null;
	});
});
