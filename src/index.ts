// declare const jQuery: any;
//
// // You need to wait for this event always (https://docs.signageos.io/api/sos-applet-api/#Basics)
// window.addEventListener('sos.loaded', async function () {
// 	const sos = window.sos;
// 	const contentElement = document.getElementById('index');
// 	console.log('sOS is loaded');
// 	contentElement.innerHTML = 'sOS is loaded';
//
//
// 	// Wait on sos data are ready (https://docs.signageos.io/api/sos-applet-api/#onReady)
// 	await sos.onReady();
// 	console.log('sOS is ready');
// 	contentElement.innerHTML = 'sOS is ready';
//
//
// 	// Allow use jQuery (or any other JS library) in offline (https://docs.signageos.io/api/sos-applet-api/#Offline_Applet_Resources)
// 	await sos.offline.addFilesSync([
// 		{
// 			uri: "https://ajax.googleapis.com/ajax/libs/jquery/2.2.4/jquery.min.js",
// 			uid: "jquery-2.2.4.min.js",
// 			type: sos.offline.types.javascript,
// 			flags: [sos.offline.flags.append(document.body)],
// 		},
// 	]);
//
//
// 	// Now, let's use jQuery in combination with global Promise
// 	await new Promise((resolve) =>
// 		jQuery(contentElement).fadeOut(2e3, () => resolve())
// 	);
//
//
// 	// Save some of your data localy & safely (https://docs.signageos.io/api/sos-applet-api/#Offline_Cache_for_storing_simple_data)
// 	try {
// 		// And use it any time
// 		const firstLoadTimestamp = await sos.offline.cache.loadContent('first-load-timestamp');
// 		contentElement.innerHTML = 'First time loaded: ' + new Date(parseInt(firstLoadTimestamp));
// 	} catch (error) {
// 		contentElement.innerHTML = 'This is loaded first time! Use REFRESH to show first load time.';
// 		await sos.offline.cache.saveContent('first-load-timestamp', new Date().valueOf().toString());
// 	}
// 	await new Promise((resolve) =>
// 		jQuery(contentElement).fadeIn('slow', () => resolve())
// 	);
//
//
// 	// Store video to offline storage (https://docs.signageos.io/api/sos-applet-api/#Load_or_Save_specific_file_into_internal_memory)
// 	const { filePath } = await sos.offline.cache.loadOrSaveFile('intro-video', 'https://static.signageos.io/assets/video-test-1_e07fc21a7a72e3d33478243bd75d7743.mp4');
//
//
// 	// For video coordinations compution use document.body (https://docs.signageos.io/screen-width-and-height-on-webos-1/)
// 	const videoAgruments: [string, number, number, number, number] = [filePath, 60, 100, document.body.offsetWidth - 2 * 60, Math.round((document.body.offsetWidth - 2 * 60) * (3 / 4))];
// 	while (true) {
// 		// Videos are identificated by URI & coordination together (https://docs.signageos.io/api/sos-applet-api/#Play_video)
// 		await sos.video.prepare(...videoAgruments);
// 		await sos.video.play(...videoAgruments);
// 		await sos.video.onceEnded(...videoAgruments); // https://docs.signageos.io/api/sos-applet-api/#onceEnded
// 		await sos.video.stop(...videoAgruments);
// 	}
// });
