import * as chai from 'chai';
import { findTriggerToCancel, findTriggerToCancelByEndId } from '../../../src/components/playlist/tools/triggerTools';
import { TriggerEndless, TriggerObject } from '../../../src/models/triggerModels';
import { RegionAttributes } from '../../../src/models/xmlJsonModels';

const expect = chai.expect;

function makeTriggerEndless(entries: {
	[key: string]: { regionName: string; play: boolean };
}): TriggerEndless {
	const result: TriggerEndless = {};
	for (const [key, val] of Object.entries(entries)) {
		result[key] = {
			play: val.play,
			syncCanceled: false,
			latestEventFired: 0,
			regionInfo: { regionName: val.regionName } as RegionAttributes,
			triggerRandom: 0,
		};
	}
	return result;
}

describe('triggerTools', () => {
	describe('findTriggerToCancel', () => {
		it('Should return key of playing trigger in same region with different value', () => {
			const triggers = makeTriggerEndless({
				'trigger-A': { regionName: 'zone1', play: true },
				'trigger-B': { regionName: 'zone2', play: true },
			});
			const result = findTriggerToCancel(triggers, 'zone1', 'trigger-B');
			expect(result).to.equal('trigger-A');
		});

		it('Should return empty string when no match (different region)', () => {
			const triggers = makeTriggerEndless({
				'trigger-A': { regionName: 'zone1', play: true },
			});
			const result = findTriggerToCancel(triggers, 'zone2', 'trigger-B');
			expect(result).to.equal('');
		});

		it('Should return empty string when same trigger value (will not cancel itself)', () => {
			const triggers = makeTriggerEndless({
				'trigger-A': { regionName: 'zone1', play: true },
			});
			const result = findTriggerToCancel(triggers, 'zone1', 'trigger-A');
			expect(result).to.equal('');
		});

		it('Should return empty string when trigger play is false', () => {
			const triggers = makeTriggerEndless({
				'trigger-A': { regionName: 'zone1', play: false },
			});
			const result = findTriggerToCancel(triggers, 'zone1', 'trigger-B');
			expect(result).to.equal('');
		});
	});

	describe('findTriggerToCancelByEndId', () => {
		it('Should return key when another trigger has end matching the firing ID and is playing', () => {
			const triggers = {
				'trigger1': { seq: { begin: 'trigger1', end: 'trigger2', repeatCount: 'indefinite', dur: '' } },
			} as unknown as { [key: string]: TriggerObject };
			const endless = makeTriggerEndless({
				'trigger1': { regionName: 'zone1', play: true },
			});
			const result = findTriggerToCancelByEndId(triggers, endless, 'trigger2');
			expect(result).to.equal('trigger1');
		});

		it('Should return empty string when no trigger has matching end', () => {
			const triggers = {
				'trigger1': { seq: { begin: 'trigger1', end: 'trigger1', repeatCount: 'indefinite', dur: '' } },
			} as unknown as { [key: string]: TriggerObject };
			const endless = makeTriggerEndless({
				'trigger1': { regionName: 'zone1', play: true },
			});
			const result = findTriggerToCancelByEndId(triggers, endless, 'trigger2');
			expect(result).to.equal('');
		});

		it('Should return empty string when matching trigger is not playing', () => {
			const triggers = {
				'trigger1': { seq: { begin: 'trigger1', end: 'trigger2', repeatCount: 'indefinite', dur: '' } },
			} as unknown as { [key: string]: TriggerObject };
			const endless = makeTriggerEndless({
				'trigger1': { regionName: 'zone1', play: false },
			});
			const result = findTriggerToCancelByEndId(triggers, endless, 'trigger2');
			expect(result).to.equal('');
		});

		it('Should return empty string when triggers object is empty', () => {
			const triggers = {} as { [key: string]: TriggerObject };
			const endless = makeTriggerEndless({});
			const result = findTriggerToCancelByEndId(triggers, endless, 'trigger2');
			expect(result).to.equal('');
		});
	});
});
