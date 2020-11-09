export const mockSMILFileTriggers = {
	region: {
		video: {
			regionName: "video",
			left: "10",
			top: "10",
			width: "1280",
			height: "720",
			"z-index": "1",
			backgroundColor: "#FFFFFF",
			mediaAlign: "topLeft",
			region: [{
				regionName: "video1",
				left: "0",
				top: "0",
				width: "640",
				height: "720",
				"z-index": "1",
				backgroundColor: "transparent",
			}, {
				regionName: "video2",
				left: "640",
				top: "0",
				width: "640",
				height: "720",
				"z-index": "1",
				backgroundColor: "transparent",
			}],
		},
		widget13: {
			regionName: "widget13",
			left: "1280",
			top: "0",
			width: "640",
			height: "506",
			"z-index": "1",
			backgroundColor: "transparent",
		},
		widget14: {
			regionName: "widget14",
			left: "1280",
			top: "506",
			width: "640",
			height: "574",
			"z-index": "1",
			backgroundColor: "transparent",
		},
	},
	refresh: 90,
	rootLayout: {width: "1920", height: "1080", backgroundColor: "#FFFFFF", top: "0", left: "0"},
	playlist: {
		systemComponent: "http://www.w3.org/1999/xhtml", style: "background-color:#FFFFFF", par: {
			seq: [{
				end: "__prefetchEnd.endEvent",
				seq: {
					repeatCount: "indefinite",
					video: {src: "http://butikstv.centrumkanalen.com/play/media/ladd/landscape.mp4"},
				},
			}, {
				prefetch: [{src: "http://butikstv.centrumkanalen.com/play/media/rendered/filmer/9820.mp4"}, {src: "http://butikstv.centrumkanalen.com/play/media/filmer/likabehandlingsdag2020.mp4"}, {src: "http://butikstv.centrumkanalen.com/play/media/filmer/untitled.mp4"}, {src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/10510.png"}, {src: "http://butikstv.centrumkanalen.com/play/render/widgets/ebbapettersson/top/top.wgt"}, {src: "http://butikstv.centrumkanalen.com/play/render/widgets/ebbapettersson/vasttrafik/vasttrafik_news.wgt"}, {src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbalunch.png"}, {src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbaical.png"}],
				seq: {id: "__prefetchEnd", dur: "1s"},
			}], par: {
				begin: "__prefetchEnd.endEvent", repeatCount: "indefinite", excl: {
					repeatCount: "indefinite", priorityClass: {
						lower: "never", peer: "stop", higher: "stop", par: {
							begin: "wallclock(R/2011-01-01T00:00:00/P1D)",
							end: "wallclock(R/2011-01-01T23:00:00/P1D)",
							seq: {
								repeatCount: "indefinite", excl: {
									begin: "0", repeatCount: "indefinite", priorityClass: {
										higher: "stop", pauseDisplay: "hide", par: {
											begin: "0",
											par: [{
												repeatCount: "indefinite",
												seq: [{dur: "60s"}, {
													prefetch: [
														{src: "http://butikstv.centrumkanalen.com/play/render/widgets/ebbapettersson/top/top.wgt"}, {src: "http://butikstv.centrumkanalen.com/play/render/widgets/ebbapettersson/vasttrafik/vasttrafik_news.wgt"}, {src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbalunch.png"}, {src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbaical.png"}],
												}],
											}, {
												seq: {
													repeatCount: "1",
													video: [{
														src: "https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/samples/assets/landscape1.mp4",
														type: "application/widget",
														region: "video",
														param: {name: "cacheControl", value: "onlyIfCached"},
													}, {
														src: "https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/samples/assets/landscape1.mp4",
														type: "application/widget",
														region: "video",
														param: {name: "cacheControl", value: "onlyIfCached"},
													}],
												},
											}, {
												seq: {
													begin: "trigger",
													img: {
														src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbalunch.png",
														region: "widget13",
														dur: "60s",
														param: {name: "cacheControl", value: "onlyIfCached"},
													},
												},
											}, {
												seq: {
													begin: "trigger2",
													video: [{
														src: "https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/zones/files/video_3.mp4",
														id: "annons1",
														fit: "hidden",
														region: "video",
														param: {name: "cacheControl", value: "auto"},
													}, {
														src: "https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/zones/files/video_3.mp4",
														id: "annons1",
														fit: "hidden",
														region: "video",
														param: {name: "cacheControl", value: "auto"},
													}],
												},
											}, {
												seq: {
													begin: "trigger3",
													video: [{
														src: "https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/zones/files/video_3.mp4",
														id: "annons1",
														fit: "hidden",
														region: "video",
														param: {name: "cacheControl", value: "auto"},
													}, {
														src: "https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/samples/assets/landscape2.mp4",
														id: "annons1",
														fit: "hidden",
														region: "video",
														param: {name: "cacheControl", value: "auto"},
													}],
												},
											}],
										},
									},
								},
							},
						},
					},
				},
			},
		},
	},
	video: [{src: "http://butikstv.centrumkanalen.com/play/media/ladd/landscape.mp4"}, {
		src: "https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/samples/assets/landscape1.mp4",
		type: "application/widget",
		region: "video",
		param: {name: "cacheControl", value: "onlyIfCached"},
	}, {
		src: "https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/zones/files/video_3.mp4",
		id: "annons1",
		fit: "hidden",
		region: "video",
		param: {name: "cacheControl", value: "auto"},
	}, {
		src: "https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/samples/assets/landscape2.mp4",
		id: "annons1",
		fit: "hidden",
		region: "video",
		param: {name: "cacheControl", value: "auto"},
	}],
	img: [{
		src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbalunch.png",
		region: "widget13",
		dur: "60s",
		param: {name: "cacheControl", value: "onlyIfCached"},
	}],
	ref: [],
	audio: [],
	intro: [{
		repeatCount: "indefinite",
		video: {src: "http://butikstv.centrumkanalen.com/play/media/ladd/landscape.mp4"},
	}],
	sensors: [
		{
			address: "003",
			driver: "nexmosphere",
			id: "rfid1",
			type: "rfid",
		},
		{
			address: "005",
			driver: "nexmosphere",
			id: "rfid2",
			type: "rfid",
		},
		{
			address: "007",
			test5: "111",
			driver: "nexmosphere",
			id: "rfid3",
			type: "rfid",
		},
	],
	triggerSensorInfo: {
		"rfid1-1": {
			condition: [
				{
					action: "placed",
				},
			],
			stringCondition: "or",
			trigger: "trigger3",
		},
		"rfid2-2": {
			condition: [
				{
					action: "placed",
				},
			],
			stringCondition: "or",
			trigger: "trigger3",
		},
		"rfid3-3": {
			condition: [
				{
					action: "placed",
				},
			],
			stringCondition: "or",
			trigger: "trigger2",
		},
	},
	triggers: {
		trigger: {
			begin: "trigger",
			img: {
				src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbalunch.png",
				region: "widget13",
				dur: "60s",
				param: {name: "cacheControl", value: "onlyIfCached"},
			},
		},
		trigger2: {
			begin: "trigger2",
			video: [{
				src: "https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/zones/files/video_3.mp4",
				id: "annons1",
				fit: "hidden",
				region: "video",
				param: {name: "cacheControl", value: "auto"},
			}, {
				src: "https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/zones/files/video_3.mp4",
				id: "annons1",
				fit: "hidden",
				region: "video",
				param: {name: "cacheControl", value: "auto"},
			}],
		},
		trigger3: {
			begin: "trigger3",
			video: [{
				src: "https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/zones/files/video_3.mp4",
				id: "annons1",
				fit: "hidden",
				region: "video",
				param: {name: "cacheControl", value: "auto"},
			}, {
				src: "https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/samples/assets/landscape2.mp4",
				id: "annons1",
				fit: "hidden",
				region: "video",
				param: {name: "cacheControl", value: "auto"},
			}],
		},
	},
};
