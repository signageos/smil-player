/* tslint:disable: missing whitespace */
import get = require('lodash/get');
import set = require('lodash/set');
import isNil = require('lodash/isNil');
import isObject = require('lodash/isObject');

import { RegionAttributes } from '../../../models/xmlJsonModels';
import { debug, generateElementId, removeDigits } from './generalTools';
import { XmlTags } from '../../../enums/xmlEnums';
import { HtmlEnum, ObjectFitEnum } from '../../../enums/htmlEnums';
import { SMILImage, SMILMediaNoVideo, SMILWidget, SosHtmlElement } from '../../../models/mediaModels';
import { PlaylistElement } from '../../../models/playlistModels';
import { SMILTriggersEnum } from '../../../enums/triggerEnums';
import { ParsedTriggerCondition, TriggerEndless } from '../../../models/triggerModels';
import { SMILFileObject } from '../../../models/filesModels';
import { copyQueryParameters, createVersionedUrl } from '../../files/tools';
import { CssElementsPosition } from '../../../models/htmlModels';
import { BillboardTransition, BillboardTransitionDirection } from '../../../enums/transitionEnums';
import { setElementDuration } from './scheduleTools';

export function createHtmlElement(
	value: SMILImage | SMILWidget,
	htmlElement: string,
	filepath: string,
	regionInfo: RegionAttributes,
	key: string,
	elementSrc: string,
	isSpecial: boolean = false,
): HTMLElement {
	let element: HTMLElement;
	// special case when image is represented as <ol><li> object due to billboard transition
	if (htmlElement === HtmlEnum.img && value.transitionInfo?.type === 'billboard') {
		const columnCount = value.transitionInfo.columnCount || BillboardTransition.defaultColumnCount;
		element = document.createElement('ol');
		element.style.listStyle = 'none';
		element.style.padding = '0px';
		element.style.margin = '0px';

		for (let i = 0; i < columnCount; i++) {
			const liElement = document.createElement('li');
			const divElement = document.createElement('div');
			liElement.style.display = 'inline';
			liElement.style.float = 'left';
			liElement.style.paddingLeft = '0px';

			divElement.style.height = `${regionInfo.height}px`;
			divElement.style.width = `${regionInfo.width / columnCount + 2}px`;
			divElement.style.setProperty('background-position', `-${i * (regionInfo.width / columnCount)}px 0`);
			divElement.style.setProperty('margin-left', `${i * (regionInfo.width / columnCount)}px`);
			divElement.style.position = 'absolute';
			divElement.style.webkitBackfaceVisibility = 'hidden';
			divElement.style.webkitTransitionProperty = '-webkit-transform';

			liElement.appendChild(divElement);
			element.appendChild(liElement);
		}
	} else {
		element = document.createElement(htmlElement);
	}

	element.id = generateElementId(filepath, regionInfo.regionName, key);
	Object.keys(regionInfo).forEach((attr: string) => {
		if (XmlTags.cssElementsPosition.includes(attr)) {
			element.style[attr as keyof CssElementsPosition] =
				element.style[attr as keyof CssElementsPosition] || `${regionInfo[attr]}px`;
		}
		if (XmlTags.cssElements.includes(attr)) {
			element.style[attr as keyof CssElementsPosition] = regionInfo[attr];
		}
		if (XmlTags.additionalCssExtract.includes(attr)) {
			element.style.objectFit = get(ObjectFitEnum, `${regionInfo[attr]}`, 'fill');
		}
	});
	element.style.position = 'absolute';
	element.style.backgroundColor = 'transparent';
	element.style.borderWidth = '0px';

	element.style.visibility = 'hidden';
	// set filePAth for trigger images immediately
	if (isSpecial) {
		let src = generateElementSrc(elementSrc, filepath);
		element.setAttribute('src', src);
	}

	if (htmlElement === HtmlEnum.ref) {
		element.setAttribute('allow', HtmlEnum.widgetAllow);
	}

	return element;
}

export function generateElementSrc(
	elementSrc: string,
	localFilePath: string,
	playlistVersion: number = 0,
	smilUrlVersion: string | null = null,
	isWidget: boolean = false,
): string {
	// BrightSign does not support query parameters in filesystem
	let src = createVersionedUrl(localFilePath, playlistVersion, smilUrlVersion, isWidget);
	// TODO this would not work & break BS. Solve it other way in future before merge
	src = copyQueryParameters(elementSrc, src);
	return src;
}

export function changeZIndex(
	value: SMILMediaNoVideo,
	element: HTMLElement,
	transitionConstant: number,
	useValueZIndex: boolean = true,
): void {
	const valueZIndex = HtmlEnum.zIndex in value ? parseInt(value[HtmlEnum.zIndex]) : 0;
	const currentElementZIndex = parseInt(element?.style.getPropertyValue(HtmlEnum.zIndex));
	let resultZIndex = useValueZIndex ? valueZIndex : 0;
	if ('transitionInfo' in value) {
		resultZIndex = transitionConstant + valueZIndex;

		// return zIndex to its start value
		if (transitionConstant < 0) {
			resultZIndex = transitionConstant - valueZIndex;
		}
	} else {
		// return zIndex to its start value
		if (transitionConstant < 0) {
			resultZIndex = -valueZIndex;
		}
	}

	// zIndex value is already set on element ( one element in loop case )
	if (resultZIndex < currentElementZIndex && !('transitionInfo' in value)) {
		resultZIndex = 0;
	}
	debug('changing zIndex for element: %O : %s', element, resultZIndex);
	element?.style.setProperty(HtmlEnum.zIndex, `${currentElementZIndex + resultZIndex}`);
}

/**
 * Creates DOM elements for all images and widgets in playlist ( without src, just placeholders )
 * @param value - Smil image or Smil widget
 * @param htmlElement - which htmlElement should be created in DOM ( img or iframe )
 * @param key - tag of media in xml ( img, video etc...)
 * @param isSpecial - determines if element is trigger element, dynamic playlist or ordinary one
 * ( trigger and dynamic playlist is played on demand )
 */
export function createDomElement(
	value: SMILImage | SMILWidget,
	htmlElement: string,
	key: string,
	isSpecial: boolean = false,
): string {
	const elementId = generateElementId(value.localFilePath, value.regionInfo.regionName, key);
	debug('creating element: %s' + elementId);
	if (document.getElementById(elementId)) {
		debug('element already exists: %s' + elementId);
		return elementId;
	}
	const localFilePath = value.localFilePath !== '' ? value.localFilePath : value.src;
	const element = createHtmlElement(value, htmlElement, localFilePath, value.regionInfo, key, value.src, isSpecial);
	document.body.appendChild(element);
	return element.id;
}

type ObjectWithStringKeys = Record<string, any>;

export function extractAttributesByPrefix<T extends ObjectWithStringKeys>(obj: T, prefix: string): Partial<T> {
	const result: Partial<T> = {};
	for (const key in obj) {
		if (key.startsWith(prefix)) {
			result[key] = obj[key];
		}
	}
	return result;
}

export function resetBodyContent() {
	try {
		for (let i = document.images.length; i-- > 0; ) {
			debug('Removing images');
			if (!isNil(document.images[i])) {
				document.images[i].parentNode!.removeChild(document.images[i]);
			}
		}
	} catch (err) {
		debug('Error: %O during removing image: %O', err, document.images[document.images?.length]);
	}

	// reset body content
	document.body.innerHTML = '';
	document.body.style.backgroundColor = 'transparent';
	resetBodyMargin();
	// remove background image
	document.body.style.background = 'none';
}

export function resetBodyMargin() {
	document.body.style.margin = '0px';
}

export function setTransitionsDefinition(smilObject: SMILFileObject) {
	if (Object.keys(smilObject.transition).length > 0 && isNil(document.getElementById(HtmlEnum.transitionStyleId))) {
		const cssFadeOut = `@keyframes fadeOut {
			  0% {
				opacity:1;
			  }
			  100% {
				opacity:0;
			  }
			}

			@-moz-keyframes fadeOut {
			  0% {
				opacity:1;
			  }
			  100% {
				opacity:0;
			  }
			}

			@-webkit-keyframes fadeOut {
			  0% {
				opacity:1;
			  }
			  100% {
				opacity:0;
			  }
			}

			@-o-keyframes fadeOut {
			  0% {
				opacity:1;
			  }
			  100% {
				opacity:0;
			  }
			}

			@-ms-keyframes fadeOut {
			  0% {
				opacity:1;
			  }
			  100% {
				opacity:0;
			}`;

		const cssBillboard = `@-webkit-keyframes rotate {
			from {
					-webkit-transform: rotateY(0deg);
			}
			to {
					-webkit-transform: rotateY(135deg);
			}
		}`;

		const style = document.createElement('style') as any;
		style.id = HtmlEnum.transitionStyleId;
		if (style.styleSheet) {
			style.styleSheet.cssText = cssBillboard.concat(cssFadeOut);
		} else {
			style.appendChild(document.createTextNode(cssBillboard.concat(cssFadeOut)));
		}

		document.getElementsByTagName('head')[0].appendChild(style);
	}
}

export function setTransitionCss(
	element: SosHtmlElement,
	htmlElement: HTMLElement,
	nextElementId: string,
	transitionDuration: number,
) {
	const nextElementHtml = document.getElementById(nextElementId);
	nextElementHtml?.style.setProperty('visibility', 'visible');
	// because of seamless update next element sometimes does not have zIndex set to original value
	nextElementHtml?.style.setProperty(HtmlEnum.zIndex, `${parseInt(htmlElement.style.zIndex) - 1}`);
	if (element.transitionInfo?.subtype === 'billboard') {
		htmlElement.childNodes.forEach((child: HTMLElement) => {
			child.childNodes.forEach((div: HTMLElement) => {
				div.style.setProperty(
					'-webkit-animation',
					`rotate ${Math.min(transitionDuration * 1.5, setElementDuration(element.dur))}ms linear`,
				);
				div.style.setProperty('-webkit-animation-iteration-count', '1');
				div.style.setProperty(
					'-webkit-transform-origin',
					BillboardTransitionDirection[element.transitionInfo?.direction!] ||
						BillboardTransition.defaultDirection,
				);
			});
		});
	}

	if (element.transitionInfo?.subtype === 'crossfade') {
		const transitionString = `fadeOut ease ${transitionDuration}ms forwards`;

		htmlElement.style.setProperty('animation', transitionString);
		htmlElement.style.setProperty('-webkit-animation', transitionString);
		htmlElement.style.setProperty('-moz-animation', transitionString);
		htmlElement.style.setProperty('-o-animation', transitionString);
		htmlElement.style.setProperty('-ms-animation', transitionString);
		htmlElement.style.setProperty('-webkit-backface-visibility', 'hidden');
	}
}

export function removeTransitionCss(element: HTMLElement) {
	element.childNodes.forEach((child: HTMLElement) => {
		child.childNodes.forEach((div: HTMLElement) => {
			div.style.removeProperty('-webkit-animation');
			div.style.removeProperty('-webkit-animation-iteration-count');
			div.style.removeProperty('-webkit-transform-origin');
		});
	});

	element.style.removeProperty('animation');
	element.style.removeProperty('-webkit-animation');
	element.style.removeProperty('-moz-animation');
	element.style.removeProperty('-o-animation');
	element.style.removeProperty('-ms-animation');
	element.style.removeProperty('-webkit-backface-visibility');
}

export function addEventOnTriggerWidget(
	elem: PlaylistElement,
	triggerEndless: TriggerEndless,
	triggerInfo: { condition: ParsedTriggerCondition[]; stringCondition: string; trigger: string },
): void {
	for (let [key, value] of Object.entries(elem)) {
		if (removeDigits(key) === 'ref') {
			setupIframeEventListeners(get(value, 'id'), triggerEndless, triggerInfo);
		}
		if (isObject(value)) {
			return addEventOnTriggerWidget(value, triggerEndless, triggerInfo);
		}
	}
}

function setupIframeEventListeners(
	iframeId: string,
	triggerEndless: TriggerEndless,
	triggerInfo: { condition: ParsedTriggerCondition[]; stringCondition: string; trigger: string },
) {
	const iframe: any = document.getElementById(iframeId);
	let iDoc = iframe.contentWindow || iframe.contentDocument;
	if (iDoc.document) {
		iDoc = iDoc.document;
		iDoc.body.addEventListener(SMILTriggersEnum.mouseEventType, async () => {
			set(triggerEndless, `${triggerInfo.trigger}.latestEventFired`, Date.now());
		});

		iDoc.body.addEventListener(SMILTriggersEnum.touchEventType, async () => {
			set(triggerEndless, `${triggerInfo.trigger}.latestEventFired`, Date.now());
		});
	}
}
