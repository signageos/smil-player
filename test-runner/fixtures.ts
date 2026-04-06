import { test as base } from '@playwright/test';
import { createConsoleCollector } from './helpers';

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

export const test = base.extend<{ allowedErrors: RegExp[] }>({
	allowedErrors: [[], { option: true }],
	page: async ({ page, request, allowedErrors }, use) => {
		const collector = createConsoleCollector(page);
		// Reset test server state before each test to prevent interference
		await request.post('http://localhost:3000/reset');
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
