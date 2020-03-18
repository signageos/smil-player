declare const jQuery: any;
import { processSmil } from './xmlParse';
import {
    createFileStructure,
    parallelDownloadAllFiles,
    extractWidgets,
    getFileName,
} from './tools/files';
import {
    processPlaylist,
    getRegionInfo, playIntroVideo
} from './tools/playlist';
import sos from '@signageos/front-applet';
import { FileStructure } from './enums';
import { defaults as config } from './config';


(async ()=> {
    const smilLocation = config.smil.smilLocation;
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

    // const response = await fetch(smilObject.video[0].src, {
    //     method: 'HEAD',
    //     headers: {
    //         Accept: 'application/json',
    //     },
    // });
    //
    // const info = await response.headers.get('Content-Type');
    // const info2 = await response.headers.get('ETag');
    // console.log(info);
    // console.log(info2);

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
