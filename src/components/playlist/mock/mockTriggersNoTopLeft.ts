export const mockSMILFileTriggersNoTopLeft = {
	region: {
		video: {
			regionName: "video",
			width: "1280",
			height: "720",
			"z-index": "1",
			backgroundColor: "#FFFFFF",
			mediaAlign: "topLeft",
			region: [
				{
					regionName: "video1",
					width: "640",
					height: "720",
					"z-index": "1",
					backgroundColor: "transparent",
				},
				{
					regionName: "video2",
					width: "640",
					height: "720",
					"z-index": "1",
					backgroundColor: "transparent",
				},
			],
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
	},
	playlist: {
		systemComponent: "http://www.w3.org/1999/xhtml",
		style: "background-color:#FFFFFF",
		par: {
			seq: [
				{
					end: "__prefetchEnd.endEvent",
					seq: {
						repeatCount: "indefinite",
						video: {
							src: "http://butikstv.centrumkanalen.com/play/media/ladd/landscape.mp4",
						},
					},
				},
				{
					prefetch: [
						{
							src: "http://butikstv.centrumkanalen.com/play/media/rendered/filmer/9820.mp4",
						},
						{
							src: "http://butikstv.centrumkanalen.com/play/media/filmer/likabehandlingsdag2020.mp4",
						},
						{
							src: "http://butikstv.centrumkanalen.com/play/media/filmer/untitled.mp4",
						},
						{
							src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/10510.png",
						},
						{
							src: "http://butikstv.centrumkanalen.com/play/render/widgets/ebbapettersson/top/top.wgt",
						},
						{
							src: "http://butikstv.centrumkanalen.com/play/render/widgets/ebbapettersson/vasttrafik/vasttrafik_news.wgt",
						},
						{
							src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbalunch.png",
						},
						{
							src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbaical.png",
						},
					],
					seq: {
						id: "__prefetchEnd",
						dur: "1s",
					},
				},
			],
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
							begin: "wallclock(R/2011-01-01T07:00:00/P1D)",
							end: "wallclock(R/2011-01-01T17:00:00/P1D)",
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
											par: [
												{
													repeatCount: "indefinite",
													seq: [
														{
															dur: "60s",
														},
														{
															prefetch: [
																{
																	src: "http://butikstv.centrumkanalen.com/play/render/widgets/ebbapettersson/top/top.wgt",
																},
																{
																	src: "http://butikstv.centrumkanalen.com/play/render/widgets/ebbapettersson/vasttrafik/vasttrafik_news.wgt",
																},
																{
																	src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbalunch.png",
																},
																{
																	src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbaical.png",
																},
															],
														},
													],
												},
												{
													seq: {
														repeatCount: "indefinite",
														ref: {
															src: "http://butikstv.centrumkanalen.com/play/render/widgets/ebbapettersson/top/top.wgt",
															type: "application/widget",
															region: "widget11",
															dur: "60s",
															param: {
																name: "cacheControl",
																value: "onlyIfCached",
															},
														},
													},
												},
												{
													seq: {
														repeatCount: "indefinite",
														ref: {
															src: "http://butikstv.centrumkanalen.com/play/render/widgets/ebbapettersson/vasttrafik/vasttrafik_news.wgt",
															type: "application/widget",
															region: "widget12",
															dur: "60s",
															param: {
																name: "cacheControl",
																value: "onlyIfCached",
															},
														},
													},
												},
												{
													seq: {
														begin: "trigger",
														img: {
															src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbalunch.png",
															region: "widget13",
															dur: "60s",
															param: {
																name: "cacheControl",
																value: "onlyIfCached",
															},
														},
													},
												},
												{
													seq: {
														begin: "trigger2",
														img: {
															src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbaical.png",
															region: "widget14",
															dur: "60s",
															param: {
																name: "cacheControl",
																value: "onlyIfCached",
															},
														},
													},
												},
											],
											seq: {
												begin: "trigger3",
												video: [
													{
														src: "http://butikstv.centrumkanalen.com/play/media/rendered/filmer/9820.mp4",
														id: "annons0",
														fit: "hidden",
														region: "video",
														param: {
															name: "cacheControl",
															value: "auto",
														},
													},
													{
														src: "http://butikstv.centrumkanalen.com/play/media/filmer/likabehandlingsdag2020.mp4",
														id: "annons1",
														fit: "hidden",
														region: "video",
														param: {
															name: "cacheControl",
															value: "auto",
														},
													},
													{
														src: "http://butikstv.centrumkanalen.com/play/media/filmer/untitled.mp4",
														id: "annons2",
														fit: "hidden",
														region: "video",
														param: {
															name: "cacheControl",
															value: "auto",
														},
													},
												],
												img: {
													src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/10510.png",
													id: "annons3",
													dur: "40s",
													fit: "hidden",
													region: "video",
													param: {
														name: "cacheControl",
														value: "auto",
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
			},
		},
	},
	video: [
		{
			src: "http://butikstv.centrumkanalen.com/play/media/ladd/landscape.mp4",
		},
		{
			src: "http://butikstv.centrumkanalen.com/play/media/rendered/filmer/9820.mp4",
			id: "annons0",
			fit: "hidden",
			region: "video",
			param: {
				name: "cacheControl",
				value: "auto",
			},
		},
		{
			src: "http://butikstv.centrumkanalen.com/play/media/filmer/likabehandlingsdag2020.mp4",
			id: "annons1",
			fit: "hidden",
			region: "video",
			param: {
				name: "cacheControl",
				value: "auto",
			},
		},
		{
			src: "http://butikstv.centrumkanalen.com/play/media/filmer/untitled.mp4",
			id: "annons2",
			fit: "hidden",
			region: "video",
			param: {
				name: "cacheControl",
				value: "auto",
			},
		},
	],
	img: [
		{
			src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbalunch.png",
			region: "widget13",
			dur: "60s",
			param: {
				name: "cacheControl",
				value: "onlyIfCached",
			},
		},
		{
			src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbaical.png",
			region: "widget14",
			dur: "60s",
			param: {
				name: "cacheControl",
				value: "onlyIfCached",
			},
		},
		{
			src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/10510.png",
			id: "annons3",
			dur: "40s",
			fit: "hidden",
			region: "video",
			param: {
				name: "cacheControl",
				value: "auto",
			},
		},
	],
	ref: [
		{
			src: "http://butikstv.centrumkanalen.com/play/render/widgets/ebbapettersson/top/top.wgt",
			type: "application/widget",
			region: "widget11",
			dur: "60s",
			param: {
				name: "cacheControl",
				value: "onlyIfCached",
			},
		},
		{
			src: "http://butikstv.centrumkanalen.com/play/render/widgets/ebbapettersson/vasttrafik/vasttrafik_news.wgt",
			type: "application/widget",
			region: "widget12",
			dur: "60s",
			param: {
				name: "cacheControl",
				value: "onlyIfCached",
			},
		},
	],
	audio: [],
	intro: [
		{
			repeatCount: "indefinite",
			video: {
				src: "http://butikstv.centrumkanalen.com/play/media/ladd/landscape.mp4",
			},
		},
	],
	triggers: {
		trigger: {
			begin: "trigger",
			img: {
				src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbalunch.png",
				region: "widget13",
				dur: "60s",
				param: {
					name: "cacheControl",
					value: "onlyIfCached",
				},
			},
		},
		trigger2: {
			begin: "trigger2",
			img: {
				src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbaical.png",
				region: "widget14",
				dur: "60s",
				param: {
					name: "cacheControl",
					value: "onlyIfCached",
				},
			},
		},
		trigger3: {
			begin: "trigger3",
			video: [
				{
					src: "http://butikstv.centrumkanalen.com/play/media/rendered/filmer/9820.mp4",
					id: "annons0",
					fit: "hidden",
					region: "video",
					param: {
						name: "cacheControl",
						value: "auto",
					},
				},
				{
					src: "http://butikstv.centrumkanalen.com/play/media/filmer/likabehandlingsdag2020.mp4",
					id: "annons1",
					fit: "hidden",
					region: "video",
					param: {
						name: "cacheControl",
						value: "auto",
					},
				},
				{
					src: "http://butikstv.centrumkanalen.com/play/media/filmer/untitled.mp4",
					id: "annons2",
					fit: "hidden",
					region: "video",
					param: {
						name: "cacheControl",
						value: "auto",
					},
				},
			],
			img: {
				src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/10510.png",
				id: "annons3",
				dur: "40s",
				fit: "hidden",
				region: "video",
				param: {
					name: "cacheControl",
					value: "auto",
				},
			},
		},
	},
};
