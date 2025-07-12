import should from 'should';
import sinon from 'sinon';
import { MasterSelector } from '../../../src/VideoPlayback/Sync/MasterSelector';
import { MockSyncGroup } from "./MockSyncGroup";
import { wait } from '../../../src/VideoPlayback/util';

describe('Sync.MasterSelector', () => {
	describe('isMaster', () => {
		it('should return true by default', async () => {
			const syncGroup = new MockSyncGroup();
			const masterSelector = new MasterSelector(syncGroup, false);
			should(masterSelector.isMaster()).be.true();
		});

		it("should return true when other peers announced but this device has lowest joinedAt", async () => {
			const syncGroup = new MockSyncGroup();
			const masterSelector = new MasterSelector(syncGroup, false);

			syncGroup.emitValue({ key: 'announce', value: { id: 'b', joinedAt: Date.now() + 1, hasPriority: false } });
			syncGroup.emitValue({ key: 'announce', value: { id: 'c', joinedAt: Date.now() + 2, hasPriority: false } });
			await wait(1); // allow for async operations to finish

			should(masterSelector.isMaster()).be.true();
		});

		it("should return false when other peers announced and one of them has lower joinedAt", async () => {
			const syncGroup = new MockSyncGroup();
			const masterSelector = new MasterSelector(syncGroup, false);

			syncGroup.emitValue({ key: 'announce', value: { id: 'b', joinedAt: Date.now() - 10e3, hasPriority: false } });
			syncGroup.emitValue({ key: 'announce', value: { id: 'c', joinedAt: Date.now() + 2, hasPriority: false } });
			await wait(1); // allow for async operations to finish

			should(masterSelector.isMaster()).be.false();
		});

		it("should return false when other peers announced and one of them has priority", async () => {
			const syncGroup = new MockSyncGroup();
			const masterSelector = new MasterSelector(syncGroup, false);

			syncGroup.emitValue({ key: 'announce', value: { id: 'b', joinedAt: Date.now() + 1, hasPriority: true } });
			syncGroup.emitValue({ key: 'announce', value: { id: 'c', joinedAt: Date.now() + 2, hasPriority: false } });
			await wait(1); // allow for async operations to finish

			should(masterSelector.isMaster()).be.false();
		});

		it("should return true when other peers announced and this device has priority", async () => {
			const syncGroup = new MockSyncGroup();
			const masterSelector = new MasterSelector(syncGroup, true);

			syncGroup.emitValue({ key: 'announce', value: { id: 'b', joinedAt: Date.now() + 1, hasPriority: false } });
			syncGroup.emitValue({ key: 'announce', value: { id: 'c', joinedAt: Date.now() + 2, hasPriority: false } });
			await wait(1); // allow for async operations to finish

			should(masterSelector.isMaster()).be.true();
		});

		it('should return true when both this device and other peer have priority but this device has lower joinedAt', async () => {
			const syncGroup = new MockSyncGroup();
			const masterSelector = new MasterSelector(syncGroup, true);

			syncGroup.emitValue({ key: 'announce', value: { id: 'b', joinedAt: Date.now() + 1, hasPriority: true } });
			syncGroup.emitValue({ key: 'announce', value: { id: 'c', joinedAt: Date.now() + 2, hasPriority: true } });
			await wait(1); // allow for async operations to finish

			should(masterSelector.isMaster()).be.true();
		});

		it('should return true when all other peers are dropped', async () => {
			const syncGroup = new MockSyncGroup();
			const masterSelector = new MasterSelector(syncGroup, false);

			syncGroup.emitValue({ key: 'announce', value: { id: 'b', joinedAt: Date.now() - 10e3, hasPriority: true } });
			syncGroup.emitValue({ key: 'announce', value: { id: 'c', joinedAt: Date.now() - 10e3, hasPriority: true } });
			await wait(1); // allow for async operations to finish

			syncGroup.emitStatus([]);
			await wait(1); // allow for async operations to finish

			should(masterSelector.isMaster()).be.true();
		});

		it("should return true when peer who was master got dropped but there's another peer who isn't supposed to be master", async () => {
			const syncGroup = new MockSyncGroup();
			const masterSelector = new MasterSelector(syncGroup, false);

			syncGroup.emitValue({ key: 'announce', value: { id: 'b', joinedAt: Date.now() - 10e3, hasPriority: true } });
			syncGroup.emitValue({ key: 'announce', value: { id: 'c', joinedAt: Date.now() + 2, hasPriority: false } });
			await wait(1); // allow for async operations to finish

			syncGroup.emitStatus(['c']);
			await wait(1); // allow for async operations to finish

			should(masterSelector.isMaster()).be.true();
		});
	});

	describe('onMasterChange', () => {
		it('should emit each time this device goes from master to slave or vice versa', async () => {
			const syncGroup = new MockSyncGroup();
			const masterSelector = new MasterSelector(syncGroup, false);
			const callback = sinon.stub().callsFake((isMaster) => {
				should(isMaster).be.a.Boolean();
				should(masterSelector.isMaster()).equal(isMaster);
			});

			masterSelector.onMasterChange(callback);

			// b will become master
			syncGroup.emitValue({ key: 'announce', value: { id: 'b', joinedAt: Date.now() + 1, hasPriority: true } });
			syncGroup.emitValue({ key: 'announce', value: { id: 'c', joinedAt: Date.now() + 2, hasPriority: false } });
			await wait(1); // allow for async operations to finish

			should(callback.callCount).equal(1);
			should(callback.firstCall.args[0]).be.false();

			// b drops, this device becomes master again
			syncGroup.emitStatus(['c']);
			await wait(1); // allow for async operations to finish

			should(callback.callCount).equal(2);
			should(callback.secondCall.args[0]).be.true();

			// b joins again but this time won't be master so no change
			syncGroup.emitValue({ key: 'announce', value: { id: 'b', joinedAt: Date.now() + 1, hasPriority: false } });
			await wait(1); // allow for async operations to finish

			should(callback.callCount).equal(2);

			// d joins and has priority, becomes master
			syncGroup.emitValue({ key: 'announce', value: { id: 'd', joinedAt: Date.now() + 1, hasPriority: true } });
			await wait(1); // allow for async operations to finish

			should(callback.callCount).equal(3);
			should(callback.thirdCall.args[0]).be.false();
		});
	});
});
