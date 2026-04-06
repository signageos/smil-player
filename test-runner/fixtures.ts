import { test as base } from '@playwright/test';
import { createConsoleCollector } from './helpers';
import { createTestServer } from '../test-server/localServer';
import { getSmilUrls, SmilUrlsMap } from './config';

/** Fatal error patterns that should fail tests automatically */
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
