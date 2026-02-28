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

import { PlaylistProcessor } from '../../../src/components/playlist/playlistProcessor/playlistProcessor';
import { ISos } from '../../../src/models/sosModels';
import { PlaylistOptions } from '../../../src/models/playlistModels';
import { initSyncObject } from '../../../src/components/playlist/tools/syncTools';

function stub() {
	const calls: any[][] = [];
	let resolveValue: any = undefined;
	const fn: any = (...args: any[]) => {
		calls.push(args);
		if (typeof resolveValue === 'function') {
			return resolveValue(calls.length - 1, args);
		}
		return Promise.resolve(resolveValue);
	};
	fn.calls = calls;
	fn.callCount = () => calls.length;
	fn.calledOnce = () => calls.length === 1;
	fn.calledWith = (...expected: any[]) => calls.some((c: any[]) => expected.every((e: any, i: number) => c[i] === e));
	fn.resolves = (val: any) => { resolveValue = val; return fn; };
	fn.callsFake = (fakeFn: Function) => { resolveValue = (_idx: number, args: any[]) => fakeFn(...args); return fn; };
	return fn;
}

export function createMockSos(): ISos & { [key: string]: any } {
	return {
		config: {
			playerName: 'testPlayer',
			playerId: 'testId',
		},
		video: {
			play: stub().resolves(undefined),
			prepare: stub().resolves(undefined),
			stop: stub().resolves(undefined),
			onceEnded: stub().resolves(undefined),
		},
		stream: {
			play: stub().resolves(undefined),
			prepare: stub().resolves(undefined),
			stop: stub().resolves(undefined),
		},
	} as any;
}

export function createDefaultOptions(): PlaylistOptions {
	return {
		cancelFunction: [false],
		currentlyPlaying: {},
		promiseAwaiting: {},
		currentlyPlayingPriority: {},
		synchronization: initSyncObject(),
		videoPreparing: {},
		randomPlaylist: {},
	};
}

export function createMockFiles(): any {
	return {
		sendMediaReport: stub().resolves(undefined),
		currentFilesSetup: stub().resolves(undefined),
	};
}

export function createMockTriggers(): any {
	return {
		handleTriggers: stub().resolves(undefined),
		dynamicPlaylist: {},
	};
}

export function createMockPriority(): any {
	return {
		priorityBehaviour: stub().resolves({ currentIndex: 0, previousPlayingIndex: 0 }),
	};
}

/**
 * Subclass that exposes protected methods for testing.
 */
export class TestablePlaylistProcessor extends PlaylistProcessor {
	public exposedSetCurrentlyPlaying = this.setCurrentlyPlaying;
	public exposedGetCancelFunction = this.getCancelFunction;

	public getCurrentlyPlaying() {
		return this.currentlyPlaying;
	}

	public getPromiseAwaiting() {
		return this.promiseAwaiting;
	}

	public getVideoPreparing() {
		return this.videoPreparing;
	}

	public getSynchronization() {
		return this.synchronization;
	}
}
