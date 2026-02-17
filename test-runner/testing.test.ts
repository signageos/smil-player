import { test } from '@playwright/test';
import { DUID, SMILUrls } from './config';

test('manual debug: testing.smil', async ({ page, context }) => {
	page.on('console', msg => console.log(`[PAGE] ${msg.text().substring(0, 200)}`));
	page.on('pageerror', err => console.log(`[PAGE ERROR] ${err.message}`));
	page.on('framenavigated', frame => console.log(`[NAV] ${frame.url().substring(0, 120)}`));

	await context.addInitScript((url: string) => {
		(window as any).__SMIL_URL__ = url;
	}, SMILUrls.testing);

	await page.goto(`/?duid=${DUID}`);

	// Keep browser open indefinitely for manual observation
	await new Promise(() => {});
});
