const express = require('express');
const fs = require('fs').promises;

import { TestServer } from './enums';
import { fillWallclock } from './localServerTools';

const app = express();
const port = TestServer.port;

// In-memory request count per file for the /dynamic-update/ endpoint
const requestCounts: Record<string, number> = {};

// Allow cross-origin requests from the emulator (localhost:8090)
app.use((_req, res, next) => {
	res.header('Access-Control-Allow-Origin', '*');
	res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
	res.header('Access-Control-Allow-Headers', '*');
	next();
});

// Reset server state between tests (clears request counters for /dynamic-update/ endpoint)
app.post('/reset', (_req, res) => {
	Object.keys(requestCounts).forEach(key => delete requestCounts[key]);
	res.json({ ok: true });
});

app.get('/assets/:fileName', (req, res) => {
	res.sendFile(`./${TestServer.assetsPath}/${req.params.fileName}`, { root: process.env.PWD });
});

app.get('/dynamic/:fileName', async (req, res) => {
	const fileName = req.params.fileName;
	let fileString = await fs.readFile(`./${TestServer.dynamicTestFilesPath}/${fileName}`, 'utf8');
	fileString = fillWallclock(fileString, fileName);
	res.set({ 'Content-Disposition': `attachment; filename=\"${fileName}\"`, 'Content-type': 'text/xml' });
	res.send(fileString);
});

// Stateful endpoint: tracks GET request count per file, returns incrementing Last-Modified
// header to trigger the player's SMIL update detection via ResourceChecker.
// Only GET requests increment the counter — HEAD requests (used by ResourceChecker to
// check for updates) return a stable Last-Modified based on the current count.
app.head('/dynamic-update/:fileName', (req, res) => {
	const fileName = req.params.fileName;
	const count = requestCounts[fileName] || 1;
	// After Phase 2 (count >= 2), return stable Last-Modified to prevent infinite reload cycle.
	// Phase 1: varying Last-Modified triggers the first update detection.
	const lastModified = count >= 2
		? new Date(2000000000000).toUTCString()
		: new Date(Date.now() + count * 1000).toUTCString();
	res.set({ 'Content-type': 'text/xml', 'Last-Modified': lastModified, 'Cache-Control': 'no-cache, no-store' });
	res.end();
});

app.get('/dynamic-update/:fileName', async (req, res) => {
	const fileName = req.params.fileName;
	const count = (requestCounts[fileName] = (requestCounts[fileName] || 0) + 1);

	let fileString = await fs.readFile(`./${TestServer.dynamicTestFilesPath}/${fileName}`, 'utf8');
	fileString = fillWallclock(fileString, fileName, count);

	// After Phase 2 (count >= 2), return stable Last-Modified matching HEAD to stop reloads.
	const lastModified = count >= 2
		? new Date(2000000000000).toUTCString()
		: new Date(Date.now() + count * 1000).toUTCString();
	res.set({ 'Content-Disposition': `attachment; filename=\"${fileName}\"`, 'Content-type': 'text/xml', 'Last-Modified': lastModified, 'Cache-Control': 'no-cache, no-store' });
	res.send(fileString);
});

app.get('/:fileName', (req, res) => {
	res.sendFile(`./${TestServer.testFilesPath}/${req.params.fileName}`, { root: process.env.PWD });
});

app.listen(port, () => console.log(`Test server started on port ${port}!`));
