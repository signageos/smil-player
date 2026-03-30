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

// Stateful endpoint: tracks request count per file, returns incrementing Last-Modified
// header to trigger the player's SMIL update detection via ResourceChecker.
app.get('/dynamic-update/:fileName', async (req, res) => {
	const fileName = req.params.fileName;
	const count = (requestCounts[fileName] = (requestCounts[fileName] || 0) + 1);

	let fileString = await fs.readFile(`./${TestServer.dynamicTestFilesPath}/${fileName}`, 'utf8');
	fileString = fillWallclock(fileString, fileName, count);

	const lastModified = new Date(Date.now() + count * 1000).toUTCString();
	res.set({ 'Content-Disposition': `attachment; filename=\"${fileName}\"`, 'Content-type': 'text/xml', 'Last-Modified': lastModified });
	res.send(fileString);
});

app.get('/:fileName', (req, res) => {
	res.sendFile(`./${TestServer.testFilesPath}/${req.params.fileName}`, { root: process.env.PWD });
});

app.listen(port, () => console.log(`Test server started on port ${port}!`));
