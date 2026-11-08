// Local signageOS emulator: serves @signageos/front-display with this applet bundled from dist/, no cloud calls.
// Same contract @signageos/webpack-plugin and `sos applet start` implement (window.__SOS_BUNDLED_APPLET + /applet).
//   node tools/emulator.mjs            emulator on http://localhost:8090 (EMULATOR_PORT overrides)
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const dist = path.join(root, 'dist');
const port = Number(process.env.EMULATOR_PORT) || 8090;
const frontDisplayDist = path.join(path.dirname(require.resolve('@signageos/front-display/package.json')), 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function readJson(file, fallback) {
	try {
		return JSON.parse(fs.readFileSync(file, 'utf8'));
	} catch {
		return fallback;
	}
}

const bundledApplet = {
	binaryFile: '/applet/index.html',
	uid: pkg.sos?.appletUid ?? '__default_timing__',
	version: pkg.version,
	config: readJson(path.join(root, 'sos.config.local.json'), {}),
	checksum: '0'.repeat(40),
	frontAppletVersion: '', // has bundled front applet
	frontAppletBinaryFile: '',
};
// ~/.sosrc is INI: top-level keys = default profile, `[profile <name>]` sections selected by SOS_PROFILE (as the CLI does)
function readOrganizationUid() {
	let rc = '';
	try {
		rc = fs.readFileSync(path.join(os.homedir(), '.sosrc'), 'utf8');
	} catch {
		return '';
	}
	const profile = process.env.SOS_PROFILE;
	const section = profile ? rc.split(`[profile ${profile}]`)[1] ?? '' : rc.split(/^\[/m)[0];
	return section.match(/^defaultOrganizationUid=(.*)$/m)?.[1].trim() ?? '';
}
const organizationUid = readOrganizationUid();
if (!organizationUid) {
	console.warn('No defaultOrganizationUid in ~/.sosrc: front-display will not mount the applet (run `sos organization set-default`)');
}

const app = express();
app.use((_req, res, next) => {
	res.setHeader('Access-Control-Allow-Origin', '*');
	next();
});
app.get('/', (req, res) => {
	if (!req.query.duid) {
		res.redirect(`${req.originalUrl}${req.originalUrl.includes('?') ? '&' : '?'}duid=emulator`);
		return;
	}
	const page = fs.readFileSync(path.join(frontDisplayDist, 'index.html'), 'utf8');
	const script = `<script>
	window.__SOS_BUNDLED_APPLET = ${JSON.stringify({ ...bundledApplet, binaryFile: undefined })};
	window.__SOS_BUNDLED_APPLET.binaryFile = location.origin + ${JSON.stringify(bundledApplet.binaryFile)};
	window.__SOS_AUTO_VERIFICATION = { organizationUid: ${JSON.stringify(organizationUid)} };
</script>`;
	// prepended before the doctype, as @signageos/webpack-plugin did (keeps the page in quirks mode the e2e suite was calibrated on)
	res.send(script + page);
});
app.use(express.static(frontDisplayDist));
app.get('/applet/index.html', (_req, res) => {
	// Same reload hook @signageos/webpack-plugin prepended: an applet unload (watch rebuild) reloads the whole emulator.
	// Prepended before the doctype on purpose: the applet document stays in quirks mode (body = full viewport),
	// which the e2e helpers (waitForSelector('body')) and layout tests were calibrated on.
	const reload = '<script>window.onunload = function () { window.parent.location.reload(); }</script>';
	res.type('html').send(reload + fs.readFileSync(path.join(dist, 'index.html'), 'utf8'));
});
app.use('/applet', express.static(dist));

app.listen(port, () => console.log(`Emulator is running at http://localhost:${port}`));
