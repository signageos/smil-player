// declare const jQuery: any;
import sos from '@signageos/front-applet';
import { IStorageUnit } from '@signageos/front-applet/es6/FrontApplet/FileSystem/types';
import { processSmil } from './components/xmlParser/xmlParse';
import {
	createFileStructure,
	parallelDownloadAllFiles,
	extractWidgets,
	prepareETagSetup,
	prepareDownloadMediaSetup,
} from './components/files/files';
import {
	playIntroVideo, setupIntroVideo,
	processingLoop,
} from './components/playlist/playlist';
import { FileStructure } from './enums';
import { SMILFile } from './models';
import { defaults as config } from './config';
import Debug from 'debug';
import {getFileName} from "./components/files/tools";
import {disableLoop} from "./components/playlist/tools";

const debug = Debug('main');

async function main(internalStorageUnit: IStorageUnit) {
	const SMILFile: SMILFile = {
		src: config.smil.smilLocation,
	};
	let downloadPromises: Function[];
	let playingIntro = true;

	// download SMIL file
	downloadPromises = parallelDownloadAllFiles(internalStorageUnit, [SMILFile], FileStructure.rootFolder);

	await Promise.all(downloadPromises);
	debug('SMIL file downloaded');
	downloadPromises = [];

	const smilFileContent = await sos.fileSystem.readFile({
		storageUnit: internalStorageUnit,
		filePath: `${FileStructure.rootFolder}/${getFileName(SMILFile.src)}`
	});

	const smilObject = await processSmil(smilFileContent);

	debug('SMIL file parsed: %O', smilObject);

	// download intro file
	downloadPromises = downloadPromises.concat(parallelDownloadAllFiles(internalStorageUnit, [smilObject.video[0]], FileStructure.videos));

	await Promise.all(downloadPromises);

	const introVideo = smilObject.video[0];
	await setupIntroVideo(introVideo, internalStorageUnit, smilObject);

	debug('Intro video downloaded: %O', introVideo);

	downloadPromises = await prepareDownloadMediaSetup(internalStorageUnit, smilObject);

	while (playingIntro) {
		debug('Playing intro');
		await playIntroVideo(introVideo);
	    Promise.all(downloadPromises).then(() => {
			debug('SMIL media files download finished, stopping intro');
			playingIntro = false;
	    });
	}

	await extractWidgets(smilObject.ref, internalStorageUnit);

	debug('Widgets extracted');

	const {
		fileEtagPromisesMedia: fileEtagPromisesMedia,
		fileEtagPromisesSMIL: fileEtagPromisesSMIL
	} = await prepareETagSetup(internalStorageUnit, smilObject, SMILFile);

	debug('ETag check for smil media files prepared');

	debug('Starting to process parsed smil file');
	await processingLoop(internalStorageUnit, smilObject, fileEtagPromisesMedia, fileEtagPromisesSMIL);
}

(async () => {

	await sos.onReady();
	debug('sOS is ready');

	const storageUnits = await sos.fileSystem.listStorageUnits();

	const internalStorageUnit = <IStorageUnit>storageUnits.find((storageUnit) => !storageUnit.removable);

	await createFileStructure(internalStorageUnit);

	debug('file structure created');

	while (true) {
		// disable internal endless loops for playing media
		disableLoop(false);
		await main(internalStorageUnit);
		debug('one smil iteration finished');
	}
})();
