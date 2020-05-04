export const defaults = {
	videoOptions: {
		background: false,
	},
	smil: {
		smilLocation: 'https://butikstv.centrumkanalen.com/play/smil/234.smil',
	},
	constants: {
		extractedElements: ['video', 'audio', 'img', 'ref'],
		cssElementsPosition: ['left', 'top', 'bottom', 'width', 'height'],
		cssElements: ['z-index', 'backgroundColor'],
		flowElements: ['seq', 'par'],
		defaultRegion: {
			regionName: 'default',
			left: 0,
			top: 0,
			width: 1280,
			height: 720,
		},
	},
};
