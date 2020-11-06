export const mockParsedNestedRegion = {
	regionName: "video",
	left: 10,
	top: 10,
	width: 1280,
	height: 720,
	"z-index": "1",
	backgroundColor: "#FFFFFF",
	mediaAlign: "topLeft",
	region: [{
		regionName: "video1",
		left: 10,
		top: 10,
		width: 640,
		height: 720,
		"z-index": "1",
		backgroundColor: "transparent",
	},
	{
		regionName: "video2",
		left: 650,
		top: 10,
		width: 640,
		height: 720,
		"z-index": "1",
		backgroundColor: "transparent",
	},
	],
};

export const mockParsedNestedRegionNoTopLeft = {
	regionName: "video",
	width: 1280,
	height: 720,
	"z-index": "1",
	backgroundColor: "#FFFFFF",
	mediaAlign: "topLeft",
	region: [{
		regionName: "video1",
		left: 0,
		top: 0,
		width: 640,
		height: 720,
		"z-index": "1",
		backgroundColor: "transparent",
	},
		{
			regionName: "video2",
			left: 0,
			top: 0,
			width: 640,
			height: 720,
			"z-index": "1",
			backgroundColor: "transparent",
		},
	],
};

export const mockParsed234Region = {
	regionName: "video",
	left: 0,
	top: 0,
	width: 1080,
	height: 1920,
	"z-index": "1",
	backgroundColor: "#FFFFFF",
	mediaAlign: "center",
};

export const mockParsed234Layout = {
	width: 1080,
	height: 1920,
	left: 0,
	top: 0,
	backgroundColor: "#FFFFFF",
};
