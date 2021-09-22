// declare const jQuery: any;
import { applyFetchPolyfill } from './polyfills/fetch';
// @ts-ignore
import backupImage from '../public/backupImage/backupImage.jpg';
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
import { generateBackupImagePlaylist, getDefaultRegion, sleep, removeWhitespace } from './components/playlist/tools/generalTools';
import { resetBodyContent, setTransitionsDefinition } from './components/playlist/tools/htmlTools';
import { SMILScheduleEnum } from './enums/scheduleEnums';

const files = new Files(sos);
const debug = Debug('@signageos/smil-player:main');
const playlist = new Playlist(sos, files);

export async function main(internalStorageUnit: IStorageUnit, smilUrl: string, thisSos: FrontApplet, playIntro: boolean = true) {
	// allow endless functions to play endlessly
	playlist.disableLoop(false);

	const smilFile: SMILFile = {
		src: smilUrl,
	};
	let downloadPromises: Promise<Function[]>[] = [];
	let forceDownload = false;

	// set smilUrl in files instance ( links to files might me in media/file.mp4 format )
	files.setSmilUrl(smilUrl);

	try {
		if (!isNil(sos.config.backupImageUrl) && !isNil(await files.fetchLastModified(sos.config.backupImageUrl))) {
			forceDownload = true;
			const backupImageObject = {
				src: sos.config.backupImageUrl,
			};
			downloadPromises = await files.parallelDownloadAllFiles(internalStorageUnit, [backupImageObject], FileStructure.images, forceDownload);
			await Promise.all(downloadPromises);
		}
	} catch (err) {
		debug('Unexpected error occurred during backup image download : %O', err);
	}

	let smilFileContent: string = '';
	let xmlOkParsed: boolean = false;

	// wait for successful download of SMIL file, if download or read from internal storage fails
	// wait for one minute and then try to download it again
	while (smilFileContent === '' || !xmlOkParsed) {
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

			const smilObject: SMILFileObject = await processSmil(smilFileContent);
			debug('SMIL file parsed: %O', smilObject);

			await files.sendSmiFileReport(`${FileStructure.rootFolder}/${getFileName(smilFile.src)}`, smilFile.src);

			// set variable to enable/disable events logs
			files.setSmiLogging(smilObject.log);

			setTransitionsDefinition(smilObject);

			// download and play intro file if exists  ( image or video ) and if its first iteration of playlist
			// seamlessly updated playlist dont start with intro
			if ( smilObject.intro.length > 0 && playIntro) {
				await playlist.playIntro(smilObject, internalStorageUnit, smilUrl);
			} else {
				// no intro
				debug('No intro element found');
				downloadPromises = await files.prepareDownloadMediaSetup(internalStorageUnit, smilObject);
				await Promise.all(downloadPromises);
				debug('SMIL media files download finished');
				await playlist.manageFilesAndInfo(smilObject, internalStorageUnit, smilUrl);
			}

			// smil processing ok, end loop
			xmlOkParsed = true;

			debug('Starting to process parsed smil file');
			await playlist.processingLoop(internalStorageUnit, smilObject, smilFile);

		} catch (err) {

			if (smilFileContent === '') {
				debug('Unexpected error occurred during smil file download : %O', err);
			} else {
				debug('Unexpected error during xml parse: %O', err);
				await files.sendSmiFileReport(`${FileStructure.rootFolder}/${getFileName(smilFile.src)}`, smilFile.src, err.message);
			}

			debug('Starting to play backup image');
			const backupImageUrl = !isNil(sos.config.backupImageUrl) ? sos.config.backupImageUrl : backupImage;
			const backupPlaylist = generateBackupImagePlaylist(backupImageUrl, '1');
			const regionInfo = <SMILFileObject> getDefaultRegion();

			await playlist.getAllInfo(backupPlaylist, regionInfo, internalStorageUnit);
			if (isNil(sos.config.backupImageUrl)) {
				backupPlaylist.seq.img.localFilePath = backupImageUrl;
			}
			await playlist.processPlaylist(backupPlaylist, SMILScheduleEnum.backupImagePlaylistVersion);
			await sleep(SMILEnums.defaultDownloadRetry * 1000);
		}
	}
}

async function startSmil(smilUrl: string) {
	const storageUnits = await sos.fileSystem.listStorageUnits();

	// reference to persistent storage unit, where player stores all content
	const internalStorageUnit = <IStorageUnit> storageUnits.find((storageUnit) => !storageUnit.removable);

	await files.createFileStructure(internalStorageUnit);

	debug('File structure created');

	if (await files.fileExists(internalStorageUnit, createLocalFilePath(FileStructure.smilMediaInfo, FileStructure.smilMediaInfoFileName))) {
		try {
			const fileContent = JSON.parse(await files.readFile(
				internalStorageUnit, createLocalFilePath(FileStructure.smilMediaInfo, FileStructure.smilMediaInfoFileName)));

			// delete mediaInfo file only in case that currently played smil is different from previous
			if (!fileContent.hasOwnProperty(getFileName(smilUrl))) {
				// delete mediaInfo file, so each smil has fresh start for lastModified tags for files
				await files.deleteFile(internalStorageUnit, createLocalFilePath(FileStructure.smilMediaInfo, FileStructure.smilMediaInfoFileName));
			}
		} catch (err) {
			debug('Malformed file: %s , deleting', FileStructure.smilMediaInfoFileName);
			// file is malformed, delete from internal storage
			await files.deleteFile(internalStorageUnit, createLocalFilePath(FileStructure.smilMediaInfo, FileStructure.smilMediaInfoFileName));
		}
	}

	resetBodyContent();

	while (true) {
		try {
			const startVersion = playlist.getPlaylistVersion();
			debug('One smil iteration finished START' + startVersion);
			await main(internalStorageUnit, smilUrl, sos);
			const finishVersion = playlist.getPlaylistVersion();
			if (startVersion < finishVersion) {
				debug('Playlist ended and was replaced with new version of playlist');
				break;
			}
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
		const smilUrl = removeWhitespace(sos.config.smilUrl);
		debug('Smil file url is: %s', smilUrl);
		await startSmil(smilUrl);
	}
})();

// get values from form onSubmit and start processing
const smilForm = <HTMLElement> document.getElementById('SMILUrlWrapper');
smilForm.onsubmit = async function (event: Event) {
	event.preventDefault();
	const smilUrl = removeWhitespace((<HTMLInputElement> document.getElementById('SMILUrl')).value);
	debug('Smil file url is: %s', smilUrl);
	await startSmil(smilUrl);
};
