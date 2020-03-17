declare const jQuery: any;
import { processSmil, getFileName } from "./xmlParse";
import {
    createFileStructure,
    parallelDownloadAllFiles,
    processPlaylist,
    extractWidgets,
    getRegionInfo, playIntroVideo
} from "./tools";
import sos from '@signageos/front-applet';
import { FileStructure } from './enums';


(async ()=> {
    const smilLocation = 'https://butikstv.centrumkanalen.com/play/smil/99.smil';
    let downloadPromises = [];
    let playingIntro = true;
    await sos.onReady();
    console.log('sOS is ready');

    const storageUnits = await sos.fileSystem.listStorageUnits();

    const internalStorageUnit = storageUnits.find((storageUnit) => !storageUnit.removable);

    await createFileStructure(internalStorageUnit);

    console.log('directory hierarchy created');

    await sos.fileSystem.downloadFile({
            storageUnit: internalStorageUnit,
            filePath: `${FileStructure.rootFolder}/${getFileName(`https://cors-anywhere.herokuapp.com/${smilLocation}`)}`
        },
        `https://cors-anywhere.herokuapp.com/${smilLocation}`,
    );

    const smilFileContent = await sos.fileSystem.readFile({
        storageUnit: internalStorageUnit,
        filePath: `${FileStructure.rootFolder}/${getFileName(smilLocation)}`
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

    await processPlaylist(smilObject.playlist, smilObject.region, internalStorageUnit);

})();
