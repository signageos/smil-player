declare const jQuery: any;
import { processSmil } from "./xmlParse";
import sos from '@signageos/front-applet';

(async ()=> {
    const contentElement = document.getElementById('index');
    console.log('sOS is loaded');
    contentElement.innerHTML = 'sOS is loaded';
    // Wait on sos data are ready (https://docs.signageos.io/api/sos-applet-api/#onReady)
    await sos.onReady();
    console.log('sOS is ready');
    const smilObject = await processSmil('http://butikstv.centrumkanalen.com/play/smil/234.smil');
    console.log('testing smil');
    console.log(smilObject);
})();
