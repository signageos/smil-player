import { test } from '@playwright/test';
import { DUID } from './config';

test.describe('wallclockNoActiveSeq.smil test', () => {
	test('processes smil file correctly', async ({ page, context }) => {
		await context.addInitScript((url: string) => {
			(window as any).__SMIL_URL__ = url;
		}, 'http://localhost:3000/testing.smil');

		await page.goto(`/?duid=${DUID}`);
	});
});
