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

import { noopLog } from '../../../src/logger';
import * as chai from 'chai';
import { SMILElementController } from '../../../src/components/playlist/playlistProcessor/SMILElementController';
import { Synchronization } from '../../../src/models/syncModels';

const expect = chai.expect;

function makeSynchronization(overrides: Partial<Synchronization> = {}): Synchronization {
	return {
		shouldSync: true,
		syncGroupIds: [],
		syncGroupName: 'test-group',
		syncDeviceId: 'device-A',
		syncingInAction: false,
		shouldCancelAll: false,
		...overrides,
	};
}

describe('SMILElementController starvation escalation', () => {
	it('escalates to free-run after 3 consecutive starvation timeouts', () => {
		const controller = new SMILElementController(makeSynchronization(), noopLog) as any;
		expect(controller.recordStarvationTimeout('main')).to.equal(false);
		expect(controller.recordStarvationTimeout('main')).to.equal(false);
		expect(controller.recordStarvationTimeout('main')).to.equal(true);
		expect(controller.freeRunRegions.main).to.equal(true);
	});

	it('command activity resets the counter and exits free-run', () => {
		const controller = new SMILElementController(makeSynchronization(), noopLog) as any;
		controller.recordStarvationTimeout('main');
		controller.recordStarvationTimeout('main');
		controller.recordStarvationTimeout('main');
		controller.noteCommandActivity('main');
		expect(controller.freeRunRegions.main).to.equal(undefined);
		expect(controller.recordStarvationTimeout('main')).to.equal(false);
	});

	it('counters are tracked per region', () => {
		const controller = new SMILElementController(makeSynchronization(), noopLog) as any;
		controller.recordStarvationTimeout('a');
		controller.recordStarvationTimeout('a');
		expect(controller.recordStarvationTimeout('b')).to.equal(false);
		expect(controller.recordStarvationTimeout('a')).to.equal(true);
		expect(controller.freeRunRegions.b).to.equal(undefined);
	});
});
