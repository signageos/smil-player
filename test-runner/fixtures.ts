import { test as base } from '@playwright/test';
import { createConsoleCollector } from './helpers';
import { createTestServer } from '../test-server/localServer';
import { getSmilUrls, SmilUrlsMap } from './config';

/**
 * Fatal error patterns that fail any non-sync test automatically. Matched
 * against console messages collected during the test (page.on('console') and
 * page.on('pageerror') via `createConsoleCollector`). Only application-side
 * uncaught errors should appear in this list — transient resource warnings
 * or network 404s do not belong here.
 *
 * Tests with a known-safe error that happens to match one of these patterns
 * can suppress it by appending to the per-test `allowedErrors` fixture
 * option:
 *
 *   test.use({ allowedErrors: [/known-benign-substring/i] });
 *
 * Default is empty — i.e. every pattern below is fatal unless the test
 * opts out. Keep that default empty unless you observe a recurring
 * false-positive across many tests; per-test suppression is preferred.
 */
const FATAL_PATTERNS = [
	/Uncaught TypeError/,
	/Uncaught SyntaxError/,
	/Uncaught ReferenceError/,
	/Uncaught RangeError/,
	/Cannot read properties of/,
	/is not a function/,
	/is not defined/,
];

const BASE_PORT = 3100;

type WorkerFixtures = {
	testServerPort: number;
	smilUrls: SmilUrlsMap;
	testServerBaseUrl: string;
};

type TestFixtures = {
	allowedErrors: RegExp[];
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
	// Worker-scoped: start a test server per worker on a unique port
	testServerPort: [async ({}, use, workerInfo) => {
		const port = BASE_PORT + workerInfo.workerIndex;
		const server = await createTestServer(port).start();
		await use(port);
		await server.close();
	}, { scope: 'worker' }],

	smilUrls: [async ({ testServerPort }, use) => {
		await use(getSmilUrls(testServerPort));
	}, { scope: 'worker' }],

	testServerBaseUrl: [async ({ testServerPort }, use) => {
		await use(`http://localhost:${testServerPort}`);
	}, { scope: 'worker' }],

	allowedErrors: [[], { option: true }],

	page: async ({ page, request, testServerBaseUrl, allowedErrors }, use) => {
		// Test-run isolation: Playwright's default per-test `context` fixture
		// gives a fresh BrowserContext, which isolates indexedDB / localStorage /
		// cookies at both the emulator (:8090) and applet (:8091) origins. That
		// is why we do not need a goto+clear+goto storage wipe here — verified
		// empirically 2026-04-15 (see docs/superpowers/plans/2026-04-15-stability-
		// edge-case-roadmap.md Task 1A). Don't share contexts across tests.
		const collector = createConsoleCollector(page);
		// Reset test server state before each test to prevent interference
		await request.post(`${testServerBaseUrl}/reset`);
		await use(page);
		// Teardown: check for fatal JS errors captured during the test
		const fatal = collector.errors.filter((err) =>
			FATAL_PATTERNS.some((p) => p.test(err))
			&& !allowedErrors.some((p) => p.test(err)),
		);
		if (fatal.length > 0) {
			throw new Error(
				`Test produced ${fatal.length} fatal JS error(s):\n`
				+ fatal.map((e) => `  - ${e}`).join('\n'),
			);
		}
	},
});

export { expect } from '@playwright/test';
