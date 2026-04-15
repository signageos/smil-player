import * as chai from 'chai';
import { parseOfflineReportLines } from '../../../src/components/files/tools/offlineReports';

const expect = chai.expect;

/**
 * Coverage for the pure helper extracted from
 * `FilesManager.watchCustomEndpointReports` on behalf of roadmap Task 3G.
 * Guards the 4D fix (commit 81be526): a single malformed JSON line in an
 * offline-report batch file MUST NOT throw out the whole batch — only
 * that line is dropped; every other valid line still reaches the
 * downstream sender.
 */
describe('parseOfflineReportLines', () => {
	it('parses every line when all are valid JSON', () => {
		const content = '{"event":"click","time":1}\n{"event":"view","time":2}';
		const result = parseOfflineReportLines(content, 'reports.0.csv');
		expect(result).to.have.length(2);
		expect(result[0]).to.deep.equal({ event: 'click', time: 1 });
		expect(result[1]).to.deep.equal({ event: 'view', time: 2 });
	});

	it('ignores empty lines (e.g. trailing newline)', () => {
		const content = '{"event":"click"}\n\n{"event":"view"}\n';
		const result = parseOfflineReportLines(content, 'reports.0.csv');
		expect(result).to.have.length(2);
	});

	it('drops a single malformed line and keeps the rest [4D regression]', () => {
		// Middle line is malformed. Pre-fix, JSON.parse would throw and
		// the enclosing try/catch in FilesManager would abandon the whole
		// batch — both valid lines lost. Post-fix, only the bad line is
		// dropped.
		const content =
			'{"event":"click","time":1}\n'
			+ '{not valid json\n'
			+ '{"event":"view","time":2}';
		const result = parseOfflineReportLines(content, 'reports.0.csv');
		expect(result).to.have.length(2);
		expect((result[0] as any).event).to.equal('click');
		expect((result[1] as any).event).to.equal('view');
	});

	it('returns empty array when every line is malformed', () => {
		const content = 'not json\nalso not json';
		const result = parseOfflineReportLines(content, 'reports.0.csv');
		expect(result).to.eql([]);
	});

	it('returns empty array for empty file content', () => {
		const result = parseOfflineReportLines('', 'reports.0.csv');
		expect(result).to.eql([]);
	});
});
