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
// import { defaults as config } from './config';
import Debug from 'debug';
import { getFileName } from "./components/files/tools";
import { disableLoop } from "./components/playlist/tools";
const files = new Files(sos);
const playlist = new Playlist(sos, files);

const debug = Debug('@signageos/smil-player:main');

async function main(internalStorageUnit: IStorageUnit, smilUrl: string, thisSos: SosModule) {
	const smilFile: SMILFile = {
		src: smilUrl,
	};
	let downloadPromises: Promise<Function[]>[];
	let playingIntro = true;

	// set smilUrl in files instance ( links to files might me in media/file.mp4 format )
	files.setSmilUrl(smilUrl);

	// download SMIL file
	downloadPromises = files.parallelDownloadAllFiles(internalStorageUnit, [smilFile], FileStructure.rootFolder);

	await Promise.all(downloadPromises);
	debug('SMIL file downloaded');
	downloadPromises = [];

	const smilFileContent = await thisSos.fileSystem.readFile({
		storageUnit: internalStorageUnit,
		filePath: `${FileStructure.rootFolder}/${getFileName(smilFile.src)}`,
	});

	const smilObject = await processSmil(smilFileContent);
	debug('SMIL file parsed: %O', smilObject);

	// download intro file if exists
	if (smilObject.intro.length > 0) {
		downloadPromises = downloadPromises.concat(
			files.parallelDownloadAllFiles(internalStorageUnit, [smilObject.intro[0].video], FileStructure.videos),
		);

		await Promise.all(downloadPromises);

		const introVideo: any = smilObject.intro[0];
		await playlist.setupIntroVideo(introVideo.video, internalStorageUnit, smilObject);

		debug('Intro video downloaded: %O', introVideo);

		downloadPromises = await files.prepareDownloadMediaSetup(internalStorageUnit, smilObject);

		while (playingIntro) {
			debug('Playing intro');
			// set intro url in playlist to exclude it from further playing
			playlist.setIntroUrl(introVideo);
			await playlist.playIntroVideo(introVideo.video);
			await Promise.all(downloadPromises).then(async () =>  {
				debug('SMIL media files download finished, stopping intro');
				await playlist.endIntroVideo(introVideo.video);
				playingIntro = false;
			});
		}
	} else {
		// no intro
		debug('No intro video found');
		downloadPromises = await files.prepareDownloadMediaSetup(internalStorageUnit, smilObject);
		await Promise.all(downloadPromises);
		debug('SMIL media files download finished');
	}

	await files.extractWidgets(smilObject.ref, internalStorageUnit);

	debug('Widgets extracted');

	const {
		fileEtagPromisesMedia: fileEtagPromisesMedia,
		fileEtagPromisesSMIL: fileEtagPromisesSMIL,
	} = await files.prepareETagSetup(internalStorageUnit, smilObject, smilFile);

	debug('ETag check for smil media files prepared');

	debug('Starting to process parsed smil file');
	await playlist.processingLoop(internalStorageUnit, smilObject, fileEtagPromisesMedia, fileEtagPromisesSMIL);
}

async function startSmil(smilUrl: string) {
	const storageUnits = await sos.fileSystem.listStorageUnits();

	const internalStorageUnit = <IStorageUnit> storageUnits.find((storageUnit) => !storageUnit.removable);

	await files.createFileStructure(internalStorageUnit);

	debug('file structure created');

	while (true) {
		try {
			// disable internal endless loops for playing media
			disableLoop(false);
			await main(internalStorageUnit, smilUrl, sos);
			debug('one smil iteration finished');
		} catch (err) {
			debug('Unexpected error : %O', err);
			throw err;
		}

	}
}

// get values from form onSubmit
const smilForm = <HTMLElement> document.getElementById('SMILForm');
smilForm.onsubmit = async function (event: Event) {
	event.preventDefault();
	// const smilUrl = (<HTMLInputElement> document.getElementById("SMILUrl")).value;
	// debug('Smil file url is: %s', sos.config.smilUrl);
	// debug('Smil file url is: %s', smilUrl);
	// await startSmil(smilUrl);
	// reset body
	document.body.innerHTML = '';
	document.body.style.backgroundColor = 'transparent';
	await sos.onReady();
	debug('sOS is ready');
	debug('Smil file url is: %s', sos.config.smilUrl);
	await startSmil(sos.config.smilUrl);
};
