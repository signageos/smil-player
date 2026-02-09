import * as chai from 'chai';
import { findTriggerToCancel } from '../../../src/components/playlist/tools/triggerTools';
import { TriggerEndless } from '../../../src/models/triggerModels';
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
});
