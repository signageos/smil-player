// MUST stay first: front-applet bundles core-js and installs the global polyfills (Object.assign,
// Object.entries, Array.from, String.startsWith, ...) that Chrome 38 (webOS <= 3.x) lacks. The player has
// no polyfills of its own, and luxon (via ical -> rrule) calls Object.assign at module load.
import sos from '@signageos/front-applet';
import { SmilPlayer } from './components/smilPlayer';

function getSmilUrlFromParams(): string | undefined {
	// Check for injected smilUrl (set by Playwright addInitScript)
	if ((window as any).__SMIL_URL__) { return (window as any).__SMIL_URL__; }
	// Chrome 38 lacks URLSearchParams — fall back to sos.config.smilUrl
	if (typeof URLSearchParams === 'undefined') { return undefined; }
	try {
		// In emulator mode, the applet runs in an iframe — read params from the parent window
		const parentParams = new URLSearchParams(window.parent.location.search);
		const parentSmilUrl = parentParams.get('smilUrl');
		if (parentSmilUrl) { return parentSmilUrl; }
	} catch (_e) {
		// Cross-origin or no parent — fall through
	}
	const urlParams = new URLSearchParams(window.location.search);
	return urlParams.get('smilUrl') || undefined;
}

function getConfigOverrides(): Record<string, string> | undefined {
	return (window as any).__SYNC_CONFIG__ || undefined;
}

const smilUrl = getSmilUrlFromParams();
const configOverrides = getConfigOverrides();
console.log('[SMIL-PLAYER] index.ts loaded, smilUrl from params:', smilUrl);
new SmilPlayer(sos, smilUrl, configOverrides).start();
