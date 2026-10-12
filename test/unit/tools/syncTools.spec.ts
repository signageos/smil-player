import * as chai from 'chai';
import { createSyncTools, initSyncObject, hasDynamicContent } from '../../../src/components/playlist/tools/syncTools';
import { noopLog } from '../../../src/logger';
import { SMILFileObject } from '../../../src/models/filesModels';

const expect = chai.expect;

describe('syncTools', () => {
	it('createSyncTools exposes sync and dynamic functions', () => {
		const t = createSyncTools(noopLog);
		[
			'broadcastEndActionToAllDynamics',
			'joinAllSyncGroupsOnSmilStart',
			'createSyncGroup',
			'connectSyncSafe',
			'joinSyncGroup',
			'broadcastSyncValue',
			'cancelDynamicPlaylistMaster',
		].forEach((k) => expect((t as any)[k]).to.be.a('function'));
	});

	describe('initSyncObject', () => {
		it('should return an object with shouldSync set to false', () => {
			const sync = initSyncObject();
			expect(sync.shouldSync).to.equal(false);
		});

		it('should return empty syncGroupIds array', () => {
			const sync = initSyncObject();
			expect(sync.syncGroupIds).to.eql([]);
		});

		it('should return empty syncGroupName', () => {
			const sync = initSyncObject();
			expect(sync.syncGroupName).to.equal('');
		});

		it('should return empty syncDeviceId', () => {
			const sync = initSyncObject();
			expect(sync.syncDeviceId).to.equal('');
		});

		it('should return syncingInAction as false', () => {
			const sync = initSyncObject();
			expect(sync.syncingInAction).to.equal(false);
		});

		it('should return shouldCancelAll as true', () => {
			const sync = initSyncObject();
			expect(sync.shouldCancelAll).to.equal(true);
		});

		it('should return a fresh object each time (not shared reference)', () => {
			const sync1 = initSyncObject();
			const sync2 = initSyncObject();
			expect(sync1).to.not.equal(sync2);
			sync1.shouldSync = true;
			expect(sync2.shouldSync).to.equal(false);
		});
	});

	describe('hasDynamicContent', () => {
		it('should return false for empty dynamic object', () => {
			const smilObject = { dynamic: {} } as SMILFileObject;
			expect(hasDynamicContent(smilObject)).to.equal(false);
		});

		it('should return true for non-empty dynamic object', () => {
			const smilObject = {
				dynamic: { 'dyn-1': { src: 'http://example.com', regionName: 'main' } },
			} as unknown as SMILFileObject;
			expect(hasDynamicContent(smilObject)).to.equal(true);
		});

		it('should return true for multiple dynamic entries', () => {
			const smilObject = {
				dynamic: {
					'dyn-1': { src: 'http://example.com/1' },
					'dyn-2': { src: 'http://example.com/2' },
				},
			} as unknown as SMILFileObject;
			expect(hasDynamicContent(smilObject)).to.equal(true);
		});
	});
});
