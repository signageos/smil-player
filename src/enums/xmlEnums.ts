import { SMILDynamicEnum } from './dynamicEnums';

export const XmlTags = {
	extractedElements: ['video', 'audio', 'img', 'ref'],
	dynamicPlaylist: [SMILDynamicEnum.emitDynamic, SMILDynamicEnum.emitDynamicLegacy],
	textElements: ['ticker'],
	structureTags: ['seq', 'par', 'excl', 'priorityClass'],
	indexedStructureTags: ['par'],
	cssElementsPosition: ['left', 'right', 'top', 'bottom', 'width', 'height'],
	cssElements: ['z-index'],
	additionalCssExtract: ['fit'],
	regionNameAlias: 'xml:id',
};
