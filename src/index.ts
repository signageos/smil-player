import { SmilPlayer } from './components/smilPlayer';

function getSmilUrlFromParams(): string | undefined {
	// Check for injected smilUrl (set by Playwright addInitScript)
	if ((window as any).__SMIL_URL__) return (window as any).__SMIL_URL__;
	// Chrome 38 lacks URLSearchParams — fall back to sos.config.smilUrl
	if (typeof URLSearchParams === 'undefined') return undefined;
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

const smilUrl = getSmilUrlFromParams();
new SmilPlayer(smilUrl).start();
