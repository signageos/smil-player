export const mockSMILFileParsed99 = {
	region: {
		video: {
			regionName: "video",
			left: "0",
			top: "0",
			width: "1280",
			height: "720",
			"z-index": "1",
			backgroundColor: "#FFFFFF",
			mediaAlign: "topLeft"
		},
		widget11: {
			regionName: "widget11",
			left: "0",
			top: "0",
			width: "1920",
			height: "68",
			"z-index": "9",
			backgroundColor: "transparent"
		},
		widget12: {
			regionName: "widget12",
			left: "0",
			bottom: "0",
			width: "1280",
			height: "360",
			"z-index": "1",
			backgroundColor: "transparent"
		},
		widget13: {
			regionName: "widget13",
			left: "1280",
			top: "0",
			width: "640",
			height: "506",
			"z-index": "1",
			backgroundColor: "transparent"
		},
		widget14: {
			regionName: "widget14",
			left: "1280",
			top: "506",
			width: "640",
			height: "574",
			"z-index": "1",
			backgroundColor: "transparent"
		}
	},
	rootLayout: {
		width: "1920",
		height: "1080",
		backgroundColor: "#FFFFFF"
	},
	playlist: {
		par: {
			seq: [
				{
					seq: {
						video: {
							src: "http://butikstv.centrumkanalen.com/play/media/ladd/landscape.mp4"
						}
					}
				}
			],
			par: {
				excl: {
					priorityClass: [
						{
							par: {
								seq: {
									excl: {
										priorityClass: {
											par: {
												par: [
													{
														seq: {
															ref: {
																src: "http://butikstv.centrumkanalen.com/play/render/widgets/ebbapettersson/top/top.wgt",
																type: "application/widget",
																region: "widget11",
																dur: "60s",
																param: {
																	name: "cacheControl",
																	value: "onlyIfCached"
																}
															}
														}
													},
													{
														seq: {
															ref: {
																src: "http://butikstv.centrumkanalen.com/play/render/widgets/ebbapettersson/vasttrafik/vasttrafik_news.wgt",
																type: "application/widget",
																region: "widget12",
																dur: "60s",
																param: {
																	name: "cacheControl",
																	value: "onlyIfCached"
																}
															}
														}
													},
													{
														seq: {
															img: {
																src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbalunch.png",
																region: "widget13",
																dur: "60s",
																param: {
																	name: "cacheControl",
																	value: "onlyIfCached"
																}
															}
														}
													},
													{
														seq: {
															img: {
																src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbaical.png",
																region: "widget14",
																dur: "60s",
																param: {
																	name: "cacheControl",
																	value: "onlyIfCached"
																}
															}
														}
													}
												],
												seq: {
													video: [
														{
															src: "http://butikstv.centrumkanalen.com/play/media/rendered/filmer/9820.mp4",
															id: "annons0",
															fit: "hidden",
															region: "video",
															param: {
																name: "cacheControl",
																value: "auto"
															}
														},
														{
															src: "http://butikstv.centrumkanalen.com/play/media/filmer/likabehandlingsdag2020.mp4",
															id: "annons1",
															fit: "hidden",
															region: "video",
															param: {
																name: "cacheControl",
																value: "auto"
															}
														},
														{
															src: "http://butikstv.centrumkanalen.com/play/media/filmer/untitled.mp4",
															id: "annons2",
															fit: "hidden",
															region: "video",
															param: {
																name: "cacheControl",
																value: "auto"
															}
														}
													],
													img: {
														src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/10510.png",
														id: "annons3",
														dur: "40s",
														fit: "hidden",
														region: "video",
														param: {
															name: "cacheControl",
															value: "auto"
														}
													}
												}
											}
										}
									}
								}
							}
						},
						{
							par: {
								seq: {
									ref: {
										dur: "indefinite",
										src: "adapi:blankScreen"
									}
								}
							}
						}
					]
				}
			}
		}
	},
	video: [
		{
			src: "http://butikstv.centrumkanalen.com/play/media/ladd/landscape.mp4"
		},
		{
			src: "http://butikstv.centrumkanalen.com/play/media/rendered/filmer/9820.mp4",
			id: "annons0",
			fit: "hidden",
			region: "video",
			param: {
				name: "cacheControl",
				value: "auto"
			}
		},
		{
			src: "http://butikstv.centrumkanalen.com/play/media/filmer/likabehandlingsdag2020.mp4",
			id: "annons1",
			fit: "hidden",
			region: "video",
			param: {
				name: "cacheControl",
				value: "auto"
			}
		},
		{
			src: "http://butikstv.centrumkanalen.com/play/media/filmer/untitled.mp4",
			id: "annons2",
			fit: "hidden",
			region: "video",
			param: {
				name: "cacheControl",
				value: "auto"
			}
		}
	],
	img: [
		{
			src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbalunch.png",
			region: "widget13",
			dur: "60s",
			param: {
				name: "cacheControl",
				value: "onlyIfCached"
			}
		},
		{
			src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/ebbaical.png",
			region: "widget14",
			dur: "60s",
			param: {
				name: "cacheControl",
				value: "onlyIfCached"
			}
		},
		{
			src: "http://butikstv.centrumkanalen.com/play/media/rendered/bilder/10510.png",
			id: "annons3",
			dur: "40s",
			fit: "hidden",
			region: "video",
			param: {
				name: "cacheControl",
				value: "auto"
			}
		}
	],
	ref: [
		{
			src: "http://butikstv.centrumkanalen.com/play/render/widgets/ebbapettersson/top/top.wgt",
			type: "application/widget",
			region: "widget11",
			dur: "60s",
			param: {
				name: "cacheControl",
				value: "onlyIfCached"
			}
		},
		{
			src: "http://butikstv.centrumkanalen.com/play/render/widgets/ebbapettersson/vasttrafik/vasttrafik_news.wgt",
			type: "application/widget",
			region: "widget12",
			dur: "60s",
			param: {
				name: "cacheControl",
				value: "onlyIfCached"
			}
		},
		{
			dur: "indefinite",
			src: "adapi:blankScreen"
		}
	],
	audio: []
};
