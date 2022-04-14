const express = require('express');
const fs = require('fs').promises;

import { TestServer } from '../enums/enums';
import { fillWallclock } from './localServerTools';

const app = express();
const port = TestServer.port;

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
