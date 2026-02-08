import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './test-runner',
	timeout: 180000,
	use: {
		baseURL: 'http://localhost:8090',
		viewport: { width: 1080, height: 1920 },
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
		{
			command: 'node test-server/localServer.js',
			url: 'http://localhost:3000/zonesCypress.smil',
			reuseExistingServer: true,
			timeout: 10000,
		},
	],
});
