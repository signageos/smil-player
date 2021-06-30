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
	rootLayout: {
		width: "1920",
		height: "1080",
		backgroundColor: "#FFFFFF",
		top: "0",
		left: "0",
		regionName: "rootLayout",
	},
	log: true,
	onlySmilFileUpdate: false,
	playlist: {
		systemComponent: "http://www.w3.org/1999/xhtml",
		style: "background-color:#FFFFFF",
		par: {
			seq: [],
			par: {
				begin: "__prefetchEnd.endEvent",
				repeatCount: "indefinite",
				excl: {
					repeatCount: "indefinite",
					priorityClass: {
						lower: "never",
						peer: "stop",
						higher: "stop",
						par: {
							begin: "wallclock(R/2011-01-01T00:00:00/P1D)",
							end: "wallclock(R/2011-01-01T23:00:00/P1D)",
							seq: {
								repeatCount: "indefinite",
								excl: {
									begin: "0",
									repeatCount: "indefinite",
									priorityClass: {
										higher: "stop",
										pauseDisplay: "hide",
										par: {
											begin: "0",
											par: [{
												seq: {
													repeatCount: "1",
													video1: {
														src: "https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/samples/assets/landscape1.mp4",
														type: "application/widget",
														region: "video",
														param: {name: "cacheControl", value: "onlyIfCached"},
													},
													video2: {
														src: "https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/samples/assets/landscape1.mp4",
														type: "application/widget",
														region: "video",
														param: {name: "cacheControl", value: "onlyIfCached"},
													},
												},
											}, {}, {}, {}],
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
		video0: {src: "http://butikstv.centrumkanalen.com/play/media/ladd/landscape.mp4"},
	}],
	sensors: [{type: "rfid", id: "rfid1", driver: "nexmosphere", address: "003"}, {
		type: "rfid",
		id: "rfid2",
		driver: "nexmosphere",
		address: "005",
	}, {type: "rfid", id: "rfid3", driver: "nexmosphere", address: "007", test5: "111"}],
	transition: {},
	triggerSensorInfo: {
		"rfid1-1": {
			trigger: "trigger3",
			stringCondition: "or",
			condition: [{action: "placed"}],
		},
		"rfid2-2": {trigger: "trigger3", stringCondition: "or", condition: [{action: "placed"}]},
		"rfid3-3": {trigger: "trigger2", stringCondition: "or", condition: [{action: "placed"}]},
	},
	triggers: {
		trigger: {
			seq: {
				begin: "trigger",
				img3: {
					src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbalunch.png",
					region: "widget13",
					dur: "60s",
					param: {name: "cacheControl", value: "onlyIfCached"},
				},
			},
		},
		trigger2: {
			seq: {
				begin: "trigger2",
				video4: {
					src: "https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/zones/files/video_3.mp4",
					id: "annons1",
					fit: "hidden",
					region: "video",
					param: {name: "cacheControl", value: "auto"},
				},
				video5: {
					src: "https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/zones/files/video_3.mp4",
					id: "annons1",
					fit: "hidden",
					region: "video",
					param: {name: "cacheControl", value: "auto"},
				},
			},
		},
		trigger3: {
			seq: {
				begin: "trigger3",
				video6: {
					src: "https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/zones/files/video_3.mp4",
					id: "annons1",
					fit: "hidden",
					region: "video",
					param: {name: "cacheControl", value: "auto"},
				},
				video7: {
					src: "https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/samples/assets/landscape2.mp4",
					id: "annons1",
					fit: "hidden",
					region: "video",
					param: {name: "cacheControl", value: "auto"},
				},
			},
		},
	},
};
