// Provide browser globals needed by @signageos/front-applet module at import time
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { JSDOM } = require('jsdom');
if (typeof (global as any).window === 'undefined') {
	const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
	(global as any).window = dom.window;
	(global as any).document = dom.window.document;
	(global as any).navigator = dom.window.navigator;
	(global as any).HTMLElement = dom.window.HTMLElement;
}
// smilPlayer.ts imports its bundled backup images; outside the bundler they are just a path.
require.extensions['.jpg'] = (module: any, filename: string) => {
	module.exports = filename;
};

import { noopLog, noopLogger } from '@signageos/smil-logger';
import { expect } from 'chai';
import { SmilPlayer } from '../../../src/components/smilPlayer';
import { PlaylistDataPrepare } from '../../../src/components/playlist/playlistDataPrepare/playlistDataPrepare';
import { smilUpdate } from '../../../src/enums/generalEnums';
import { createDefaultOptions, createMockSos } from '../playlistProcessor/testUtils';

const SMIL_URL = 'https://cms.example.com/playlist.smil';

/**
 * A real SmilPlayer whose collaborators are replaced by recorders, so main() runs one
 * iteration and returns. `calls` is the order in which main() reached each step.
 */
function playerWithRecorders(smilOverrides: Record<string, unknown> = {}) {
	const calls: string[] = [];
	const manageArgs: any[] = [];
	const smilObject = {
		playlist: { seq: {} },
		intro: [],
		dynamic: {},
		transition: {},
		refresh: { fallbackToPreviousPlaylist: false },
		...smilOverrides,
	};
	const sos = createMockSos();
	(sos.fileSystem.readFile as any).resolves('<smil/>');
	const player = new SmilPlayer(sos, noopLogger, SMIL_URL) as any;
	player.html = { resetBodyContent: () => undefined };
	player.xmlParser = { processSmilXml: async () => smilObject };
	player.files = {
		setSmilUrl: () => undefined,
		setSmiLogging: () => undefined,
		sendSmiFileReport: async () => undefined,
		settleUnusedFilesCleanup: async () => {
			calls.push('settle');
		},
		parallelDownloadAllFiles: async () => {
			calls.push('download');
			return { promises: [], filesToUpdate: new Map() };
		},
		updateMediaInfoAfterDownloads: async () => {
			calls.push('record');
		},
		prepareDownloadMediaSetup: async () => {
			calls.push('prepareMedia');
		},
	};
	player.dataPrepare = {
		manageFilesAndInfo: async (options: unknown) => {
			calls.push('manage');
			manageArgs.push(options);
		},
	};
	player.processor = {
		disableLoop: () => undefined,
		setSmilObject: () => undefined,
		downloadIntro: async () => 'video0',
		playIntro: async () => [],
		processingLoop: async () => {
			calls.push('loop');
		},
	};
	const main = (options: Record<string, unknown> = {}) => player.main({ internalStorageUnit: {}, smilUrl: SMIL_URL, ...options });
	return { player, main, calls, manageArgs };
}

describe('unused files cleanup wiring', () => {
	describe('SmilPlayer.main', () => {
		it('cold start cleans up inline: no previous playlist is on screen', async () => {
			const { main, calls, manageArgs } = playerWithRecorders();

			await main();

			expect(calls).to.include('loop');
			expect(manageArgs).to.have.length(1);
			expect(!!manageArgs[0].deferUnusedFilesCleanup).to.equal(false);
		});

		it('a live content update defers the cleanup to the hand-over', async () => {
			const { main, manageArgs } = playerWithRecorders();

			await main({ playIntro: false, firstIteration: false });

			expect(manageArgs).to.have.length(1);
			expect(manageArgs[0].deferUnusedFilesCleanup).to.equal(true);
		});

		it('the intro path (cold start only) cleans up inline', async () => {
			const { main, manageArgs } = playerWithRecorders({ intro: [{ video0: { src: 'https://cdn.example.com/intro.mp4' } }] });

			await main();

			expect(manageArgs).to.have.length(1);
			expect(!!manageArgs[0].deferUnusedFilesCleanup).to.equal(false);
		});

		it('settles the previous update\'s cleanup before it downloads or records anything', async () => {
			const { main, calls } = playerWithRecorders();

			await main({ playIntro: false, firstIteration: false });

			expect(calls[0], `order was ${calls.join(' → ')}`).to.equal('settle');
			expect(calls.filter((step) => step === 'settle')).to.have.length(1);
		});

		it('an update whose SMIL is invalid still settles the pending cleanup and queues no new one', async () => {
			const { player, main, calls } = playerWithRecorders();
			player.xmlParser = {
				processSmilXml: async () => {
					throw new Error('invalid xml');
				},
			};
			player.isPollingForPlaylist = true; // called from the fallback poll: returns instead of retrying

			const result = await main({ playIntro: false, firstIteration: false, ignoreInvalidSmil: true });

			expect(result).to.equal(smilUpdate.invalid);
			expect(calls[0]).to.equal('settle');
			expect(calls).to.not.include('manage');
			expect(calls).to.not.include('loop');
		});
	});

	describe('PlaylistDataPrepare.manageFilesAndInfo', () => {
		const smilObject = { ref: [], triggers: {}, dynamic: {}, playlist: {} } as any;

		function dataPrepareWithRecorder() {
			const setups: any[] = [];
			const files = {
				currentFilesSetup: async (options: unknown) => {
					setups.push(options);
				},
			};
			const dataPrepare = new PlaylistDataPrepare(createMockSos(), files as any, createDefaultOptions(), noopLog);
			return { dataPrepare, setups };
		}

		it('cleans up inline unless told to defer', async () => {
			const { dataPrepare, setups } = dataPrepareWithRecorder();

			await dataPrepare.manageFilesAndInfo({ smilObject, smilUrl: SMIL_URL });

			expect(setups).to.have.length(1);
			expect(setups[0].deferUnusedFilesCleanup).to.equal(false);
			expect(setups[0].smilObject).to.equal(smilObject);
			expect(setups[0].smilUrl).to.equal(SMIL_URL);
		});

		it('passes the defer request on to the files manager', async () => {
			const { dataPrepare, setups } = dataPrepareWithRecorder();

			await dataPrepare.manageFilesAndInfo({ smilObject, smilUrl: SMIL_URL, deferUnusedFilesCleanup: true });

			expect(setups[0].deferUnusedFilesCleanup).to.equal(true);
		});
	});
});
