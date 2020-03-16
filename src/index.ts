declare const jQuery: any;
import { processSmil, getFileName } from "./xmlParse";
import { playTimedMedia, sleep, createFileStructure, parallelDownloadAllFiles } from "./tools";
import sos from '@signageos/front-applet';
import { FileStructure } from './enums';


(async ()=> {
    const contentElement = document.getElementById('index');
    const iframeElement = document.getElementById('iframe');
    const imageElement = document.getElementById('image');

    console.log('sOS is loaded');
    contentElement.innerHTML = 'sOS is loaded';
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

    // Empty string '' refers to root directory. Here is root directory of internal storage
    let rootDirectoryFilePaths = await sos.fileSystem.listFiles({
        filePath: FileStructure.rootFolder,
        storageUnit: internalStorageUnit
    });

    contentElement.innerHTML += `Internal storage root directory listing: <br />`;
    for (const filePath of rootDirectoryFilePaths) {
        // Property filePath.filePath contains string representation of path separated by slash / for nested files (or dirs)
        contentElement.innerHTML += `- ${filePath.filePath} <br />`;
    }

    // Empty string '' refers to root directory. Here is root directory of internal storage
    rootDirectoryFilePaths = await sos.fileSystem.listFiles({
        filePath: '',
        storageUnit: internalStorageUnit
    });

    contentElement.innerHTML += `Internal storage root directory listing2: <br />`;
    for (const filePath of rootDirectoryFilePaths) {
        // Property filePath.filePath contains string representation of path separated by slash / for nested files (or dirs)
        contentElement.innerHTML += `- ${filePath.filePath} <br />`;
    }

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

    for (let i = 0; i < smilObject.img.length ; i += 1) {
        const mediaFile = await sos.fileSystem.getFile({ storageUnit: internalStorageUnit, filePath: `${FileStructure.rootFolder}/images/${getFileName(smilObject.img[i].src)}`});
        await playTimedMedia(imageElement, mediaFile.localUri, parseInt(smilObject.img[i].dur, 10) * 1000);
    }

    await sleep(10000);

    for (let i = 0; true; i = (i + 1) % smilObject.video.length) {
        const previousVideo = smilObject.video[(i + smilObject.video.length - 1) % smilObject.video.length];
        const currentVideo = smilObject.video[i];
        const nextVideo = smilObject.video[(i + 1) % smilObject.video.length];
        const currentVideoDetails = await sos.fileSystem.getFile({ storageUnit: internalStorageUnit, filePath: `${FileStructure.rootFolder}/videos/${getFileName(currentVideo.src)}`});
        const previousVideoDetails = await sos.fileSystem.getFile({ storageUnit: internalStorageUnit, filePath: `${FileStructure.rootFolder}/videos/${getFileName(previousVideo.src)}`});
        const nextVideoDetails = await sos.fileSystem.getFile({ storageUnit: internalStorageUnit, filePath: `${FileStructure.rootFolder}/videos/${getFileName(nextVideo.src)}`});


        currentVideo.localFilePath = currentVideoDetails.localUri;
        previousVideo.localFilePath = previousVideoDetails.localUri;
        nextVideo.localFilePath = nextVideoDetails.localUri;

        console.log('playing');
        // Videos are identificated by URI & coordination together (https://docs.signageos.io/api/sos-applet-api/#Play_video)
        await sos.video.play(currentVideo.localFilePath, 0, 0, 500, 500);
        currentVideo.playing = true;
        if (previousVideo.playing) {
            await sos.video.stop(previousVideo.localFilePath, 0, 0, 500, 500);
            previousVideo.playing = false;
        }
        await sos.video.prepare(nextVideo.localFilePath, 0, 0, 500, 500);
        await sos.video.onceEnded(currentVideo.localFilePath, 0, 0, 500, 500); // https://docs.signageos.io/api/sos-applet-api/#onceEnded
    }
})();
