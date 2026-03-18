const express = require('express');
const fs = require('fs').promises;

import { Request, Response } from 'express';
import { TestServer } from '../enums/enums';
import { fillWallclock } from './localServerTools';

const app = express();
const port = TestServer.port;

// Global CORS — allow cross-origin requests from the emulator/applet iframe
app.use((_req: Request, res: Response, next: () => void) => {
	res.set({
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
		'Access-Control-Allow-Headers': '*',
		'Access-Control-Expose-Headers': 'Last-Modified, Location',
	});
	if (_req.method === 'OPTIONS') {
		res.sendStatus(204);
		return;
	}
	next();
});

// --- checkBeforePlay test state ---
// Single-image state (existing test)
let cbpLastModified = '2025-01-01T00:00:00.000Z';
let cbpVersion = 1;

// Per-image state for multi-element test
const cbpImages: Record<string, { lastModified: string; version: number }> = {};
function resetCbpImages(): void {
	for (let i = 1; i <= 10; i++) {
		cbpImages[`image${i}.png`] = { lastModified: '2025-01-01T00:00:00.000Z', version: 1 };
	}
}
resetCbpImages();

// HEAD request log for verifying checkAheadCount
let headLog: { file: string; time: number }[] = [];

// 1x1 pixel PNG (red)
const RED_PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8D4HwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
	'base64',
);
// 1x1 pixel PNG (blue)
const BLUE_PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==',
	'base64',
);

const CBP_CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
	'Access-Control-Allow-Headers': '*',
	'Access-Control-Expose-Headers': 'Last-Modified, Location',
	'Cache-Control': 'no-cache, no-store',
};

app.options('/cbp/*', (_req: Request, res: Response) => {
	res.set(CBP_CORS_HEADERS);
	res.sendStatus(204);
});

app.post('/cbp/reset', (_req: Request, res: Response) => {
	cbpLastModified = '2025-01-01T00:00:00.000Z';
	cbpVersion = 1;
	resetCbpImages();
	headLog = [];
	res.set(CBP_CORS_HEADERS);
	res.json({ version: cbpVersion, lastModified: cbpLastModified });
});

app.post('/cbp/clear-head-log', (_req: Request, res: Response) => {
	headLog = [];
	res.set(CBP_CORS_HEADERS);
	res.json({ cleared: true });
});

app.get('/cbp/head-log', (_req: Request, res: Response) => {
	res.set(CBP_CORS_HEADERS);
	res.json(headLog);
});

// Single-image switch (existing test)
app.post('/cbp/switch', (_req: Request, res: Response) => {
	cbpVersion = cbpVersion === 1 ? 2 : 1;
	cbpLastModified = new Date().toISOString();
	res.set(CBP_CORS_HEADERS);
	res.json({ version: cbpVersion, lastModified: cbpLastModified });
});

// Per-image switch for multi-element test
app.post('/cbp/switch/:name', (req: Request, res: Response) => {
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

// --- Single-image routes (existing test) - must be before parameterized routes ---

app.head('/cbp/image.png', (_req: Request, res: Response) => {
	const png = cbpVersion === 1 ? RED_PNG : BLUE_PNG;
	res.set({
		...CBP_CORS_HEADERS,
		'Content-Type': 'image/png',
		'Content-Length': String(png.length),
		'Last-Modified': cbpLastModified,
	});
	res.status(200).end();
});

app.get('/cbp/image.png', (_req: Request, res: Response) => {
	const png = cbpVersion === 1 ? RED_PNG : BLUE_PNG;
	res.set({
		...CBP_CORS_HEADERS,
		'Content-Type': 'image/png',
		'Last-Modified': cbpLastModified,
	});
	res.send(png);
});

// --- Per-image routes (multi-element test) ---

app.head('/cbp/:name', (req: Request, res: Response) => {
	const name = req.params.name;
	const img = cbpImages[name];
	if (!img) {
		res.status(404).end();
		return;
	}
	headLog.push({ file: name, time: Date.now() });
	const png = img.version === 1 ? RED_PNG : BLUE_PNG;
	res.set({
		...CBP_CORS_HEADERS,
		'Content-Type': 'image/png',
		'Content-Length': String(png.length),
		'Last-Modified': img.lastModified,
	});
	res.status(200).end();
});

app.get('/cbp/:name', (req: Request, res: Response) => {
	const name = req.params.name;
	const img = cbpImages[name];
	if (!img) {
		res.status(404).end();
		return;
	}
	const png = img.version === 1 ? RED_PNG : BLUE_PNG;
	res.set({
		...CBP_CORS_HEADERS,
		'Content-Type': 'image/png',
		'Last-Modified': img.lastModified,
	});
	res.send(png);
});

// --- checkBeforePlay location strategy state ---
// Single-image state
let cbpLocVersion = 1;

// Per-image state for multi-element test
const cbpLocImages: Record<string, { version: number }> = {};
function resetCbpLocImages(): void {
	for (let i = 1; i <= 10; i++) {
		cbpLocImages[`image${i}.png`] = { version: 1 };
	}
}
resetCbpLocImages();

// HEAD request log for location strategy
let locHeadLog: { file: string; time: number }[] = [];

const CBP_LOC_CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
	'Access-Control-Allow-Headers': '*',
	'Access-Control-Expose-Headers': 'Last-Modified, Location',
	'Cache-Control': 'no-cache, no-store',
};

app.options('/cbp-loc/*', (_req: Request, res: Response) => {
	res.set(CBP_LOC_CORS_HEADERS);
	res.sendStatus(204);
});

app.post('/cbp-loc/reset', (_req: Request, res: Response) => {
	cbpLocVersion = 1;
	resetCbpLocImages();
	locHeadLog = [];
	res.set(CBP_LOC_CORS_HEADERS);
	res.json({ version: cbpLocVersion });
});

app.post('/cbp-loc/clear-head-log', (_req: Request, res: Response) => {
	locHeadLog = [];
	res.set(CBP_LOC_CORS_HEADERS);
	res.json({ cleared: true });
});

app.get('/cbp-loc/head-log', (_req: Request, res: Response) => {
	res.set(CBP_LOC_CORS_HEADERS);
	res.json(locHeadLog);
});

// Single-image switch
app.post('/cbp-loc/switch', (_req: Request, res: Response) => {
	cbpLocVersion = cbpLocVersion === 1 ? 2 : 1;
	res.set(CBP_LOC_CORS_HEADERS);
	res.json({ version: cbpLocVersion });
});

// Per-image switch
app.post('/cbp-loc/switch/:name', (req: Request, res: Response) => {
	const name = req.params.name;
	if (!cbpLocImages[name]) {
		res.status(404).json({ error: `Unknown image: ${name}` });
		return;
	}
	cbpLocImages[name].version = cbpLocImages[name].version === 1 ? 2 : 1;
	res.set(CBP_LOC_CORS_HEADERS);
	res.json({ name, version: cbpLocImages[name].version });
});

// --- Single-image location routes (must be before parameterized) ---

// Location header for single image: points to a versioned URL that changes on switch
app.head('/cbp-loc/image.png', (_req: Request, res: Response) => {
	const png = cbpLocVersion === 1 ? RED_PNG : BLUE_PNG;
	res.set({
		...CBP_LOC_CORS_HEADERS,
		'Content-Type': 'image/png',
		'Content-Length': String(png.length),
		'Location': `http://localhost:3000/cbp-loc/content/image_v${cbpLocVersion}.png`,
	});
	res.status(200).end();
});

app.get('/cbp-loc/image.png', (_req: Request, res: Response) => {
	const png = cbpLocVersion === 1 ? RED_PNG : BLUE_PNG;
	res.set({
		...CBP_LOC_CORS_HEADERS,
		'Content-Type': 'image/png',
	});
	res.send(png);
});

// --- Per-image location routes ---

app.head('/cbp-loc/:name', (req: Request, res: Response) => {
	const name = req.params.name;
	const img = cbpLocImages[name];
	if (!img) {
		res.status(404).end();
		return;
	}
	locHeadLog.push({ file: name, time: Date.now() });
	const baseName = name.replace('.png', '');
	const png = img.version === 1 ? RED_PNG : BLUE_PNG;
	res.set({
		...CBP_LOC_CORS_HEADERS,
		'Content-Type': 'image/png',
		'Content-Length': String(png.length),
		'Location': `http://localhost:3000/cbp-loc/content/${baseName}_v${img.version}.png`,
	});
	res.status(200).end();
});

app.get('/cbp-loc/:name', (req: Request, res: Response) => {
	const name = req.params.name;
	const img = cbpLocImages[name];
	if (!img) {
		res.status(404).end();
		return;
	}
	const png = img.version === 1 ? RED_PNG : BLUE_PNG;
	res.set({
		...CBP_LOC_CORS_HEADERS,
		'Content-Type': 'image/png',
	});
	res.send(png);
});

// --- Content routes for location strategy (the URLs pointed to by Location header) ---

app.get('/cbp-loc/content/:fileName', (req: Request, res: Response) => {
	const fileName = req.params.fileName;
	// Parse version from filename like "image3_v2.png"
	const versionMatch = fileName.match(/_v(\d+)\.png$/);
	const version = versionMatch ? parseInt(versionMatch[1]) : 1;
	const png = version === 1 ? RED_PNG : BLUE_PNG;
	res.set({
		...CBP_LOC_CORS_HEADERS,
		'Content-Type': 'image/png',
	});
	res.send(png);
});

// --- checkBeforePlay video test state ---
// Serves a real video file with dynamic Last-Modified to test video re-prepare paths
let cbpVideoLastModified = '2025-01-01T00:00:00.000Z';
let cbpVideoVersion = 1;
let cbpVideoBuffer: Buffer | null = null;

// Lazy-load the video file from disk on first request
async function getCbpVideoBuffer(): Promise<Buffer> {
	if (!cbpVideoBuffer) {
		cbpVideoBuffer = await fs.readFile('./cypress/testFiles/assets/loader.mp4');
	}
	return cbpVideoBuffer;
}

app.options('/cbp-video/*', (_req: Request, res: Response) => {
	res.set(CBP_CORS_HEADERS);
	res.sendStatus(204);
});

app.post('/cbp-video/reset', (_req: Request, res: Response) => {
	cbpVideoLastModified = '2025-01-01T00:00:00.000Z';
	cbpVideoVersion = 1;
	res.set(CBP_CORS_HEADERS);
	res.json({ version: cbpVideoVersion, lastModified: cbpVideoLastModified });
});

app.post('/cbp-video/switch', (_req: Request, res: Response) => {
	cbpVideoVersion++;
	cbpVideoLastModified = new Date().toISOString();
	res.set(CBP_CORS_HEADERS);
	res.json({ version: cbpVideoVersion, lastModified: cbpVideoLastModified });
});

app.head('/cbp-video/video.mp4', async (_req: Request, res: Response) => {
	const buf = await getCbpVideoBuffer();
	res.set({
		...CBP_CORS_HEADERS,
		'Content-Type': 'video/mp4',
		'Content-Length': String(buf.length),
		'Last-Modified': cbpVideoLastModified,
	});
	res.status(200).end();
});

app.get('/cbp-video/video.mp4', async (_req: Request, res: Response) => {
	const buf = await getCbpVideoBuffer();
	res.set({
		...CBP_CORS_HEADERS,
		'Content-Type': 'video/mp4',
		'Last-Modified': cbpVideoLastModified,
	});
	res.send(buf);
});

// --- existing routes ---

app.get('/assets/:fileName', (req: Request, res: Response) => {
	res.sendFile(`./${TestServer.assetsPath}/${req.params.fileName}`, { root: process.env.PWD });
});

app.get('/dynamic/:fileName', async (req: Request, res: Response) => {
	const fileName = req.params.fileName;
	let fileString = await fs.readFile(`./${TestServer.dynamicTestFilesPath}/${fileName}`, 'utf8');
	fileString = fillWallclock(fileString, fileName);
	res.set({ 'Content-Disposition': `attachment; filename=\"${fileName}\"`, 'Content-type': 'text/xml' });
	res.send(fileString);
});

app.get('/:fileName', (req: Request, res: Response) => {
	res.sendFile(`./${TestServer.testFilesPath}/${req.params.fileName}`, { root: process.env.PWD });
});

app.listen(port, () => console.log(`Test server started on port ${port}!`));
