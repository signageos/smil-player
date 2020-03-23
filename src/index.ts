declare const jQuery: any;
import sos from '@signageos/front-applet';
import { IStorageUnit } from '@signageos/front-applet/es6/FrontApplet/FileSystem/types';
import { processSmil } from './tools/xmlParse';
import {
	createFileStructure,
	parallelDownloadAllFiles,
	extractWidgets,
	getFileName,
	prepareETagSetup,
	prepareDownloadMediaSetup,
} from './tools/files';
import {
	playIntroVideo, disableLoop,
	setupIntroVideo,
	processingLoop,
} from './tools/playlist';
import { FileStructure } from './enums';
import { SMILFile } from './models';
import { defaults as config } from './config';

async function main(internalStorageUnit: IStorageUnit) {
	const SMILFile: SMILFile = {
		src: config.smil.smilLocation,
	};
	let downloadPromises: Function[];
	let playingIntro = true;

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
	await setupIntroVideo(introVideo, internalStorageUnit, smilObject);

	downloadPromises = await prepareDownloadMediaSetup(internalStorageUnit, smilObject);

	while (playingIntro) {
	    await playIntroVideo(introVideo);
	    Promise.all(downloadPromises).then(() => {
	        playingIntro = false;
	    });
	}

	await extractWidgets(smilObject.ref, internalStorageUnit);

	const {
		fileEtagPromisesMedia: fileEtagPromisesMedia,
		fileEtagPromisesSMIL: fileEtagPromisesSMIL
	} = await prepareETagSetup(internalStorageUnit, smilObject, SMILFile);

	await processingLoop(internalStorageUnit, smilObject, fileEtagPromisesMedia, fileEtagPromisesSMIL);
}

(async () => {

	await sos.onReady();
	console.log('sOS is ready');

	const storageUnits = await sos.fileSystem.listStorageUnits();

	const internalStorageUnit = <IStorageUnit>storageUnits.find((storageUnit) => !storageUnit.removable);

	await createFileStructure(internalStorageUnit);

	while (true) {
		// disable internal endless loops for playing media
		disableLoop(false);
		await main(internalStorageUnit);
	}
})();
