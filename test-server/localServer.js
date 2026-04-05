"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const enums_1 = require("./enums");
const localServerTools_1 = require("./localServerTools");
const app = express();
const port = enums_1.TestServer.port;
app.use(express.json());
// In-memory request count per file for the /dynamic-update/ endpoint
const requestCounts = {};
// In-memory report capture for custom endpoint reporting tests
const reportHistory = [];
// Configurable HTTP status codes for /status-check/ endpoint
const statusConfig = {};
// Fallback SMIL config: returns valid SMIL for first N requests, then broken XML
const fallbackConfig = {};
// Allow cross-origin requests from the emulator (localhost:8090)
app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST');
    res.header('Access-Control-Allow-Headers', '*');
    next();
});
// Reset server state between tests
app.post('/reset', (_req, res) => {
    Object.keys(requestCounts).forEach(key => delete requestCounts[key]);
    reportHistory.length = 0;
    Object.keys(statusConfig).forEach(key => delete statusConfig[key]);
    Object.keys(fallbackConfig).forEach(key => delete fallbackConfig[key]);
    res.json({ ok: true });
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
    let fileString = await fs.readFile(`./${enums_1.TestServer.dynamicTestFilesPath}/${fileName}`, 'utf8');
    fileString = localServerTools_1.fillWallclock(fileString, fileName, count);
    // After Phase 2 (count >= 2), return stable Last-Modified matching HEAD to stop reloads.
    const lastModified = count >= 2
        ? new Date(2000000000000).toUTCString()
        : new Date(Date.now() + count * 1000).toUTCString();
    res.set({ 'Content-Disposition': `attachment; filename=\"${fileName}\"`, 'Content-type': 'text/xml', 'Last-Modified': lastModified, 'Cache-Control': 'no-cache, no-store' });
    res.send(fileString);
});
// Redirect endpoint: returns 302 with Location header to the actual static asset.
// Used for testing that the SMIL player correctly handles media URLs with query params
// that redirect to the real file location.
app.get('/redirect/:fileName', (req, res) => {
    const fileName = req.params.fileName;
    const actualUrl = `http://localhost:${port}/assets/${fileName}`;
    res.redirect(302, actualUrl);
});
// --- Custom endpoint reporting: capture POST payloads, expose via GET ---
app.post('/report', (req, res) => {
    reportHistory.push({ receivedAt: new Date().toISOString(), body: req.body });
    res.json({ ok: true });
});
app.get('/report/history', (_req, res) => {
    res.json(reportHistory);
});
// --- Configurable HTTP status for HEAD requests (skipContentOnHttpStatus tests) ---
app.post('/status-config', (req, res) => {
    const { fileName, statusCode } = req.body;
    statusConfig[fileName] = statusCode;
    res.json({ ok: true });
});
app.head('/status-check/:fileName', (req, res) => {
    const fileName = req.params.fileName;
    const statusCode = statusConfig[fileName] || 200;
    res.status(statusCode).set({
        'Content-type': 'application/octet-stream',
        'Last-Modified': new Date(2000000000000).toUTCString(),
        'Cache-Control': 'no-cache, no-store',
    }).end();
});
// --- Fallback SMIL: valid for first N requests, then broken XML ---
app.post('/fallback-config', (req, res) => {
    const { fileName, invalidAfterCount } = req.body;
    fallbackConfig[fileName] = { invalidAfterCount, count: 0 };
    res.json({ ok: true });
});
app.head('/fallback-smil/:fileName', (_req, res) => {
    res.set({
        'Content-type': 'text/xml',
        'Last-Modified': new Date(Date.now()).toUTCString(),
        'Cache-Control': 'no-cache, no-store',
    }).end();
});
app.get('/fallback-smil/:fileName', async (req, res) => {
    const fileName = req.params.fileName;
    const config = fallbackConfig[fileName] || { invalidAfterCount: 999, count: 0 };
    config.count += 1;
    fallbackConfig[fileName] = config;
    if (config.count > config.invalidAfterCount) {
        res.set({ 'Content-type': 'text/xml', 'Cache-Control': 'no-cache, no-store' });
        res.send('THIS IS NOT VALID XML <broken>');
    }
    else {
        let fileString = await fs.readFile(`./${enums_1.TestServer.testFilesPath}/dynamic/${fileName}`, 'utf8');
        res.set({
            'Content-Disposition': `attachment; filename=\"${fileName}\"`,
            'Content-type': 'text/xml',
            'Cache-Control': 'no-cache, no-store',
        });
        res.send(fileString);
    }
});
app.use(express.static(path.join(process.env.PWD, enums_1.TestServer.testFilesPath)));
app.listen(port, () => console.log(`Test server started on port ${port}!`));
