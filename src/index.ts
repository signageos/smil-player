// declare const jQuery: any;
import { applyFetchPolyfill } from '@signageos/front-display/es6/polyfills/fetch';
applyFetchPolyfill();
import sos from '@signageos/front-applet';
import { IStorageUnit } from '@signageos/front-applet/es6/FrontApplet/FileSystem/types';
import { processSmil } from './components/xmlParser/xmlParse';
import { Files } from './components/files/files';
import { Playlist } from './components/playlist/playlist';
import { FileStructure } from './enums';
import { SMILFile, SosModule } from './models';
import { defaults as config } from './config';
import Debug from 'debug';
import { getFileName } from "./components/files/tools";
import { disableLoop } from "./components/playlist/tools";
const files = new Files(sos);
const playlist = new Playlist(sos, files);

const debug = Debug('@signageos/smil-player:main');

async function main(internalStorageUnit: IStorageUnit, sos: SosModule) {
	const SMILFile: SMILFile = {
		src: config.smil.smilLocation,
	};
	let downloadPromises: Promise<Function[]>[];
	let playingIntro = true;

	// download SMIL file
	downloadPromises = files.parallelDownloadAllFiles(internalStorageUnit, [SMILFile], FileStructure.rootFolder);

	await Promise.all(downloadPromises);
	debug('SMIL file downloaded');
	downloadPromises = [];

	const smilFileContent = await sos.fileSystem.readFile({
		storageUnit: internalStorageUnit,
		filePath: `${FileStructure.rootFolder}/${getFileName(SMILFile.src)}`
	});

	console.log(JSON.stringify(smilFileContent));

	const smilObject = await processSmil(smilFileContent);

	debug('SMIL file parsed: %O', smilObject);

	// download intro file
	downloadPromises = downloadPromises.concat(files.parallelDownloadAllFiles(internalStorageUnit, [smilObject.video[0]], FileStructure.videos));

	await Promise.all(downloadPromises);

	const introVideo = smilObject.video[0];
	await playlist.setupIntroVideo(introVideo, internalStorageUnit, smilObject);

	debug('Intro video downloaded: %O', introVideo);

	downloadPromises = await files.prepareDownloadMediaSetup(internalStorageUnit, smilObject);

	while (playingIntro) {
		debug('Playing intro');
		await playlist.playIntroVideo(introVideo);
	    Promise.all(downloadPromises).then(() => {
			debug('SMIL media files download finished, stopping intro');
			playingIntro = false;
	    });
	}

	await files.extractWidgets(smilObject.ref, internalStorageUnit);

	debug('Widgets extracted');

	const {
		fileEtagPromisesMedia: fileEtagPromisesMedia,
		fileEtagPromisesSMIL: fileEtagPromisesSMIL
	} = await files.prepareETagSetup(internalStorageUnit, smilObject, SMILFile);

	debug('ETag check for smil media files prepared');

	debug('Starting to process parsed smil file');
	await playlist.processingLoop(internalStorageUnit, smilObject, fileEtagPromisesMedia, fileEtagPromisesSMIL);
}

(async () => {

	await sos.onReady();
	debug('sOS is ready');

	const storageUnits = await sos.fileSystem.listStorageUnits();

	const internalStorageUnit = <IStorageUnit>storageUnits.find((storageUnit) => !storageUnit.removable);

	await files.createFileStructure(internalStorageUnit);

	debug('file structure created');

	while (true) {
		try {
			// disable internal endless loops for playing media
			disableLoop(false);
			await main(internalStorageUnit, sos);
			debug('one smil iteration finished');
		} catch (err) {
			debug('Unexpected error : %O', err);
			throw err;
		}

	}
})();
