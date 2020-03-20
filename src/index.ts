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
} from './tools/files';
import {
    processPlaylist,
    getRegionInfo, playIntroVideo, disableLoop
} from './tools/playlist';
import { FileStructure } from './enums';
import { defaults as config } from './config';

async function main(internalStorageUnit: IStorageUnit) {
    const SMILFile = {
        src: config.smil.smilLocation,
        etag: '',
    };
    let downloadPromises = [];
    let fileEtagPromisesMedia = [];
    let fileEtagPromisesSMIL = [];
    let playingIntro = true;
    let checkFilesLoop = true;

    await sos.fileSystem.downloadFile({
            storageUnit: internalStorageUnit,
            filePath: `${FileStructure.rootFolder}/${getFileName(`https://cors-anywhere.herokuapp.com/${SMILFile.src}`)}`
        },
        `https://cors-anywhere.herokuapp.com/${SMILFile.src}`,
    );

    const smilFileContent = await sos.fileSystem.readFile({
        storageUnit: internalStorageUnit,
        filePath: `${FileStructure.rootFolder}/${getFileName(SMILFile.src)}`
    });

    const smilObject = await processSmil(smilFileContent);

    downloadPromises = downloadPromises.concat(parallelDownloadAllFiles(internalStorageUnit, [smilObject.video[0]], FileStructure.videos));

    await Promise.all(downloadPromises);

    downloadPromises = [];

    downloadPromises = downloadPromises.concat(parallelDownloadAllFiles(internalStorageUnit, smilObject.video, FileStructure.videos));
    downloadPromises = downloadPromises.concat(parallelDownloadAllFiles(internalStorageUnit, smilObject.audio, FileStructure.audios));
    downloadPromises = downloadPromises.concat(parallelDownloadAllFiles(internalStorageUnit, smilObject.img, FileStructure.images));
    downloadPromises = downloadPromises.concat(parallelDownloadAllFiles(internalStorageUnit, smilObject.ref, FileStructure.widgets));

    while (playingIntro) {
        smilObject.video[0].regionInfo = getRegionInfo(smilObject.region, smilObject.video[0].region);
        await playIntroVideo(smilObject.video[0], internalStorageUnit);
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
                    // await sleep(20000);
                    if (fileEtagPromisesSMIL.length > 0) {
                        disableLoop(true);
                        checkFilesLoop = false;
                        await Promise.all(fileEtagPromisesSMIL);
                        return;
                    }
                    await Promise.all(fileEtagPromisesMedia);
                }
            },
            async () => {
                await processPlaylist(smilObject.playlist, smilObject.region, internalStorageUnit);
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

(async ()=> {

    await sos.onReady();
    console.log('sOS is ready');

    const storageUnits = await sos.fileSystem.listStorageUnits();

    const internalStorageUnit = storageUnits.find((storageUnit) => !storageUnit.removable);

    await createFileStructure(internalStorageUnit);

    console.log('directory hierarchy created');
    while (true) {
        disableLoop(false);
        await main(internalStorageUnit);
    }
})();
