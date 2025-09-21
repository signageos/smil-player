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
const enums_1 = require("../enums/enums");
const localServerTools_1 = require("./localServerTools");
const app = express();
const port = enums_1.TestServer.port;
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
app.get('/:fileName', (req, res) => {
    res.sendFile(`./${enums_1.TestServer.testFilesPath}/${req.params.fileName}`, { root: process.env.PWD });
});
app.listen(port, () => console.log(`Test server started on port ${port}!`));
