"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const enums_1 = require("./enums");
const localServerTools_1 = require("./localServerTools");
/**
 * Create a test server Express app on the given port.
 * Returns an object with start() to begin listening.
 */
function createTestServer(serverPort = enums_1.TestServer.port) {
    const app = express();
    const port = serverPort;
    // Capture raw body for the /cbp-loc/log POST endpoint (checkBeforePlay report-alignment
    // test) so we can inspect what the player reports. Mounted BEFORE the global JSON parser
    // so the endpoint sees the original bytes.
    app.use('/cbp-loc/log', express.raw({ type: '*/*', limit: '5mb' }));
    app.use(express.json());
    // In-memory request count per file for the /dynamic-update/ endpoint
    const requestCounts = {};
    // In-memory report capture for custom endpoint reporting tests
    const reportHistory = [];
    // When true, /report rejects with 503 (simulates the endpoint being
    // unreachable) so the player saves reports to offline storage. Toggled via
    // /report/fail-mode for the offline-report upload test.
    let reportFailMode = false;
    // Configurable HTTP status codes for /status-check/ endpoint.
    // The 'timeout' sentinel makes the HEAD hang past the client's fileCheckTimeout
    // (2s) so the player hits the fetchingStrategies 'Request timeout' branch (408).
    const statusConfig = {};
    // Fallback SMIL config: returns valid SMIL for first N requests, then broken XML
    const fallbackConfig = {};
    // Recover SMIL config: a SMIL URL that 404s until flipped valid (broken->valid),
    // for error-recovery tests. Missing/true => broken (404); false => serve valid.
    const recoverConfig = {};
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
        Object.keys(recoverConfig).forEach(key => delete recoverConfig[key]);
        reportFailMode = false;
        res.json({ ok: true });
    });
    /** Replace hardcoded localhost:3000 in SMIL content with actual port */
    function rewriteSmilPort(content) {
        if (port === 3000)
            return content;
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
        fileString = rewriteSmilPort(fileString);
        // After Phase 2 (count >= 2), return stable Last-Modified matching HEAD to stop reloads.
        const lastModified = count >= 2
            ? new Date(2000000000000).toUTCString()
            : new Date(Date.now() + count * 1000).toUTCString();
        res.set({ 'Content-Disposition': `attachment; filename=\"${fileName}\"`, 'Content-type': 'text/xml', 'Last-Modified': lastModified, 'Cache-Control': 'no-cache, no-store' });
        res.send(fileString);
    });
    // Time-bucket refresh endpoint for multi-device sync tests. Serves the same
    // SMIL body on every GET; Last-Modified advances only after REFRESH_BUCKET_MS
    // of wall-clock has elapsed since a fixed epoch and then stabilises again at
    // REFRESH_STOP_AFTER_MS. All devices sharing the same test server see the
    // same Last-Modified at any instant, so they refresh in lockstep (unlike
    // /dynamic-update/ which is GET-count based).
    const REFRESH_BUCKET_MS = 10000;
    const REFRESH_STOP_AFTER_MS = 30000;
    const refreshOrigin = Date.now();
    const computeRefreshLastModified = () => {
        const elapsed = Date.now() - refreshOrigin;
        const bucketBase = Math.min(elapsed, REFRESH_STOP_AFTER_MS);
        const bucket = Math.floor(bucketBase / REFRESH_BUCKET_MS);
        return new Date(refreshOrigin + bucket * REFRESH_BUCKET_MS).toUTCString();
    };
    app.head('/dynamic-refresh/:fileName', (_req, res) => {
        res.set({
            'Content-type': 'text/xml',
            'Last-Modified': computeRefreshLastModified(),
            'Cache-Control': 'no-cache, no-store',
        });
        res.end();
    });
    app.get('/dynamic-refresh/:fileName', async (req, res) => {
        const fileName = req.params.fileName;
        let fileString = await fs.readFile(`./${enums_1.TestServer.dynamicTestFilesPath}/${fileName}`, 'utf8');
        fileString = rewriteSmilPort(fileString);
        res.set({
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'Content-type': 'text/xml',
            'Last-Modified': computeRefreshLastModified(),
            'Cache-Control': 'no-cache, no-store',
        });
        res.send(fileString);
    });
    // Alias route serving the same asset bytes under a distinct URL path. Lets a
    // fixture give two SMIL elements different src identities without duplicating
    // binary files (query-string variants break the player's video localFilePath
    // resolution, so ?v= tricks are not usable). Last-Modified is shifted +1h off
    // the deterministic per-name stamp so the player's moved-content dedup
    // (Last-Modified + basename identity) does not fold the alias into the
    // /assets/ original.
    app.get('/assets-b/:fileName', async (req, res) => {
        const filePath = path.join(process.env.PWD, enums_1.TestServer.assetsPath, req.params.fileName);
        try {
            await fs.stat(filePath);
        }
        catch (_a) {
            res.status(404).end();
            return;
        }
        res.set('Last-Modified', new Date(localServerTools_1.deterministicLastModifiedMs(req.params.fileName) + 3600000).toUTCString());
        res.sendFile(filePath, { lastModified: false });
    });
    // Location header endpoint: returns 204 with Location header pointing to the actual static asset.
    // Used for testing that the SMIL player correctly resolves media URLs via the
    // location header fetch strategy (updateMechanism="location").
    app.all('/redirect/:fileName', (req, res) => {
        const fileName = req.params.fileName;
        const actualUrl = `http://localhost:${port}/assets/${fileName}`;
        res.set('Location', actualUrl);
        res.status(204).end();
    });
    // Moved-content dedup harness (location strategy, copy-only).
    // Every distinct slot path 204+redirects to the SAME shared content URL.
    // Two SMIL slots with different src (e.g. /dedup/redirect/slot-one and
    // /dedup/redirect/slot-two) therefore resolve to identical content; the
    // player's parallelDownloadAllFiles dedup downloads /dedup/content/shared.jpg
    // ONCE and copies it for the second slot rather than fetching it twice.
    app.all('/dedup/redirect/:slot', (req, res) => {
        // Expose Location so the player's cross-origin (8090 -> test server) XHR can
        // read it; without this the header is hidden and the player falls back to
        // downloading the src directly (no redirect resolved, no dedup).
        res.set('Access-Control-Expose-Headers', 'Location');
        res.set('Location', `http://localhost:${port}/dedup/content/shared.jpg`);
        res.status(204).end();
    });
    app.get('/dedup/content/shared.jpg', async (req, res) => {
        const buf = await fs.readFile(`./${enums_1.TestServer.assetsPath}/landscape1.jpg`);
        res.set('Content-Type', 'image/jpeg');
        res.send(buf);
    });
    // =====================================================================
    // checkBeforePlay (cbp) test harness. Provides HEAD-logging endpoints used by the
    // checkBeforePlay / location-strategy / video-re-prepare Playwright specs.
    // HEAD requests push {file, time} into per-suite head logs so tests can
    // assert "HEAD target aligns with the currently-playing slot" and
    // "one HEAD per transition". These routes are single/multi-segment specific
    // paths registered before the .smil and static catch-alls below.
    // =====================================================================
    // 1x1 pixel PNGs (red = version 1, blue = version 2)
    const RED_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8D4HwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
    const BLUE_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==', 'base64');
    const CBP_CORS_HEADERS = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Expose-Headers': 'Last-Modified, Location, Content-Length',
        'Cache-Control': 'no-cache, no-store',
    };
    // Lazy-load the video file from disk on first request (cbp-video / cbp-loc-noext)
    let cbpVideoBuffer = null;
    async function getCbpVideoBuffer() {
        if (!cbpVideoBuffer) {
            cbpVideoBuffer = await fs.readFile(`./${enums_1.TestServer.assetsPath}/loader.mp4`);
        }
        return cbpVideoBuffer;
    }
    // --- checkBeforePlay (Last-Modified strategy) state ---
    let cbpLastModified = '2025-01-01T00:00:00.000Z';
    let cbpVersion = 1;
    const cbpImages = {};
    function resetCbpImages() {
        for (let i = 1; i <= 10; i++) {
            cbpImages[`image${i}.png`] = { lastModified: '2025-01-01T00:00:00.000Z', version: 1 };
        }
    }
    resetCbpImages();
    // Names currently in "skip mode" — HEAD/GET return 404 so the player marks
    // them skipContent (paired with skipContentOnHttpStatus="404" in the SMIL).
    const cbpSkipMode = new Set();
    // HEAD request log for verifying checkAheadCount alignment.
    let headLog = [];
    app.options('/cbp/*', (_req, res) => {
        res.set(CBP_CORS_HEADERS);
        res.sendStatus(204);
    });
    app.post('/cbp/reset', (_req, res) => {
        cbpLastModified = '2025-01-01T00:00:00.000Z';
        cbpVersion = 1;
        resetCbpImages();
        cbpSkipMode.clear();
        headLog = [];
        res.set(CBP_CORS_HEADERS);
        res.json({ version: cbpVersion, lastModified: cbpLastModified });
    });
    // Toggle "missing" mode for one image — HEAD/GET return 404 thereafter so the
    // player marks the slot skipContent when used with skipContentOnHttpStatus="404".
    app.post('/cbp/skip-mode/:name', (req, res) => {
        const name = req.params.name;
        const on = req.query.on !== '0' && req.query.on !== 'false';
        if (on) {
            cbpSkipMode.add(name);
        }
        else {
            cbpSkipMode.delete(name);
        }
        res.set(CBP_CORS_HEADERS);
        res.json({ name, skipMode: cbpSkipMode.has(name) });
    });
    app.post('/cbp/clear-head-log', (_req, res) => {
        headLog = [];
        res.set(CBP_CORS_HEADERS);
        res.json({ cleared: true });
    });
    app.get('/cbp/head-log', (_req, res) => {
        res.set(CBP_CORS_HEADERS);
        res.json(headLog);
    });
    // Single-image switch (existing single-image test)
    app.post('/cbp/switch', (_req, res) => {
        cbpVersion = cbpVersion === 1 ? 2 : 1;
        cbpLastModified = new Date().toISOString();
        res.set(CBP_CORS_HEADERS);
        res.json({ version: cbpVersion, lastModified: cbpLastModified });
    });
    // Per-image switch for the multi-element test
    app.post('/cbp/switch/:name', (req, res) => {
        const name = req.params.name;
        if (!cbpImages[name]) {
            res.status(404).json({ error: `Unknown image: ${name}` });
            return;
        }
        cbpImages[name].version = cbpImages[name].version === 1 ? 2 : 1;
        cbpImages[name].lastModified = new Date().toISOString();
        res.set(CBP_CORS_HEADERS);
        res.json({ name, version: cbpImages[name].version, lastModified: cbpImages[name].lastModified });
    });
    // Single-image routes — must be registered before the parameterized /cbp/:name routes
    app.head('/cbp/image.png', (_req, res) => {
        const png = cbpVersion === 1 ? RED_PNG : BLUE_PNG;
        res.set(Object.assign(Object.assign({}, CBP_CORS_HEADERS), { 'Content-Type': 'image/png', 'Content-Length': String(png.length), 'Last-Modified': cbpLastModified }));
        res.status(200).end();
    });
    app.get('/cbp/image.png', (_req, res) => {
        const png = cbpVersion === 1 ? RED_PNG : BLUE_PNG;
        res.set(Object.assign(Object.assign({}, CBP_CORS_HEADERS), { 'Content-Type': 'image/png', 'Last-Modified': cbpLastModified }));
        res.send(png);
    });
    // Per-image routes (multi-element test) — HEAD logs into headLog
    app.head('/cbp/:name', (req, res) => {
        const name = req.params.name;
        const img = cbpImages[name];
        if (!img) {
            res.status(404).end();
            return;
        }
        headLog.push({ file: name, time: Date.now() });
        if (cbpSkipMode.has(name)) {
            res.set(CBP_CORS_HEADERS);
            res.status(404).end();
            return;
        }
        const png = img.version === 1 ? RED_PNG : BLUE_PNG;
        res.set(Object.assign(Object.assign({}, CBP_CORS_HEADERS), { 'Content-Type': 'image/png', 'Content-Length': String(png.length), 'Last-Modified': img.lastModified }));
        res.status(200).end();
    });
    app.get('/cbp/:name', (req, res) => {
        const name = req.params.name;
        const img = cbpImages[name];
        if (!img) {
            res.status(404).end();
            return;
        }
        if (cbpSkipMode.has(name)) {
            res.set(CBP_CORS_HEADERS);
            res.status(404).end();
            return;
        }
        const png = img.version === 1 ? RED_PNG : BLUE_PNG;
        res.set(Object.assign(Object.assign({}, CBP_CORS_HEADERS), { 'Content-Type': 'image/png', 'Last-Modified': img.lastModified }));
        res.send(png);
    });
    // =====================================================================
    // playCheckUrl (gate) test harness. Serves the playability-gate GET endpoint
    // for the playCheckUrl Playwright spec. Deliberately separate from /cbp:
    // gate URLs never serve content, proving the gate has zero download coupling.
    // =====================================================================
    // Names currently gated off — gate GET returns 404 (paired with skipPlaybackOnHttpStatus="404").
    const gateSkipMode = new Set();
    // Forced status per name (e.g. 500 for the fail-open flow). 0/absent = no override.
    const gateStatusOverride = {};
    // Forced response delay per name in ms (exceeding the SMIL timeOut simulates a
    // hanging gate endpoint -> XHR timeout on the player). 0/absent = answer immediately.
    const gateDelayMs = {};
    // Gate request log for verifying per-pass re-checks (identifiers keep the legacy "head" name).
    let gateHeadLog = [];
    app.options('/gate/*', (_req, res) => {
        res.set(CBP_CORS_HEADERS);
        res.sendStatus(204);
    });
    app.post('/gate/reset', (_req, res) => {
        gateSkipMode.clear();
        for (const key of Object.keys(gateStatusOverride)) {
            delete gateStatusOverride[key];
        }
        for (const key of Object.keys(gateDelayMs)) {
            delete gateDelayMs[key];
        }
        gateHeadLog = [];
        res.set(CBP_CORS_HEADERS);
        res.json({ reset: true });
    });
    app.post('/gate/skip-mode/:name', (req, res) => {
        const name = req.params.name;
        const on = req.query.on !== '0' && req.query.on !== 'false';
        if (on) {
            gateSkipMode.add(name);
        }
        else {
            gateSkipMode.delete(name);
        }
        res.set(CBP_CORS_HEADERS);
        res.json({ name, skipMode: gateSkipMode.has(name) });
    });
    app.post('/gate/status-override/:name', (req, res) => {
        var _a;
        const name = req.params.name;
        const status = parseInt(String(req.query.status), 10) || 0;
        if (status > 0) {
            gateStatusOverride[name] = status;
        }
        else {
            delete gateStatusOverride[name];
        }
        res.set(CBP_CORS_HEADERS);
        res.json({ name, statusOverride: (_a = gateStatusOverride[name]) !== null && _a !== void 0 ? _a : null });
    });
    app.post('/gate/delay/:name', (req, res) => {
        var _a;
        const name = req.params.name;
        const ms = parseInt(String(req.query.ms), 10) || 0;
        if (ms > 0) {
            gateDelayMs[name] = ms;
        }
        else {
            delete gateDelayMs[name];
        }
        res.set(CBP_CORS_HEADERS);
        res.json({ name, delayMs: (_a = gateDelayMs[name]) !== null && _a !== void 0 ? _a : null });
    });
    app.post('/gate/clear-head-log', (_req, res) => {
        gateHeadLog = [];
        res.set(CBP_CORS_HEADERS);
        res.json({ cleared: true });
    });
    app.get('/gate/head-log', (_req, res) => {
        res.set(CBP_CORS_HEADERS);
        res.json(gateHeadLog);
    });
    app.get('/gate/check/:name', (req, res) => {
        const name = req.params.name;
        gateHeadLog.push({ file: name, time: Date.now() });
        res.set(CBP_CORS_HEADERS);
        const answer = () => {
            if (gateStatusOverride[name]) {
                res.status(gateStatusOverride[name]).end();
                return;
            }
            res.status(gateSkipMode.has(name) ? 404 : 200).end();
        };
        if (gateDelayMs[name]) {
            setTimeout(answer, gateDelayMs[name]);
            return;
        }
        answer();
    });
    // --- checkBeforePlay location strategy state ---
    let cbpLocVersion = 1;
    const cbpLocImages = {};
    function resetCbpLocImages() {
        for (let i = 1; i <= 10; i++) {
            cbpLocImages[`image${i}.png`] = { version: 1 };
        }
    }
    resetCbpLocImages();
    let locHeadLog = [];
    // Fail mode for location strategy — simulates an unreachable / erroring update server.
    //   'off'     — normal behaviour
    //   '503'     — HEAD/content return 503
    //   'timeout' — HEAD never responds (client aborts after its timeOut)
    let cbpLocFailMode = 'off';
    app.options('/cbp-loc/*', (_req, res) => {
        res.set(CBP_CORS_HEADERS);
        res.sendStatus(204);
    });
    app.post('/cbp-loc/reset', (_req, res) => {
        cbpLocVersion = 1;
        resetCbpLocImages();
        locHeadLog = [];
        cbpLocFailMode = 'off';
        res.set(CBP_CORS_HEADERS);
        res.json({ version: cbpLocVersion });
    });
    app.post('/cbp-loc/clear-head-log', (_req, res) => {
        locHeadLog = [];
        res.set(CBP_CORS_HEADERS);
        res.json({ cleared: true });
    });
    app.get('/cbp-loc/head-log', (_req, res) => {
        res.set(CBP_CORS_HEADERS);
        res.json(locHeadLog);
    });
    // Toggle fail mode: off | 503 | timeout
    app.post('/cbp-loc/admin/fail-mode/:mode', (req, res) => {
        const mode = req.params.mode;
        cbpLocFailMode = mode === '503' || mode === 'timeout' ? mode : 'off';
        res.set(CBP_CORS_HEADERS);
        res.json({ failMode: cbpLocFailMode });
    });
    // Single-image switch
    app.post('/cbp-loc/switch', (_req, res) => {
        cbpLocVersion = cbpLocVersion === 1 ? 2 : 1;
        res.set(CBP_CORS_HEADERS);
        res.json({ version: cbpLocVersion });
    });
    // Per-image switch
    app.post('/cbp-loc/switch/:name', (req, res) => {
        const name = req.params.name;
        if (!cbpLocImages[name]) {
            res.status(404).json({ error: `Unknown image: ${name}` });
            return;
        }
        cbpLocImages[name].version = cbpLocImages[name].version === 1 ? 2 : 1;
        res.set(CBP_CORS_HEADERS);
        res.json({ name, version: cbpLocImages[name].version });
    });
    // Per-content-filename download delay (ms) — one-shot. Used by the report-alignment
    // test to force a Phase-4 commit to land during a slot's playback.
    const cbpLocContentDelay = {};
    const cbpLocContentLog = [];
    // Single-image location routes (must precede the parameterized routes)
    app.head('/cbp-loc/image.png', (_req, res) => {
        const png = cbpLocVersion === 1 ? RED_PNG : BLUE_PNG;
        res.set(Object.assign(Object.assign({}, CBP_CORS_HEADERS), { 'Content-Type': 'image/png', 'Content-Length': String(png.length), 'Location': `http://localhost:${port}/cbp-loc/content/image_v${cbpLocVersion}.png` }));
        res.status(200).end();
    });
    app.get('/cbp-loc/image.png', (_req, res) => {
        const png = cbpLocVersion === 1 ? RED_PNG : BLUE_PNG;
        res.set(Object.assign(Object.assign({}, CBP_CORS_HEADERS), { 'Content-Type': 'image/png' }));
        res.send(png);
    });
    // Test instrumentation endpoints (report-alignment test). These are multi-segment
    // so they don't collide with the single-segment GET /cbp-loc/:name route below.
    let cbpLocReportLog = [];
    app.post('/cbp-loc/log/:screenId', (req, res) => {
        let body = null;
        let bodyText = '';
        try {
            // express.raw mounted on /cbp-loc/log gives us a Buffer
            bodyText = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body);
            body = JSON.parse(bodyText);
        }
        catch (e) {
            body = { __parseError: String(e), __raw: bodyText };
        }
        cbpLocReportLog.push({ time: Date.now(), body, bodyText });
        res.set(CBP_CORS_HEADERS);
        res.json({ ok: true });
    });
    app.get('/cbp-loc/admin/log-fetch', (_req, res) => {
        res.set(CBP_CORS_HEADERS);
        res.json(cbpLocReportLog);
    });
    app.post('/cbp-loc/admin/log-reset', (_req, res) => {
        cbpLocReportLog = [];
        res.set(CBP_CORS_HEADERS);
        res.json({ cleared: true });
    });
    app.get('/cbp-loc/admin/content-log', (_req, res) => {
        res.set(CBP_CORS_HEADERS);
        res.json(cbpLocContentLog);
    });
    app.post('/cbp-loc/admin/content-log-reset', (_req, res) => {
        cbpLocContentLog.length = 0;
        res.set(CBP_CORS_HEADERS);
        res.json({ cleared: true });
    });
    app.post('/cbp-loc/admin/set-content-delay/:fileName', express.json(), (req, res) => {
        const fileName = req.params.fileName;
        const delayMs = Number((req.body && req.body.delayMs) || 0);
        if (delayMs > 0) {
            cbpLocContentDelay[fileName] = delayMs;
        }
        else {
            delete cbpLocContentDelay[fileName];
        }
        res.set(CBP_CORS_HEADERS);
        res.json({ fileName, delayMs });
    });
    // Per-image location HEAD/GET routes — HEAD returns a Location header pointing
    // at a versioned content URL and logs into locHeadLog.
    app.head('/cbp-loc/:name', (req, res) => {
        const name = req.params.name;
        const img = cbpLocImages[name];
        if (!img) {
            res.status(404).end();
            return;
        }
        locHeadLog.push({ file: name, time: Date.now() });
        if (cbpLocFailMode === 'timeout') {
            // Never respond — the client XHR aborts after its timeOut.
            return;
        }
        if (cbpLocFailMode === '503') {
            res.set(CBP_CORS_HEADERS);
            res.status(503).end();
            return;
        }
        const baseName = name.replace('.png', '');
        const png = img.version === 1 ? RED_PNG : BLUE_PNG;
        res.set(Object.assign(Object.assign({}, CBP_CORS_HEADERS), { 'Content-Type': 'image/png', 'Content-Length': String(png.length), 'Location': `http://localhost:${port}/cbp-loc/content/${baseName}_v${img.version}.png` }));
        res.status(200).end();
    });
    app.get('/cbp-loc/:name', (req, res) => {
        const name = req.params.name;
        const img = cbpLocImages[name];
        if (!img) {
            res.status(404).end();
            return;
        }
        if (cbpLocFailMode === 'timeout') {
            return;
        }
        if (cbpLocFailMode === '503') {
            res.set(CBP_CORS_HEADERS);
            res.status(503).end();
            return;
        }
        const png = img.version === 1 ? RED_PNG : BLUE_PNG;
        res.set(Object.assign(Object.assign({}, CBP_CORS_HEADERS), { 'Content-Type': 'image/png' }));
        res.send(png);
    });
    // Content routes for location strategy (the URLs pointed to by the Location header)
    app.get('/cbp-loc/content/:fileName', async (req, res) => {
        const fileName = req.params.fileName;
        if (cbpLocFailMode === 'timeout') {
            return;
        }
        if (cbpLocFailMode === '503') {
            res.set(CBP_CORS_HEADERS);
            res.status(503).end();
            return;
        }
        const start = Date.now();
        const delayMs = cbpLocContentDelay[fileName] || 0;
        if (delayMs > 0) {
            // Consume the delay (one-shot) so subsequent fetches are normal-speed.
            delete cbpLocContentDelay[fileName];
            await new Promise((r) => setTimeout(r, delayMs));
        }
        // Parse version from filename like "image3_v2.png"
        const versionMatch = fileName.match(/_v(\d+)\.png$/);
        const version = versionMatch ? parseInt(versionMatch[1], 10) : 1;
        const png = version === 1 ? RED_PNG : BLUE_PNG;
        res.set(Object.assign(Object.assign({}, CBP_CORS_HEADERS), { 'Content-Type': 'image/png' }));
        res.send(png);
        cbpLocContentLog.push({ file: fileName, time: Date.now(), durationMs: Date.now() - start });
    });
    // --- checkBeforePlay video test state ---
    // Serves a real video file with dynamic Last-Modified to test video re-prepare paths.
    let cbpVideoLastModified = '2025-01-01T00:00:00.000Z';
    let cbpVideoVersion = 1;
    app.options('/cbp-video/*', (_req, res) => {
        res.set(CBP_CORS_HEADERS);
        res.sendStatus(204);
    });
    app.post('/cbp-video/reset', (_req, res) => {
        cbpVideoLastModified = '2025-01-01T00:00:00.000Z';
        cbpVideoVersion = 1;
        res.set(CBP_CORS_HEADERS);
        res.json({ version: cbpVideoVersion, lastModified: cbpVideoLastModified });
    });
    app.post('/cbp-video/switch', (_req, res) => {
        cbpVideoVersion++;
        cbpVideoLastModified = new Date().toISOString();
        res.set(CBP_CORS_HEADERS);
        res.json({ version: cbpVideoVersion, lastModified: cbpVideoLastModified });
    });
    app.head('/cbp-video/video.mp4', async (_req, res) => {
        const buf = await getCbpVideoBuffer();
        res.set(Object.assign(Object.assign({}, CBP_CORS_HEADERS), { 'Content-Type': 'video/mp4', 'Content-Length': String(buf.length), 'Last-Modified': cbpVideoLastModified }));
        res.status(200).end();
    });
    app.get('/cbp-video/video.mp4', async (_req, res) => {
        const buf = await getCbpVideoBuffer();
        res.set(Object.assign(Object.assign({}, CBP_CORS_HEADERS), { 'Content-Type': 'video/mp4', 'Last-Modified': cbpVideoLastModified }));
        res.send(buf);
    });
    // --- location-header strategy with extensionless SMIL src (cbp-loc-noext) ---
    // Reproduces the Hygh production setup where <video src=".../content?id=N"> points
    // at an API endpoint whose pathname has no extension; the HEAD returns a Location
    // header pointing at a URL whose pathname DOES carry the ".mp4" extension. Used to
    // verify the on-disk filename inherits the extension from the Location URL.
    app.options('/cbp-loc-noext/*', (_req, res) => {
        res.set(CBP_CORS_HEADERS);
        res.sendStatus(204);
    });
    app.head('/cbp-loc-noext/content', (req, res) => {
        const id = req.query.id || '1';
        res.set(Object.assign(Object.assign({}, CBP_CORS_HEADERS), { 'Location': `http://localhost:${port}/cbp-loc-noext/file/video_v${id}.mp4` }));
        // Mirrors the Hygh API which returns 204 with the Location header.
        res.status(204).end();
    });
    app.get('/cbp-loc-noext/file/:fileName', async (_req, res) => {
        const buf = await getCbpVideoBuffer();
        res.set(Object.assign(Object.assign({}, CBP_CORS_HEADERS), { 'Content-Type': 'video/mp4', 'Content-Length': String(buf.length) }));
        res.send(buf);
    });
    app.head('/cbp-loc-noext/file/:fileName', async (_req, res) => {
        const buf = await getCbpVideoBuffer();
        res.set(Object.assign(Object.assign({}, CBP_CORS_HEADERS), { 'Content-Type': 'video/mp4', 'Content-Length': String(buf.length) }));
        res.status(200).end();
    });
    // --- Custom endpoint reporting: capture POST payloads, expose via GET ---
    app.post('/report', (req, res) => {
        if (reportFailMode) {
            // Endpoint "unreachable": don't record; the player's report POST sees a
            // non-ok response and saves the report to offline storage for later upload.
            res.status(503).json({ error: 'report endpoint unavailable' });
            return;
        }
        reportHistory.push({ receivedAt: new Date().toISOString(), body: req.body });
        res.json({ ok: true });
    });
    app.get('/report/history', (_req, res) => {
        res.json(reportHistory);
    });
    // Toggle the /report endpoint between accepting and rejecting (503) reports,
    // so the offline-report upload test can simulate offline -> back-online.
    app.post('/report/fail-mode', (req, res) => {
        reportFailMode = req.body.fail === true;
        res.json({ ok: true, reportFailMode });
    });
    // --- Configurable HTTP status for HEAD requests (skipContentOnHttpStatus tests) ---
    app.post('/status-config', (req, res) => {
        const { fileName, statusCode } = req.body;
        statusConfig[fileName] = statusCode;
        res.json({ ok: true });
    });
    app.head('/status-check/:fileName', (req, res) => {
        const fileName = req.params.fileName;
        const configured = statusConfig[fileName];
        if (configured === 'timeout') {
            // Hang past the client's HEAD timeout; respond late only to release the socket.
            setTimeout(() => res.status(504).end(), 5000);
            return;
        }
        const statusCode = configured || 200;
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
            let fileString = await fs.readFile(`./${enums_1.TestServer.testFilesPath}/errorHandling/${fileName}`, 'utf8');
            fileString = rewriteSmilPort(fileString);
            res.set({
                'Content-Disposition': `attachment; filename=\"${fileName}\"`,
                'Content-type': 'text/xml',
                'Cache-Control': 'no-cache, no-store',
            });
            res.send(fileString);
        }
    });
    // --- Recover SMIL: 404s until /recover-config flips it valid (broken -> valid) ---
    app.post('/recover-config', (req, res) => {
        const { fileName, broken } = req.body;
        recoverConfig[fileName] = broken !== false;
        res.json({ ok: true });
    });
    const isRecoverBroken = (fileName) => recoverConfig[fileName] !== false;
    app.head('/recover-smil/:fileName', (req, res) => {
        if (isRecoverBroken(req.params.fileName)) {
            res.status(404).end();
            return;
        }
        res.set({
            'Content-type': 'text/xml',
            'Last-Modified': new Date(Date.now()).toUTCString(),
            'Cache-Control': 'no-cache, no-store',
        }).end();
    });
    app.get('/recover-smil/:fileName', async (req, res) => {
        const fileName = req.params.fileName;
        if (isRecoverBroken(fileName)) {
            res.status(404).end();
            return;
        }
        let fileString = await fs.readFile(`./${enums_1.TestServer.testFilesPath}/errorHandling/${fileName}`, 'utf8');
        fileString = rewriteSmilPort(fileString);
        res.set({
            'Content-Disposition': `attachment; filename=\"${fileName}\"`,
            'Content-type': 'text/xml',
            'Cache-Control': 'no-cache, no-store',
        });
        res.send(fileString);
    });
    // Serve .smil files from any folder with fillWallclock templating and port rewriting,
    // so fixtures can live in whichever semantic folder makes sense regardless of whether
    // they need wallclock substitution. fillWallclock is a no-op for filenames it doesn't
    // recognise, so it's safe to apply universally. More specific routes registered above
    // (/dynamic/, /dynamic-update/, /dynamic-refresh/, /fallback-smil/) still take precedence.
    app.get(/\.smil$/, async (req, res, next) => {
        const filePath = path.join(process.env.PWD, enums_1.TestServer.testFilesPath, req.path);
        const fileName = path.basename(req.path);
        try {
            let content = await fs.readFile(filePath, 'utf8');
            content = localServerTools_1.fillWallclock(content, fileName);
            content = rewriteSmilPort(content);
            res.set('Content-type', 'text/xml');
            res.send(content);
        }
        catch (_a) {
            next();
        }
    });
    // Static assets with checkout-independent Last-Modified: the player's
    // moved-content dedup keys on Last-Modified, and a fresh git checkout stamps
    // every asset with the same mtime — folding all media into one identity
    // (elements then loop "Skipping element (empty localFilePath)"). Derive the
    // header from the basename instead of filesystem mtime.
    app.use(express.static(path.join(process.env.PWD, enums_1.TestServer.testFilesPath), {
        lastModified: false,
        setHeaders: (res, filePath) => {
            res.set('Last-Modified', new Date(localServerTools_1.deterministicLastModifiedMs(path.basename(filePath))).toUTCString());
        },
    }));
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
exports.createTestServer = createTestServer;
// Standalone mode: run directly via `node test-server/localServer.js`
if (require.main === module) {
    const port = parseInt(process.env.TEST_SERVER_PORT || String(enums_1.TestServer.port), 10);
    createTestServer(port).start();
}
