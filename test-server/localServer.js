"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTestServer = createTestServer;
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const enums_1 = require("./enums");
const localServerTools_1 = require("./localServerTools");
function createTestServer(serverPort) {
    if (serverPort === undefined) serverPort = enums_1.TestServer.port;
    const app = express();
    const port = serverPort;
    app.use(express.json());
    const requestCounts = {};
    const reportHistory = [];
    const statusConfig = {};
    const fallbackConfig = {};
    app.use((_req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST');
        res.header('Access-Control-Allow-Headers', '*');
        next();
    });
    app.post('/reset', (_req, res) => {
        Object.keys(requestCounts).forEach(key => delete requestCounts[key]);
        reportHistory.length = 0;
        Object.keys(statusConfig).forEach(key => delete statusConfig[key]);
        Object.keys(fallbackConfig).forEach(key => delete fallbackConfig[key]);
        res.json({ ok: true });
    });
    function rewriteSmilPort(content) {
        if (port === 3000) return content;
        return content.replace(/localhost:3000/g, `localhost:${port}`);
    }
    app.get('/dynamic/:fileName', async (req, res) => {
        const fileName = req.params.fileName;
        let fileString = await fs.readFile(`./${enums_1.TestServer.dynamicTestFilesPath}/${fileName}`, 'utf8');
        fileString = localServerTools_1.fillWallclock(fileString, fileName);
        fileString = rewriteSmilPort(fileString);
        res.set({ 'Content-Disposition': `attachment; filename=\"${fileName}\"`, 'Content-type': 'text/xml' });
        res.send(fileString);
    });
    app.head('/dynamic-update/:fileName', (req, res) => {
        const fileName = req.params.fileName;
        const count = requestCounts[fileName] || 1;
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
        fileString = rewriteSmilPort(fileString);
        const lastModified = count >= 2
            ? new Date(2000000000000).toUTCString()
            : new Date(Date.now() + count * 1000).toUTCString();
        res.set({ 'Content-Disposition': `attachment; filename=\"${fileName}\"`, 'Content-type': 'text/xml', 'Last-Modified': lastModified, 'Cache-Control': 'no-cache, no-store' });
        res.send(fileString);
    });
    app.all('/redirect/:fileName', (req, res) => {
        const fileName = req.params.fileName;
        const actualUrl = `http://localhost:${port}/assets/${fileName}`;
        res.set('Location', actualUrl);
        res.status(204).end();
    });
    app.post('/report', (req, res) => {
        reportHistory.push({ receivedAt: new Date().toISOString(), body: req.body });
        res.json({ ok: true });
    });
    app.get('/report/history', (_req, res) => {
        res.json(reportHistory);
    });
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
            fileString = rewriteSmilPort(fileString);
            res.set({
                'Content-Disposition': `attachment; filename=\"${fileName}\"`,
                'Content-type': 'text/xml',
                'Cache-Control': 'no-cache, no-store',
            });
            res.send(fileString);
        }
    });
    if (port !== 3000) {
        app.get(/\.smil$/, async (req, res, next) => {
            const filePath = path.join(process.env.PWD, enums_1.TestServer.testFilesPath, req.path);
            try {
                let content = await fs.readFile(filePath, 'utf8');
                content = rewriteSmilPort(content);
                res.set('Content-type', 'text/xml');
                res.send(content);
            }
            catch (_e) {
                next();
            }
        });
    }
    app.use(express.static(path.join(process.env.PWD, enums_1.TestServer.testFilesPath)));
    return {
        start: () => {
            return new Promise((resolve) => {
                const server = app.listen(port, () => {
                    console.log(`Test server started on port ${port}!`);
                    resolve({
                        port,
                        close: () => new Promise((res) => server.close(() => res())),
                    });
                });
            });
        },
    };
}
// Standalone mode
if (require.main === module) {
    const port = parseInt(process.env.TEST_SERVER_PORT || String(enums_1.TestServer.port), 10);
    createTestServer(port).start();
}
