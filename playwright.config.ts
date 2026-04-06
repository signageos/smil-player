import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './test-runner',
	timeout: 180000,
	retries: 1,
	use: {
		baseURL: 'http://localhost:8090',
		viewport: { width: 1920, height: 1080 },
		headless: true,
		bypassCSP: true,
	},
	webServer: [
		{
			command: 'npm run start-emulator',
			url: 'http://localhost:8090',
			reuseExistingServer: true,
			timeout: 30000,
		},
		// Test server removed — each worker starts its own via worker-scoped fixture
	],
});
