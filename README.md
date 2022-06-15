# SMIL player

## How To Install

```
npm install @signageos/smil-player --save-dev
```

## Basic usage

Smil player is configurable either via options object passed in constructor or from signageOS box using timings.

### Basic usage - no signageOS Applet used

When not using signageOS timings you have to specify smil file url.

```ts
import { SmilPlayer } from '@signageos/smil-player';

const smilPlayer = new SmilPlayer({
	smilUrl: 'http://example.com/smilFile.smil'
});

// runs indefinitely
await smilPlayer.start();
```

### Basic usage - with signageOS Applet used

When using signageOS timings you can specify number of options which are directly passed to Smil player itself. List of
options is defined in package.json.
[Timings example](https://docs.signageos.io/hc/en-us/articles/4405231920914-How-to-build-your-own-SMIL-Player-from-source-code#7-smil-player-configuration)

```ts
import { SmilPlayer } from '@signageos/smil-player';

const smilPlayer = new SmilPlayer();

// runs indefinitely
await smilPlayer.start();
```

### More advanced example

Smil player accepts various options which allows you to customize player behaviour.
This is an example how you can inject your custom functionality and modify smil player.

```ts
import { SmilPlayer } from '@signageos/smil-player';

const smilPlayer = new SmilPlayer({
	smilUrl: 'http://example.com/smilFile.smil',
	startupHtmlFile: 'https://my.server.com/ma-startupHtmlFile.html',
	backupImageUrl: 'https://my.server.com/failover-image.png',
	serialPortDevice: '/device/ttyUSB0',
	sync: {
		serverUrl: 'https://applet-synchronizer.com',
		groupName: 'mySyncGroup',
		groupIds: ['Display1', 'Display2', 'Display3'],
		deviceId: 'Display1',
	},
	videoBackground: true,
	onlySmilUpdate: true,
	defaultContentDurationSec: 100,
	validator: (smilFileContent: string): boolean => {
		return MyValidator.validate(smilFileContent);
	},
	smilFileDownloader: async () => {
		const response = await fetch(downloadUrl, {
			method: 'GET',
			headers: {
				'Authorization': MyCustomAuthorizationHeader,
				Accept: 'application/json',
			},
			mode: 'cors',
		});
		return response.json();
	},
	lastModifiedChecker: async (fileSrc: string): Promise<null | string | number> => {
		try {
			const downloadUrl = createDownloadPath(fileSrc);
			const authHeaders = window.getAuthHeaders?.(downloadUrl);
			const promiseRaceArray = [];
			promiseRaceArray.push(
				fetch(downloadUrl, {
					method: 'HEAD',
					headers: {
						...authHeaders,
						Accept: 'application/json',
					},
					mode: 'cors',
				}),
			);
			promiseRaceArray.push(sleep(SMILScheduleEnum.fileCheckTimeout));

			const response = (await Promise.race(promiseRaceArray)) as Response;

			const newLastModified = await response.headers.get('last-modified');
			return newLastModified ? newLastModified : 0;
		} catch (err) {
			debug('Unexpected error occured during lastModified fetch: %O', err);
			return null;
		}
	},
	reporter: async (payload: Payload) => {
		await fetch('https://my-api-url.com/my-endpoint', {
			method: 'POST', // or 'PUT'
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(payload),
		});
	},
	playbackController: async (payload: Payload) => {
		return fetch('https://my-api-url.com/my-endpoint/playbackController', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(payload),
		});
	},
});

// runs indefinitely
await smilPlayer.start();
```

## Table of options

| Option                | Description                                                                                                                                         | 
|-----------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------|
| smilUrl               | Url where actual smil file is hosted.                                                                                                               |
| startupHtmlFile       | Url where smil player welcome html file is hosted.                                                                                                  |
| backupImageUrl        | Url for backup image which is displayed in case player cant download smil file,<br/> or when something goes wrong during xml parsing.               |
| serialPortDevice      | Serial port used for Nexmosphere sensors.                                                                                                           |
| sync.serverUrl        | Url where synchronization server is running. Used during synchronization of <br/>multiple devices.                                                  |
| sync.groupName        | Name of the synchronization group which determines which devices will be synchroniized with each other.                                             |
| sync.groupIds         | Ids of all devices within synchronization group.                                                                                                    |
| sync.deviceId         | Id of current device. Must be present in sync group.                                                                                                |
| videoBackground       | Determines if videos will be playing in background. With this option on, you can use image overlay over videos.                                     |
| onlySmilUpdate        | Determines if smil player will check for updates all media files in smil file, or only smil file itself.                                            |
| defaultContentDuration | Default duration of media when no duration is specified in smil file.                                                                               |
| validator             | Module used for input xml validation.                                                                                                               |
| smilFileDownloader    | Module used for downloading smil file from given url.                                                                                               |
| fetchLastModified     | Module responsible for checking media files for updates.                                                                                            |
| reporter              | Module responsible for reporting about events inside player. Example: content downloaded, content playback started, content playback finished etc.. |
| playbackController    | Module used for checking if current element in playlist should be played or not based on api response                                               |
