export const mockSMILFileParsed99 = {
	region: {
		video: {
			regionName: 'video',
			left: '0',
			top: '0',
			width: '1280',
			height: '720',
			'z-index': '1',
			backgroundColor: '#FFFFFF',
			mediaAlign: 'topLeft',
		},
		widget11: {
			regionName: 'widget11',
			left: '0',
			top: '0',
			width: '1920',
			height: '68',
			'z-index': '9',
			backgroundColor: 'transparent',
		},
		widget12: {
			regionName: 'widget12',
			left: '0',
			bottom: '0',
			width: '1280',
			height: '360',
			'z-index': '1',
			backgroundColor: 'transparent',
		},
		widget13: {
			regionName: 'widget13',
			left: '1280',
			top: '0',
			width: '640',
			height: '506',
			'z-index': '1',
			backgroundColor: 'transparent',
		},
		widget14: {
			regionName: 'widget14',
			left: '1280',
			top: '506',
			width: '640',
			height: '574',
			'z-index': '1',
			backgroundColor: 'transparent',
		},
	},
	refresh: {
		expr: undefined,
		refreshInterval: 90,
	},
	rootLayout: {
		width: '1920',
		height: '1080',
		backgroundColor: '#FFFFFF',
		top: '0',
		left: '0',
		regionName: 'rootLayout',
	},
	log: false,
	onlySmilFileUpdate: false,
	playlist: {
		systemComponent: 'http://www.w3.org/1999/xhtml',
		style: 'background-color:#FFFFFF',
		par: {
			seq: [],
			par: {
				begin: '__prefetchEnd.endEvent',
				repeatCount: 'indefinite',
				excl: {
					repeatCount: 'indefinite',
					priorityClass: [
						{
							lower: 'never',
							peer: 'stop',
							higher: 'stop',
							par: {
								begin: 'wallclock(R/2011-01-01T07:00:00/P1D)',
								end: 'wallclock(R/2011-01-01T17:00:00/P1D)',
								seq: {
									repeatCount: 'indefinite',
									excl: {
										begin: '0',
										repeatCount: 'indefinite',
										priorityClass: {
											higher: 'stop',
											pauseDisplay: 'hide',
											par: {
												begin: '0',
												par: [
													{
														seq: {
															repeatCount: 'indefinite',
															ref1: {
																src: 'http://butikstv.centrumkanalen.com/play/render/widgets/ebbapettersson/top/top.wgt',
																type: 'application/widget',
																region: 'widget11',
																dur: '60s',
																param: { name: 'cacheControl', value: 'onlyIfCached' },
															},
														},
													},
													{
														seq: {
															repeatCount: 'indefinite',
															ref2: {
																src: 'http://butikstv.centrumkanalen.com/play/render/widgets/ebbapettersson/vasttrafik/vasttrafik_news.wgt',
																type: 'application/widget',
																region: 'widget12',
																dur: '60s',
																param: { name: 'cacheControl', value: 'onlyIfCached' },
															},
														},
													},
													{
														seq: {
															repeatCount: 'indefinite',
															img3: {
																src: 'http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbalunch.png',
																region: 'widget13',
																dur: '60s',
																param: { name: 'cacheControl', value: 'onlyIfCached' },
															},
														},
													},
													{
														seq: {
															repeatCount: 'indefinite',
															img4: {
																src: 'http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbaical.png',
																region: 'widget14',
																dur: '60s',
																param: { name: 'cacheControl', value: 'onlyIfCached' },
															},
														},
													},
												],
												seq: {
													repeatCount: 'indefinite',
													video5: {
														src: 'http://butikstv.centrumkanalen.com/play/media/rendered/filmer/9820.mp4',
														id: 'annons0',
														fit: 'hidden',
														region: 'video',
														param: { name: 'cacheControl', value: 'auto' },
													},
													video6: {
														src: 'http://butikstv.centrumkanalen.com/play/media/filmer/likabehandlingsdag2020.mp4',
														id: 'annons1',
														fit: 'hidden',
														region: 'video',
														param: { name: 'cacheControl', value: 'auto' },
													},
													video7: {
														src: 'http://butikstv.centrumkanalen.com/play/media/filmer/untitled.mp4',
														id: 'annons2',
														fit: 'hidden',
														region: 'video',
														param: { name: 'cacheControl', value: 'auto' },
													},
													img8: {
														src: 'http://butikstv.centrumkanalen.com/play/media/rendered/bilder/10510.png',
														id: 'annons3',
														dur: '40s',
														fit: 'hidden',
														region: 'video',
														param: { name: 'cacheControl', value: 'auto' },
													},
												},
											},
										},
									},
								},
							},
						},
					],
				},
			},
		},
	},
	video: [
		{ src: 'http://butikstv.centrumkanalen.com/play/media/ladd/landscape.mp4' },
		{
			src: 'http://butikstv.centrumkanalen.com/play/media/rendered/filmer/9820.mp4',
			id: 'annons0',
			fit: 'hidden',
			region: 'video',
			param: { name: 'cacheControl', value: 'auto' },
		},
		{
			src: 'http://butikstv.centrumkanalen.com/play/media/filmer/likabehandlingsdag2020.mp4',
			id: 'annons1',
			fit: 'hidden',
			region: 'video',
			param: { name: 'cacheControl', value: 'auto' },
		},
		{
			src: 'http://butikstv.centrumkanalen.com/play/media/filmer/untitled.mp4',
			id: 'annons2',
			fit: 'hidden',
			region: 'video',
			param: { name: 'cacheControl', value: 'auto' },
		},
	],
	img: [
		{
			src: 'http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbalunch.png',
			region: 'widget13',
			dur: '60s',
			param: { name: 'cacheControl', value: 'onlyIfCached' },
		},
		{
			src: 'http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbaical.png',
			region: 'widget14',
			dur: '60s',
			param: { name: 'cacheControl', value: 'onlyIfCached' },
		},
		{
			src: 'http://butikstv.centrumkanalen.com/play/media/rendered/bilder/10510.png',
			id: 'annons3',
			dur: '40s',
			fit: 'hidden',
			region: 'video',
			param: { name: 'cacheControl', value: 'auto' },
		},
	],
	ref: [
		{
			src: 'http://butikstv.centrumkanalen.com/play/render/widgets/ebbapettersson/top/top.wgt',
			type: 'application/widget',
			region: 'widget11',
			dur: '60s',
			param: { name: 'cacheControl', value: 'onlyIfCached' },
		},
		{
			src: 'http://butikstv.centrumkanalen.com/play/render/widgets/ebbapettersson/vasttrafik/vasttrafik_news.wgt',
			type: 'application/widget',
			region: 'widget12',
			dur: '60s',
			param: { name: 'cacheControl', value: 'onlyIfCached' },
		},
		{ dur: 'indefinite', src: 'adapi:blankScreen' },
	],
	audio: [],
	dynamic: {},
	intro: [
		{
			repeatCount: 'indefinite',
			video0: { src: 'http://butikstv.centrumkanalen.com/play/media/ladd/landscape.mp4' },
		},
	],
	sensors: [],
	transition: {},
	triggerSensorInfo: {},
	triggers: {},
};
