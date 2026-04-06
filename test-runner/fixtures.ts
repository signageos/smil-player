import { test as base } from '@playwright/test';

export const test = base.extend({
	page: async ({ page, request }, use) => {
		// Reset test server state before each test to prevent interference
		await request.post('http://localhost:3000/reset');
		await use(page);
	},
});
export { expect } from '@playwright/test';
