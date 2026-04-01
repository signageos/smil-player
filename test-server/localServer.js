"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require('express');
const fs = require('fs').promises;
const enums_1 = require("./enums");
const localServerTools_1 = require("./localServerTools");
const app = express();
const port = enums_1.TestServer.port;
// In-memory request count per file for the /dynamic-update/ endpoint
const requestCounts = {};
// Allow cross-origin requests from the emulator (localhost:8090)
app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.header('Access-Control-Allow-Headers', '*');
    next();
});
app.get('/assets/:fileName', (req, res) => {
    res.sendFile(`./${enums_1.TestServer.assetsPath}/${req.params.fileName}`, { root: process.env.PWD });
});
app.get('/dynamic/:fileName', async (req, res) => {
    const fileName = req.params.fileName;
    let fileString = await fs.readFile(`./${enums_1.TestServer.dynamicTestFilesPath}/${fileName}`, 'utf8');
    fileString = localServerTools_1.fillWallclock(fileString, fileName);
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
    const lastModified = new Date(Date.now() + count * 1000).toUTCString();
    res.set({ 'Content-type': 'text/xml', 'Last-Modified': lastModified });
    res.end();
});
app.get('/dynamic-update/:fileName', async (req, res) => {
    const fileName = req.params.fileName;
    const count = (requestCounts[fileName] = (requestCounts[fileName] || 0) + 1);
    let fileString = await fs.readFile(`./${enums_1.TestServer.dynamicTestFilesPath}/${fileName}`, 'utf8');
    fileString = localServerTools_1.fillWallclock(fileString, fileName, count);
    const lastModified = new Date(Date.now() + count * 1000).toUTCString();
    res.set({ 'Content-Disposition': `attachment; filename=\"${fileName}\"`, 'Content-type': 'text/xml', 'Last-Modified': lastModified });
    res.send(fileString);
});
app.get('/:fileName', (req, res) => {
    res.sendFile(`./${enums_1.TestServer.testFilesPath}/${req.params.fileName}`, { root: process.env.PWD });
});
app.listen(port, () => console.log(`Test server started on port ${port}!`));
