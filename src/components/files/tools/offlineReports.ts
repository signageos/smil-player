import { CustomEndpointReport } from '../../../models/reportingModels';
import { debug } from './index';

/**
 * Parse an offline-report batch file into the report objects it contains.
 *
 * Each non-empty line is a JSON-encoded `CustomEndpointReport`. Malformed
 * JSON on any single line MUST NOT torch the rest of the batch — the bad
 * line is logged (with a snippet + the owning file path) and dropped,
 * while every other valid line is still returned. This protects the
 * offline-report pipeline from a single corrupted write (e.g. a partial
 * flush on power loss) consuming the entire file's contents.
 *
 * Extracted from `FilesManager.watchCustomEndpointReports` so the logic
 * is unit-testable without mocking the `sos` SDK.
 */
export function parseOfflineReportLines(
	fileContent: string,
	filePath: string,
): CustomEndpointReport[] {
	return fileContent
		.split('\n')
		.map((jsonString): CustomEndpointReport | undefined => {
			if (jsonString.length === 0) return undefined;
			try {
				return JSON.parse(jsonString);
			} catch (err) {
				debug(
					'[files] failed to parse offline report line: file=%s, snippet=%s, error=%O',
					filePath,
					jsonString.slice(0, 100),
					err,
				);
				return undefined;
			}
		})
		.filter((item): item is CustomEndpointReport => item !== undefined);
}
