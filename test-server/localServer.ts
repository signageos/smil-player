const express = require('express');
const fs = require('fs').promises;

import { TestServer } from './enums';
import { fillWallclock } from './localServerTools';

const app = express();
const port = TestServer.port;

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

app.get('/:fileName', (req, res) => {
	res.sendFile(`./${TestServer.testFilesPath}/${req.params.fileName}`, { root: process.env.PWD });
});

app.listen(port, () => console.log(`Test server started on port ${port}!`));
