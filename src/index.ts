declare const jQuery: any;
import { processSmil, getFileName } from "./xmlParse";
import { playTimedMedia, sleep, createFileStructure, parallelDownloadAllFiles, processPlaylist, extractWidgets } from "./tools";
import sos from '@signageos/front-applet';
import { FileStructure } from './enums';


(async ()=> {
    // Wait on sos data are ready (https://docs.signageos.io/api/sos-applet-api/#onReady)
    await sos.onReady();
    console.log('sOS is ready');

    // Storage units are equivalent to disk volumes (C:, D: etc on Windows; /mnt/disc1, /mnt/disc2 on Unix)
    const storageUnits = await sos.fileSystem.listStorageUnits();

    // Every platform has at least one not removable storage unit (internal storage unit)
    const internalStorageUnit = storageUnits.find((storageUnit) => !storageUnit.removable);

    await createFileStructure(internalStorageUnit);

    console.log('directory hierarchy created');

    await sos.fileSystem.downloadFile({
            storageUnit: internalStorageUnit,
            filePath: `${FileStructure.rootFolder}/${getFileName('https://cors-anywhere.herokuapp.com/https://butikstv.centrumkanalen.com/play/smil/99.smil')}`
        },
        'https://cors-anywhere.herokuapp.com/https://butikstv.centrumkanalen.com/play/smil/99.smil',
    );

    const smilFileContent = await sos.fileSystem.readFile({
        storageUnit: internalStorageUnit,
        filePath: `${FileStructure.rootFolder}/${getFileName('http://butikstv.centrumkanalen.com/play/smil/99.smil')}`
    });

    const smilObject = await processSmil(smilFileContent);

    let downloadPromises = [];

    downloadPromises = downloadPromises.concat(parallelDownloadAllFiles(internalStorageUnit, smilObject.video, FileStructure.videos));
    downloadPromises = downloadPromises.concat(parallelDownloadAllFiles(internalStorageUnit, smilObject.audio, FileStructure.audios));
    downloadPromises = downloadPromises.concat(parallelDownloadAllFiles(internalStorageUnit, smilObject.img, FileStructure.images));
    downloadPromises = downloadPromises.concat(parallelDownloadAllFiles(internalStorageUnit, smilObject.ref, FileStructure.widgets));

    await Promise.all(downloadPromises);

    console.log('media downloaded');

    await extractWidgets(smilObject.ref, internalStorageUnit);

    console.log('widgets extracted');

    await processPlaylist(smilObject.playlist, smilObject.region, internalStorageUnit);

})();
