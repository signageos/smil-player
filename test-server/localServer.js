"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const express = require('express');
const fs = require('fs').promises;
const enums_1 = require("./enums");
const localServerTools_1 = require("./localServerTools");
const app = express();
const port = enums_1.TestServer.port;
// In-memory state per file for the /dynamic-update/ endpoint
const updateState = {};
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
app.get('/dynamic/:fileName', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const fileName = req.params.fileName;
    let fileString = yield fs.readFile(`./${enums_1.TestServer.dynamicTestFilesPath}/${fileName}`, 'utf8');
    fileString = localServerTools_1.fillWallclock(fileString, fileName);
    res.set({ 'Content-Disposition': `attachment; filename=\"${fileName}\"`, 'Content-type': 'text/xml' });
    res.send(fileString);
}));
// Stateful endpoint for SMIL update testing.
// Phase 1 (first 20s): serves initial SMIL with active wallclocks.
// Phase 2 (after 20s): serves updated SMIL with expired wallclocks.
// Last-Modified is STABLE within each phase so ResourceChecker HEAD checks
// don't trigger false reloads. It only changes when the phase transitions.
app.get('/dynamic-update/:fileName', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const fileName = req.params.fileName;
    // Track first request time per file
    if (!updateState[fileName]) {
        updateState[fileName] = { firstRequestTime: Date.now(), phase: 1 };
    }
    const state = updateState[fileName];
    const elapsed = Date.now() - state.firstRequestTime;
    // Switch to phase 2 after 20 seconds (enough for initial download + Phase 1 playback)
    const currentPhase = elapsed < 20000 ? 1 : 2;
    // Stable Last-Modified that only changes when phase changes
    const lastModified = new Date(Date.UTC(2026, 0, 1) + currentPhase * 1000).toUTCString();
    let fileString = yield fs.readFile(`./${enums_1.TestServer.dynamicTestFilesPath}/${fileName}`, 'utf8');
    fileString = localServerTools_1.fillWallclock(fileString, fileName, currentPhase);
    res.set({ 'Content-Disposition': `attachment; filename=\"${fileName}\"`, 'Content-type': 'text/xml', 'Last-Modified': lastModified });
    res.send(fileString);
}));
app.get('/:fileName', (req, res) => {
    res.sendFile(`./${enums_1.TestServer.testFilesPath}/${req.params.fileName}`, { root: process.env.PWD });
});
app.listen(port, () => console.log(`Test server started on port ${port}!`));
