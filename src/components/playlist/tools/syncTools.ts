import FrontApplet from '@signageos/front-applet/es6/FrontApplet/FrontApplet';
import { Synchronization } from '../../../models/syncModels';
import { SyncEngine } from '@signageos/front-applet/es6/FrontApplet/Sync/Sync';
import { sleep } from './generalTools';

// sets synchronization object to its starting values
export function initSyncObject(): Synchronization {
	return {
		syncValue: undefined,
		shouldSync: false,
		syncGroupIds: [],
		syncGroupName: '',
		syncDeviceId: '',
		syncingInAction: false,
		movingForward: false,
		shouldCancelAll: true,
	};
}

export async function connectSyncSafe(
	sos: FrontApplet,
	retryCount: number = 3,
) {
	try {
		// await this.sos.sync.connect('ws://localhost:8085');
		await sos.sync.connect({ engine: SyncEngine.Udp });
		resetAppRestartCount();
	} catch (error) {
		const nextTryMultiplier = 1 / (Math.log(retryCount) + 1);
		await sleep(nextTryMultiplier * 2000);
		if (retryCount > 0) {
			await connectSyncSafe(sos, retryCount - 1);
		} else {
			await limitedAppRestart(sos);
			throw error;
		}
	}
}

async function limitedAppRestart(sos: FrontApplet) {
	const restartCounter = getAppRestartCount();
	if (restartCounter <= 3) {
		incrementAppRestartCount();
		await sos.management.power.appRestart();
	}
}

const APP_RESTART_COUNTER_KEY = '__smil_player_app_restart_counter__';

function getAppRestartCount() {
	return parseInt(localStorage.getItem(APP_RESTART_COUNTER_KEY) || '0');
}

function incrementAppRestartCount() {
	const count = getAppRestartCount();
	localStorage.setItem(APP_RESTART_COUNTER_KEY, (count + 1).toString());
}

function resetAppRestartCount() {
	localStorage.removeItem(APP_RESTART_COUNTER_KEY);
}
