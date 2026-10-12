import { Log } from '../../../logger';
import { EventEmitter } from 'events';
import { SMILVideo } from '../../../models/mediaModels';
import { StreamEnums } from '../../../enums/mediaEnums';
import { ISos } from '../../../models/sosModels';

export class SmilEventEmitter extends EventEmitter {
	constructor(sos: ISos, protected readonly log: Log) {
		super();
		sos.stream.onDisconnected((event) => {
			this.emit(StreamEnums.disconnectedEvent);
			this.log.debug('[events] stream disconnected: %O', event);
		});

		sos.stream.onError((event) => {
			this.emit(StreamEnums.errorEvent);
			this.log.debug('[events] stream error: %O', event);
		});
	}
}

export async function waitForSuccessOrFailEvents(
	eventEmitter: EventEmitter,
	stream: SMILVideo,
	successEvent: string,
	failEvent: string,
	log: Log,
) {
	return new Promise<void>((resolve: () => void, reject: (error: Error) => void) => {
		let successListener: () => void;
		let failListener: () => void;
		successListener = () => {
			eventEmitter.removeListener(failEvent, failListener);
			log.debug('[events] stream success: event=%s, src=%s', successEvent, stream.src);
			resolve();
		};
		failListener = () => {
			eventEmitter.removeListener(successEvent, successListener);
			log.debug('[events] stream fail: event=%s, src=%s', failEvent, stream.src);
			reject(new Error('error: ' + failEvent));
		};
		eventEmitter.once(successEvent, successListener);
		eventEmitter.once(failEvent, failListener);
	});
}
