declare const jQuery: any;
import { processSmil, getFileName, sleep } from "./xmlParse";
import sos from '@signageos/front-applet';
import { FileStructure } from './enums';

(async ()=> {
    const contentElement = document.getElementById('index');
    console.log('sOS is loaded');
    contentElement.innerHTML = 'sOS is loaded';
    // Wait on sos data are ready (https://docs.signageos.io/api/sos-applet-api/#onReady)
    await sos.onReady();
    console.log('sOS is ready');

    // Storage units are equivalent to disk volumes (C:, D: etc on Windows; /mnt/disc1, /mnt/disc2 on Unix)
    const storageUnits = await sos.fileSystem.listStorageUnits();

    // Every platform has at least one not removable storage unit (internal storage unit)
    const internalStorageUnit = storageUnits.find((storageUnit) => !storageUnit.removable);

    console.log(`storage unit ${JSON.stringify(internalStorageUnit)}`);


    // You can create directory in root directory of internal storage (not rescursive)
    // First clean path if exists
    if (await sos.fileSystem.exists({
        storageUnit: internalStorageUnit,
        filePath: FileStructure.folder
    })) {
        await sos.fileSystem.deleteFile({
            storageUnit: internalStorageUnit,
            filePath: FileStructure.folder
        }, true);
    }

    // create directory for smil files
    await sos.fileSystem.createDirectory({
        storageUnit: internalStorageUnit,
        filePath: FileStructure.folder
    });

    // create directory for smil files
    await sos.fileSystem.createDirectory({
        storageUnit: internalStorageUnit,
        filePath: `${FileStructure.folder}/videos`
    });

    console.log('directory created');

    await sos.fileSystem.downloadFile({
            storageUnit: internalStorageUnit,
            filePath: `${FileStructure.folder}/${getFileName('https://cors-anywhere.herokuapp.com/https://butikstv.centrumkanalen.com/play/smil/234.smil')}`
        },
        'https://cors-anywhere.herokuapp.com/https://butikstv.centrumkanalen.com/play/smil/234.smil',
    );

    console.log(`smil downloaded ${FileStructure.folder}/${getFileName('https://butikstv.centrumkanalen.com/play/smil/234.smil')}`);

    // Empty string '' refers to root directory. Here is root directory of internal storage
    let rootDirectoryFilePaths = await sos.fileSystem.listFiles({
        filePath: FileStructure.folder,
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
        filePath: `${FileStructure.folder}/${getFileName('http://butikstv.centrumkanalen.com/play/smil/234.smil')}`
    });


    const smilObject = await processSmil(smilFileContent);

    // download smil videos to localstorage
    for(let i = 0; i < smilObject.videos.length; i++) {
        await sos.fileSystem.downloadFile({
                storageUnit: internalStorageUnit,
                filePath: `${FileStructure.folder}/videos/${getFileName(smilObject.videos[i].src)}`
            },
            smilObject.videos[i].src,
        );
    }

    console.log('videos downloaded');

    // Empty string '' refers to root directory. Here is root directory of internal storage
    rootDirectoryFilePaths = await sos.fileSystem.listFiles({
        filePath: `${FileStructure.folder}/videos`,
        storageUnit: internalStorageUnit
    });

    contentElement.innerHTML += `Internal storage root directory listing: <br />`;
    for (const filePath of rootDirectoryFilePaths) {
        // Property filePath.filePath contains string representation of path separated by slash / for nested files (or dirs)
        contentElement.innerHTML += `- ${filePath.filePath} <br />`;
    }

    contentElement.innerHTML = '';

    for (let i = 0; true; i = (i + 1) % smilObject.videos.length) {
        const previousVideo = smilObject.videos[(i + smilObject.videos.length - 1) % smilObject.videos.length];
        const currentVideo = smilObject.videos[i];
        const nextVideo = smilObject.videos[(i + 1) % smilObject.videos.length];
        const currentVideoDetails = await sos.fileSystem.getFile({ storageUnit: internalStorageUnit, filePath: `${FileStructure.folder}/videos/${getFileName(currentVideo.src)}`});
        const previousVideoDetails = await sos.fileSystem.getFile({ storageUnit: internalStorageUnit, filePath: `${FileStructure.folder}/videos/${getFileName(previousVideo.src)}`});
        const nextVideoDetails = await sos.fileSystem.getFile({ storageUnit: internalStorageUnit, filePath: `${FileStructure.folder}/videos/${getFileName(nextVideo.src)}`});


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


    //
    // await sleep(5000);
    //
    // while (true) {
    //     const promises = [];
    //     for (let i = 5; i < smilObject.videos.length; i++) {
    //         promises.push((async function() {
    //             const currentVideo = smilObject.videos[i];
    //             currentVideo.localFilePath = `filesystem:http://192.168.1.38:8090/persistent/${FileStructure.folder}/videos/${getFileName(currentVideo.src)}`;
    //             console.log(`configure video play ${FileStructure.folder}/videos/${getFileName(currentVideo.src)}`);
    //             // Videos are identificated by URI & coordination together (https://docs.signageos.io/api/sos-applet-api/#Play_video)
    //             await sos.video.prepare(currentVideo.localFilePath, i*50, i*50, 500, 500);
    //             await sos.video.play(currentVideo.localFilePath, i*50, i*50, 500, 500);
    //             await sos.video.onceEnded(currentVideo.localFilePath, i*50, i*50, 500, 500);
    //             await sos.video.stop(currentVideo.localFilePath, i*50, i*50, 500, 500);
    //         })());
    //     }
    //     console.log(`playing videos`);
    //     await Promise.all(promises);
    // }

})();
