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

import * as chai from 'chai';
import { SMILElementController } from '../../../src/components/playlist/playlistProcessor/SMILElementController';
import { Synchronization, SyncMessage } from '../../../src/models/syncModels';

const expect = chai.expect;

function makeSynchronization(overrides: Partial<Synchronization> = {}): Synchronization {
	return {
		shouldSync: true,
		syncGroupIds: [],
		syncGroupName: 'test-group',
		syncDeviceId: 'device-A',
		syncingInAction: false,
		movingForward: false,
		shouldCancelAll: false,
		...overrides,
	};
}

function makeSyncGroupMock(storedByKey: Record<string, SyncMessage | undefined>) {
	return {
		getSyncCoordinationMessage: (type: string, regionName: string) => storedByKey[`${type}|${regionName}`],
	} as any;
}

function makeStoredMessage(partial: Partial<SyncMessage>): SyncMessage {
	return {
		type: 'cmd-prepare',
		regionName: 'main',
		syncIndex: 1,
		timestamp: Date.now(),
		...partial,
	};
}

function callIsBroadcastAligned(
	controller: SMILElementController,
	commandType: string,
	regionName: string,
	syncGroup: any,
): boolean {
	return (controller as any).isBroadcastAligned(commandType, regionName, syncGroup);
}

describe('SMILElementController.isBroadcastAligned', () => {
	it('returns true when there is no stored message', () => {
		const sync = makeSynchronization();
		const controller = new SMILElementController(sync);
		const group = makeSyncGroupMock({});

		expect(callIsBroadcastAligned(controller, 'cmd-prepare', 'main', group)).to.equal(true);
	});

	it('returns true when priority and bounds match local playlist', () => {
		const sync = makeSynchronization({
			syncIndexBoundsPerPriority: { main: { 1: { min: 1, max: 5 } } },
		});
		const controller = new SMILElementController(sync);
		const group = makeSyncGroupMock({
			'cmd-prepare|main': makeStoredMessage({
				priorityLevel: 1,
				priorityMinSyncIndex: 1,
				priorityMaxSyncIndex: 5,
				syncIndex: 3,
			}),
		});

		expect(callIsBroadcastAligned(controller, 'cmd-prepare', 'main', group)).to.equal(true);
	});

	it('returns false when message priority does not exist in local bounds map', () => {
		const sync = makeSynchronization({
			syncIndexBoundsPerPriority: { main: { 1: { min: 1, max: 5 } } },
		});
		const controller = new SMILElementController(sync);
		const group = makeSyncGroupMock({
			'cmd-prepare|main': makeStoredMessage({
				priorityLevel: 2,
				priorityMinSyncIndex: 1,
				priorityMaxSyncIndex: 5,
				syncIndex: 3,
			}),
		});

		expect(callIsBroadcastAligned(controller, 'cmd-prepare', 'main', group)).to.equal(false);
	});

	it('returns false when priority matches but priorityMinSyncIndex differs', () => {
		const sync = makeSynchronization({
			syncIndexBoundsPerPriority: { main: { 1: { min: 1, max: 5 } } },
		});
		const controller = new SMILElementController(sync);
		const group = makeSyncGroupMock({
			'cmd-prepare|main': makeStoredMessage({
				priorityLevel: 1,
				priorityMinSyncIndex: 2,
				priorityMaxSyncIndex: 5,
				syncIndex: 3,
			}),
		});

		expect(callIsBroadcastAligned(controller, 'cmd-prepare', 'main', group)).to.equal(false);
	});

	it('returns false when priority matches but priorityMaxSyncIndex differs', () => {
		const sync = makeSynchronization({
			syncIndexBoundsPerPriority: { main: { 1: { min: 1, max: 5 } } },
		});
		const controller = new SMILElementController(sync);
		const group = makeSyncGroupMock({
			'cmd-prepare|main': makeStoredMessage({
				priorityLevel: 1,
				priorityMinSyncIndex: 1,
				priorityMaxSyncIndex: 10,
				syncIndex: 3,
			}),
		});

		expect(callIsBroadcastAligned(controller, 'cmd-prepare', 'main', group)).to.equal(false);
	});

	it('returns true for non-priority message with syncIndex within maxSyncIndexPerRegion', () => {
		const sync = makeSynchronization({
			maxSyncIndexPerRegion: { main: 5 },
		});
		const controller = new SMILElementController(sync);
		const group = makeSyncGroupMock({
			'cmd-prepare|main': makeStoredMessage({
				syncIndex: 3,
			}),
		});

		expect(callIsBroadcastAligned(controller, 'cmd-prepare', 'main', group)).to.equal(true);
	});

	it('returns false for non-priority message with syncIndex above maxSyncIndexPerRegion', () => {
		const sync = makeSynchronization({
			maxSyncIndexPerRegion: { main: 5 },
		});
		const controller = new SMILElementController(sync);
		const group = makeSyncGroupMock({
			'cmd-prepare|main': makeStoredMessage({
				syncIndex: 8,
			}),
		});

		expect(callIsBroadcastAligned(controller, 'cmd-prepare', 'main', group)).to.equal(false);
	});

	it('returns true when maxSyncIndexPerRegion is undefined for the region (no evidence to reject)', () => {
		const sync = makeSynchronization({
			maxSyncIndexPerRegion: {},
		});
		const controller = new SMILElementController(sync);
		const group = makeSyncGroupMock({
			'cmd-prepare|main': makeStoredMessage({
				syncIndex: 8,
			}),
		});

		expect(callIsBroadcastAligned(controller, 'cmd-prepare', 'main', group)).to.equal(true);
	});

	it('returns false when syncIndexBoundsPerPriority for the region is missing but message has priority', () => {
		const sync = makeSynchronization({
			syncIndexBoundsPerPriority: {},
		});
		const controller = new SMILElementController(sync);
		const group = makeSyncGroupMock({
			'cmd-prepare|main': makeStoredMessage({
				priorityLevel: 1,
				priorityMinSyncIndex: 1,
				priorityMaxSyncIndex: 5,
			}),
		});

		expect(callIsBroadcastAligned(controller, 'cmd-prepare', 'main', group)).to.equal(false);
	});

	it('checks the correct command type (cmd-play not conflated with cmd-prepare)', () => {
		const sync = makeSynchronization({
			syncIndexBoundsPerPriority: { main: { 1: { min: 1, max: 5 } } },
		});
		const controller = new SMILElementController(sync);
		// Only cmd-prepare is stored; cmd-play has no stored message → should return true (no evidence)
		const group = makeSyncGroupMock({
			'cmd-prepare|main': makeStoredMessage({
				priorityLevel: 1,
				priorityMinSyncIndex: 1,
				priorityMaxSyncIndex: 5,
			}),
		});

		expect(callIsBroadcastAligned(controller, 'cmd-play', 'main', group)).to.equal(true);
	});
});
