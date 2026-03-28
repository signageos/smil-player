import { SmilPlayer } from './components/smilPlayer';

function getSmilUrlFromParams(): string | undefined {
	// Check for injected smilUrl (set by Playwright addInitScript)
	if ((window as any).__SMIL_URL__) return (window as any).__SMIL_URL__;
	try {
		// In emulator mode, the applet runs in an iframe — read params from the parent window
		const parentParams = new URLSearchParams(window.parent.location.search);
		const smilUrl = parentParams.get('smilUrl');
		if (smilUrl) return smilUrl;
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
new SmilPlayer(smilUrl, configOverrides).start();
