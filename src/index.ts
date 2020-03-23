declare const jQuery: any;
import sos from '@signageos/front-applet';
import { parallel } from 'async';
import { IStorageUnit } from '@signageos/front-applet/es6/FrontApplet/FileSystem/types';
import { processSmil } from './xmlParse';
import {
	createFileStructure,
	parallelDownloadAllFiles,
	extractWidgets,
	getFileName,
	checkFileEtag,
	sleep,
} from './tools/files';
import {
	processPlaylist,
	playIntroVideo, disableLoop,
	runEndlessLoop, setupIntroVideo,
} from './tools/playlist';
import { FileStructure } from './enums';
import { defaults as config } from './config';

async function main(internalStorageUnit: IStorageUnit) {
	const SMILFile = {
		src: config.smil.smilLocation,
	};
	let downloadPromises = [];
	let fileEtagPromisesMedia = [];
	let fileEtagPromisesSMIL = [];
	let playingIntro = true;
	let checkFilesLoop = true;

	// download SMIL file
	downloadPromises = parallelDownloadAllFiles(internalStorageUnit, [SMILFile], FileStructure.rootFolder);

	await Promise.all(downloadPromises);
	downloadPromises = [];

	const smilFileContent = await sos.fileSystem.readFile({
		storageUnit: internalStorageUnit,
		filePath: `${FileStructure.rootFolder}/${getFileName(SMILFile.src)}`
	});

	const smilObject = await processSmil(smilFileContent);

	// download intro file
	downloadPromises = downloadPromises.concat(parallelDownloadAllFiles(internalStorageUnit, [smilObject.video[0]], FileStructure.videos));

	await Promise.all(downloadPromises);

	const introVideo = smilObject.video[0];
	await setupIntroVideo(introVideo, internalStorageUnit, smilObject.region);

	downloadPromises = [];

	smilObject.video.splice(0, 1);

	downloadPromises = downloadPromises.concat(parallelDownloadAllFiles(internalStorageUnit, smilObject.video, FileStructure.videos));
	downloadPromises = downloadPromises.concat(parallelDownloadAllFiles(internalStorageUnit, smilObject.audio, FileStructure.audios));
	downloadPromises = downloadPromises.concat(parallelDownloadAllFiles(internalStorageUnit, smilObject.img, FileStructure.images));
	downloadPromises = downloadPromises.concat(parallelDownloadAllFiles(internalStorageUnit, smilObject.ref, FileStructure.widgets));

	while (playingIntro) {
	    await playIntroVideo(introVideo);
	    Promise.all(downloadPromises).then(() => {
	        playingIntro = false;
	    });
	}

	console.log('media downloaded');

	await extractWidgets(smilObject.ref, internalStorageUnit);
	console.log('widgets extracted');

	fileEtagPromisesMedia = fileEtagPromisesMedia.concat(checkFileEtag(internalStorageUnit, smilObject.video, FileStructure.videos));
	fileEtagPromisesMedia = fileEtagPromisesMedia.concat(checkFileEtag(internalStorageUnit, smilObject.audio, FileStructure.audios));
	fileEtagPromisesMedia = fileEtagPromisesMedia.concat(checkFileEtag(internalStorageUnit, smilObject.img, FileStructure.images));
	fileEtagPromisesMedia = fileEtagPromisesMedia.concat(checkFileEtag(internalStorageUnit, smilObject.ref, FileStructure.widgets));

	fileEtagPromisesSMIL = fileEtagPromisesSMIL.concat(checkFileEtag(internalStorageUnit, [SMILFile], FileStructure.rootFolder));

	await new Promise((resolve, reject) => {
		parallel([
			async () => {
				while (checkFilesLoop) {
					await sleep(120000);
					const response = await Promise.all(fileEtagPromisesSMIL);
					if (response[0].length > 0) {
						disableLoop(true);
						return;
					}
					await Promise.all(fileEtagPromisesMedia);
				}
			},
			async () => {
				await runEndlessLoop(async () => {
					await processPlaylist(smilObject.playlist, smilObject.region, internalStorageUnit);
				});
			},
		], async (err) => {
			if (err) {
				reject(err);
			}
			resolve();
		});
	});

	console.log('function end');
}

(async () => {

	await sos.onReady();
	console.log('sOS is ready');

	const storageUnits = await sos.fileSystem.listStorageUnits();

	const internalStorageUnit = storageUnits.find((storageUnit) => !storageUnit.removable);

	await createFileStructure(internalStorageUnit);

	console.log('directory hierarchy created');

	while (true) {
		// disable internal endless loops for playing media
		disableLoop(false);
		await main(internalStorageUnit);
	}
})();
