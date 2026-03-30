import * as chai from 'chai';
import { createPriorityObject } from '../../../src/components/playlist/tools/priorityTools';
import { PriorityDefault } from '../../../src/enums/priorityEnums';
import { PriorityObject } from '../../../src/models/priorityModels';

const expect = chai.expect;

describe('priorityTools', () => {
	describe('createPriorityObject', () => {
		it('Should use provided lower, peer, higher, and pauseDisplay values', () => {
			const input: PriorityObject = {
				priorityLevel: 0,
				maxPriorityLevel: 0,
				lower: 'never',
				peer: 'stop',
				higher: 'pause',
				pauseDisplay: 'hide',
			};
			const result = createPriorityObject(input, 1, 3);
			expect(result.lower).to.equal('never');
			expect(result.peer).to.equal('stop');
			expect(result.higher).to.equal('pause');
			expect(result.pauseDisplay).to.equal('hide');
		});

		it('Should fall back to PriorityDefault values when not provided', () => {
			const input: PriorityObject = {
				priorityLevel: 0,
				maxPriorityLevel: 0,
				lower: undefined as any,
				peer: undefined as any,
				higher: undefined as any,
				pauseDisplay: undefined as any,
			};
			const result = createPriorityObject(input, 1, 3);
			expect(result.lower).to.equal(PriorityDefault.lower);
			expect(result.peer).to.equal(PriorityDefault.peer);
			expect(result.higher).to.equal(PriorityDefault.higher);
			expect(result.pauseDisplay).to.equal(PriorityDefault.pauseDisplay);
		});

		it('Should pass through priorityLevel and maxPriorityLevel', () => {
			const input: PriorityObject = {
				priorityLevel: 0,
				maxPriorityLevel: 0,
				lower: 'defer',
				peer: 'never',
				higher: 'stop',
			};
			const result = createPriorityObject(input, 7, 10);
			expect(result.priorityLevel).to.equal(7);
			expect(result.maxPriorityLevel).to.equal(10);
		});
	});
});
