import { debug } from '../tools/generalTools';
import sos from '@signageos/front-applet';
import { EventEmitter } from 'events';
import { SMILVideo } from '../../../models/mediaModels';
import { StreamEnums } from '../../../enums/mediaEnums';
import { IStreamErrorEvent } from '@signageos/front-applet/es6/FrontApplet/Stream/streamEvents';

class SmilEventEmitter extends EventEmitter {
	constructor() {
		super();
		sos.stream.onDisconnected((event) => {
			this.emit(StreamEnums.disconnectedEvent);
			debug('Stream: %O emitted onDisconnected event: %O', event);
		});

		sos.stream.onError((event: IStreamErrorEvent) => {
			this.emit(StreamEnums.errorEvent);
			debug('Stream: %O emitted onError event: %O', event);
		});
	}
}

export async function waitForSuccessOrFailEvents(
	eventEmitter: EventEmitter,
	stream: SMILVideo,
	successEvent: string,
	failEvent: string,
) {
	return new Promise<void>((resolve: () => void, reject: (error: Error) => void) => {
		let successListener: () => void;
		let failListener: () => void;
		successListener = () => {
			eventEmitter.removeListener(failEvent, failListener);
			debug('Stream: %O emitted %s event', stream, successEvent);
			resolve();
		};
		failListener = () => {
			eventEmitter.removeListener(successEvent, successListener);
			debug('Stream: %O emitted %s event', stream, failEvent);
			reject(new Error('error: ' + failEvent));
		};
		eventEmitter.once(successEvent, successListener);
		eventEmitter.once(failEvent, failListener);
	});
}

export const smilEventEmitter = new SmilEventEmitter();
