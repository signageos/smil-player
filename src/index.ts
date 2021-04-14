// declare const jQuery: any;
import { applyFetchPolyfill } from './polyfills/fetch';
applyFetchPolyfill();
import sos from '@signageos/front-applet';
import { isNil } from 'lodash';
import Debug from 'debug';
import FrontApplet from '@signageos/front-applet/es6/FrontApplet/FrontApplet';
import { IStorageUnit } from '@signageos/front-applet/es6/FrontApplet/FileSystem/types';

import { processSmil } from './components/xmlParser/xmlParse';
import { Files } from './components/files/files';
import { Playlist } from './components/playlist/playlist';
import { SMILEnums } from './enums/generalEnums';
import { createLocalFilePath, getFileName } from './components/files/tools';
import { FileStructure } from './enums/fileEnums';
import { SMILFile, SMILFileObject } from './models/filesModels';
import { errorVisibility, sleep } from './components/playlist/tools/generalTools';
import { resetBodyContent } from './components/playlist/tools/htmlTools';
const files = new Files(sos);

const debug = Debug('@signageos/smil-player:main');

async function main(internalStorageUnit: IStorageUnit, smilUrl: string, thisSos: FrontApplet) {
	const playlist = new Playlist(sos, files);
	// enable internal endless loops for playing media
	playlist.disableLoop(false);
	// enable endless loop for checking files updated
	playlist.setCheckFilesLoop(true);

	const smilFile: SMILFile = {
		src: smilUrl,
	};
	let downloadPromises: Promise<Function[]>[] = [];
	let forceDownload = false;

	// set smilUrl in files instance ( links to files might me in media/file.mp4 format )
	files.setSmilUrl(smilUrl);

	let smilFileContent: string = '';

	// wait for successful download of SMIL file, if download or read from internal storage fails
	// wait for one minute and then try to download it again
	while (smilFileContent === '') {
		try {
			// download SMIL file if device has internet connection and smil file exists on remote server
			if (!isNil(await files.fetchLastModified(smilFile.src))) {
				forceDownload = true;
				downloadPromises = await files.parallelDownloadAllFiles(internalStorageUnit, [smilFile], FileStructure.rootFolder, forceDownload);
				await Promise.all(downloadPromises);
			}

			smilFileContent = await thisSos.fileSystem.readFile({
				storageUnit: internalStorageUnit,
				filePath: `${FileStructure.rootFolder}/${getFileName(smilFile.src)}`,
			});

			debug('SMIL file downloaded');
			downloadPromises = [];

		} catch (err) {
			debug('Unexpected error occurred during smil file download : %O', err);
			// allow error display only during manual start
			if (!sos.config.smilUrl) {
				errorVisibility(true);
			}
			await sleep(SMILEnums.defaultDownloadRetry * 1000);
		}
	}

	resetBodyContent();

	const smilObject: SMILFileObject = await processSmil(smilFileContent);
	debug('SMIL file parsed: %O', smilObject);

	// download and play intro file if exists ( image or video )
	if (smilObject.intro.length > 0) {
		await playlist.playIntro(smilObject, internalStorageUnit, smilUrl);
	} else {
		// no intro
		debug('No intro element found');
		downloadPromises = await files.prepareDownloadMediaSetup(internalStorageUnit, smilObject);
		await Promise.all(downloadPromises);
		debug('SMIL media files download finished');
		await playlist.manageFilesAndInfo(smilObject, internalStorageUnit, smilUrl);
	}

	debug('Starting to process parsed smil file');
	await playlist.processingLoop(internalStorageUnit, smilObject, smilFile);
}

async function startSmil(smilUrl: string) {
	const storageUnits = await sos.fileSystem.listStorageUnits();

	// reference to persistent storage unit, where player stores all content
	const internalStorageUnit = <IStorageUnit> storageUnits.find((storageUnit) => !storageUnit.removable);

	await files.createFileStructure(internalStorageUnit);

	debug('File structure created');

	if (await files.fileExists(internalStorageUnit, createLocalFilePath(FileStructure.smilMediaInfo, FileStructure.smilMediaInfoFileName))) {
		const fileContent = JSON.parse(await files.readFile(
			internalStorageUnit, createLocalFilePath(FileStructure.smilMediaInfo, FileStructure.smilMediaInfoFileName)));

		// delete mediaInfo file only in case that currently played smil is different from previous
		if (!fileContent.hasOwnProperty(getFileName(smilUrl))) {
			// delete mediaInfo file, so each smil has fresh start for lastModified tags for files
			await files.deleteFile(internalStorageUnit, createLocalFilePath(FileStructure.smilMediaInfo, FileStructure.smilMediaInfoFileName));
		}
	}

	while (true) {
		try {
			await main(internalStorageUnit, smilUrl, sos);
			debug('One smil iteration finished');
		} catch (err) {
			debug('Unexpected error : %O', err);
			await sleep(SMILEnums.defaultRefresh * 1000);
		}
	}
}
// self invoking function to start smil processing if smilUrl is defined in sos.config via timings
(async() => {
	await sos.onReady();
	if (sos.config.smilUrl) {
		debug('sOS is ready');
		debug('Smil file url is: %s', sos.config.smilUrl);
		await startSmil(sos.config.smilUrl);
	}
})();

// get values from form onSubmit and start processing
const smilForm = <HTMLElement> document.getElementById('SMILUrlWrapper');
smilForm.onsubmit = async function (event: Event) {
	event.preventDefault();
	const smilUrl = (<HTMLInputElement> document.getElementById('SMILUrl')).value;
	debug('Smil file url is: %s', smilUrl);
	await startSmil(smilUrl);
};
